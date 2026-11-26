import { EventEmitter, once } from 'node:events';
import {
  Agent,
  type FunctionTool,
  type Model,
  Runner,
  setSensitiveDataLoggingEnabled,
  ToolCallError,
  Usage,
} from '@openai/agents';
import type {
  ResponseFunctionToolCall,
  ResponseInputItem,
  ResponseUsage,
} from 'openai/resources/responses/responses';
import type { mapAgentTools } from './map-agent-tools.js';
import { MapError } from './map-error.js';

export type MapAgentCall = Pick<ResponseFunctionToolCall, 'name' | 'call_id' | 'arguments'>;

interface ToolRound {
  calls: MapAgentCall[];
  parallelReadCount: number;
  checkSnapshot?: () => void;
  usage?: ResponseUsage;
  execute: (action: MapAgentCall, signal?: AbortSignal) => Promise<unknown>;
  finish: () => boolean;
}

setSensitiveDataLoggingEnabled(false);
const runner = new Runner({ tracingDisabled: true, traceIncludeSensitiveData: false });

/** The conversation supplies the refreshed, capacity-limited context for each
 * request to its observed model client. The Runner owns tool invocation,
 * result association, continuation and the turn limit for this assignment. */
export async function runMapAgent(
  catalog: ReturnType<typeof mapAgentTools>['tools'],
  signal: AbortSignal,
  recordResults: (items: ResponseInputItem[]) => void,
  next: () => Promise<ToolRound | { text: string; usage?: ResponseUsage } | undefined>,
) {
  const toolExecution = { maxFunctionToolConcurrency: 1 };
  let execute: (call: MapAgentCall, signal?: AbortSignal) => Promise<unknown>;
  let currentRound: ToolRound;
  const model: Model = {
    async getResponse() {
      const round = await next();
      const usage = new Usage(round?.usage);
      if (!round || 'text' in round)
        return {
          usage,
          output: [
            {
              type: 'message',
              role: 'assistant',
              status: 'completed',
              content: [{ type: 'output_text', text: round?.text ?? '' }],
            },
          ],
        };
      currentRound = round;
      execute = (call) => round.execute(call);
      // Only server-declared independent reads may share a snapshot in parallel.
      // Reports follow their companion reads and map selections in order.
      toolExecution.maxFunctionToolConcurrency = Math.max(1, round.parallelReadCount);
      if (round.parallelReadCount > 1) {
        const completed = new EventEmitter();
        const siblings = new AbortController();
        let count = 0;
        execute = async (call, toolSignal) => {
          const index = round.calls.findIndex((action) => action.call_id === call.call_id);
          if (index >= round.parallelReadCount)
            while (count < index) await once(completed, 'done', { signal: toolSignal });
          // A failed sibling releases outstanding reads. On user cancellation
          // the task guard rejects the result after recording its MCP outcome.
          const cancelSiblings = () => {
            if (!signal.aborted) siblings.abort(toolSignal?.reason);
          };
          if (toolSignal?.aborted) cancelSiblings();
          else toolSignal?.addEventListener('abort', cancelSiblings, { once: true });
          try {
            const result = await round.execute(call, siblings.signal);
            count++;
            completed.emit('done');
            return result;
          } finally {
            toolSignal?.removeEventListener('abort', cancelSiblings);
          }
        };
      }
      return {
        usage,
        output: round.calls.map(({ name, arguments: args, call_id }) => ({
          type: 'function_call',
          name,
          arguments: args,
          callId: call_id,
        })),
      };
    },
    getStreamedResponse() {
      throw new Error('Map assignments use complete responses');
    },
  };
  const tools: FunctionTool[] = catalog.map((definition) => ({
    type: 'function',
    name: definition.name,
    description: definition.description ?? '',
    parameters: {
      ...definition.parameters,
      properties: definition.parameters.properties ?? {},
      required: definition.parameters.required ?? [],
      additionalProperties: definition.parameters.additionalProperties !== false,
    },
    strict: false,
    needsApproval: async () => false,
    isEnabled: async () => true,
    invoke: async (_context, args, details) => {
      const callId = details?.toolCall?.callId;
      if (!callId) throw new MapError('invalid_request', 400);
      return JSON.stringify(
        await execute({ name: definition.name, arguments: args, call_id: callId }, details?.signal),
      );
    },
  }));
  const agent = new Agent({
    name: 'Skyttel',
    model,
    tools,
    toolUseBehavior: (_context, results) => {
      currentRound.checkSnapshot?.();
      recordResults(
        results.map((result) => {
          if (result.type !== 'function_output') throw new MapError('invalid_request', 400);
          const item = result.runItem.rawItem;
          if (
            item.type !== 'function_call_result' ||
            typeof item.output === 'string' ||
            Array.isArray(item.output) ||
            item.output.type !== 'text'
          )
            throw new MapError('invalid_request', 400);
          return { type: 'function_call_output', call_id: item.callId, output: item.output.text };
        }),
      );
      return currentRound.finish()
        ? { isFinalOutput: true, isInterrupted: undefined, finalOutput: '' }
        : { isFinalOutput: false, isInterrupted: undefined };
    },
  });
  try {
    await runner.run(agent, [], { signal, maxTurns: 48, toolExecution });
  } catch (error) {
    // Domain errors carry the checked recovery or clarification for this turn.
    if (error instanceof ToolCallError) throw error.error;
    throw error;
  }
}
