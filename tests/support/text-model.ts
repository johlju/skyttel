import { randomUUID } from 'node:crypto';

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
export function textModel(
  respond: (request: ModelRequest, signal?: AbortSignal | null) => unknown[] | Promise<unknown[]>,
) {
  const requests: ModelRequest[] = [];
  const provider: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as ModelRequest;
    requests.push(body);
    const output = await respond(body, init?.signal);
    return Response.json(
      {
        id: `resp_${randomUUID()}`,
        object: 'response',
        created_at: 1,
        status: 'completed',
        model: 'gpt-5.6-terra',
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
  return { provider, requests };
}
export function lastToolResult(request: ModelRequest) {
  const item = request.input.findLast((item) => item.type === 'function_call_output');
  return item ? JSON.parse(String(item.output)) : null;
}
