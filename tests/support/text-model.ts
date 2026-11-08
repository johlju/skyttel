import { randomUUID } from 'node:crypto';
import type { PendingPart, TextAssistantReview } from '../../src/shared/text-assistant.js';

export type ModelRequest = {
  model: string;
  reasoning: { effort: string };
  store: boolean;
  instructions: string;
  input: Record<string, unknown>[];
  tools: { name: string; strict: boolean; parameters: Record<string, unknown> }[];
};
export function modelMessage(text: string) {
  return {
    id: `msg_${randomUUID()}`,
    type: 'message',
    role: 'assistant',
    status: 'completed',
    content: [{ type: 'output_text', text, annotations: [] }],
  };
}
export function modelTool(name: string, args: Record<string, unknown>) {
  return {
    id: `fc_${randomUUID()}`,
    type: 'function_call',
    call_id: randomUUID(),
    name,
    arguments: JSON.stringify(args),
    status: 'completed',
  };
}
export function readOnlyScope() {
  return [
    modelMessage(
      JSON.stringify({
        mode: 'read',
        request: 'Besvara den aktuella frågan utan ändringar.',
        responseRequired: false,
      }),
    ),
  ];
}
export function textModel(
  respond: (request: ModelRequest, signal?: AbortSignal | null) => unknown[] | Promise<unknown[]>,
  authorization?: (
    request: ModelRequest,
    signal?: AbortSignal | null,
  ) => unknown[] | Promise<unknown[]>,
) {
  const requests: ModelRequest[] = [];
  const authorizationRequests: ModelRequest[] = [];
  const terminalWork = new Map<string, boolean>();
  const provider: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as ModelRequest;
    const isAuthorization = body.instructions.startsWith('SKYTTEL_TURN_');
    (isAuthorization ? authorizationRequests : requests).push(body);
    // Ordinary workflow tests assume an allowed interpretation. Security tests
    // supply each fallible decision explicitly; this default proves no model robustness.
    const output = isAuthorization
      ? await (
          authorization ??
          ((request) => [
            modelMessage(
              JSON.stringify(
                request.instructions.startsWith('SKYTTEL_TURN_SCOPE')
                  ? {
                      mode: 'work',
                      request: 'Perform the controlled test request.',
                      responseRequired: false,
                    }
                  : {
                      decision: 'allow',
                      complete: true,
                      fulfillsRequest:
                        terminalWork.get(
                          JSON.parse(String(request.input[0].content)).authority.current,
                        ) ?? false,
                    },
              ),
            ),
          ])
        )(body, init?.signal)
      : await respond(body, init?.signal);
    if (!isAuthorization) {
      // The generic fixture certifies only the existing explicit terminal
      // contract. Ordinary direct tools may be steps in a scripted workflow.
      // Tests for whole-request certification supply an independent decision.
      const calls = output.filter((item): item is ReturnType<typeof modelTool> =>
        Boolean(
          item && typeof item === 'object' && 'type' in item && item.type === 'function_call',
        ),
      );
      let message: unknown;
      try {
        const current: unknown = JSON.parse(
          String(body.input.findLast((item) => item.role === 'user')?.content),
        );
        if (current && typeof current === 'object' && 'message' in current)
          message = current.message;
      } catch {
        // External MCP clients send plain text and do not use the first-party
        // terminal-work certificate. Their scripted tool calls still run.
      }
      if (typeof message === 'string')
        terminalWork.set(
          message,
          !calls.length ||
            (calls.length === 1 &&
              (calls[0].name === 'save_draft' ||
                (calls[0].name === 'submit_changes' &&
                  JSON.parse(calls[0].arguments).continueResponse !== true))),
        );
    }
    return Response.json(
      {
        id: `resp_${randomUUID()}`,
        object: 'response',
        created_at: 1,
        status: 'completed',
        model: body.model,
        output,
        usage: {
          input_tokens: 120,
          output_tokens: 30,
          total_tokens: 150,
          input_tokens_details: { cached_tokens: 20, cache_write_tokens: 0 },
          output_tokens_details: { reasoning_tokens: 10 },
        },
      },
      { headers: { 'x-request-id': `request_${randomUUID()}` } },
    );
  };
  return { provider, requests, authorizationRequests };
}
export function pricedProvider(provider: typeof fetch): typeof fetch {
  return async (url, init) => {
    const response = await provider(url, init);
    return Response.json(
      { ...(await response.json()), service_tier: 'default' },
      { headers: response.headers },
    );
  };
}
export function failExplanation(
  model: ReturnType<typeof textModel>,
  failure: Response | (() => Response),
  shouldFail?: (request: ModelRequest) => boolean,
): typeof fetch {
  return async (input, init) => {
    const body = JSON.parse(String(init?.body)) as ModelRequest;
    if (
      !body.instructions.startsWith('SKYTTEL_TURN_') &&
      model.requests.length &&
      (!shouldFail || shouldFail(body))
    )
      return typeof failure === 'function' ? failure() : failure.clone();
    return model.provider(input, init);
  };
}
export function lastToolResult(request: ModelRequest) {
  const item = request.input.findLast((item) => item.type === 'function_call_output');
  return item ? JSON.parse(String(item.output)) : null;
}

/** Build a provider reply against the identities actually exposed by this turn. */
export function pendingUpdate(
  request: ModelRequest,
  question: string,
  extra: Record<string, unknown> = {},
) {
  const input = JSON.parse(String(request.input.findLast((item) => item.role === 'user')?.content));
  const result = lastToolResult(request);
  const parts: PendingPart[] = result?.pendingParts ?? input.pendingParts ?? [];
  const part = parts.find((part) => part.question === question);
  return {
    id: part?.id ?? 'unknown-part',
    revision: part?.revision ?? 0,
    action: 'clarify',
    messageId: input.messageId,
    evidence: input.message,
    ...extra,
  };
}

export function verifiedAnswers(request: ModelRequest, questions: string[]) {
  const input = JSON.parse(String(request.input.findLast((item) => item.role === 'user')?.content));
  const draft: TextAssistantReview = lastToolResult(request)?.review ?? input.draft;
  const expected = [
    ...draft.changes.map((change) => ({ kind: 'object', id: change.id, value: change.after })),
    ...(draft.relationships ?? []).map((change) => ({
      kind: 'relationship',
      id: change.id,
      value: change.after,
    })),
  ].filter((item) => item.value);
  return questions.map((question) => pendingUpdate(request, question, { expected }));
}
