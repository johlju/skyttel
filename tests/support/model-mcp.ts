import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { toResponseInputItems } from 'openai/lib/responses/ResponseInputItems';
import type { ResponseInputItem } from 'openai/resources/responses/responses';
import type { textModel } from '../../src/server/text-assistant-model.js';

export type ModelResponder = ReturnType<typeof textModel>;
type ModelTurn = {
  message: string;
  calls: { name: string; arguments: Record<string, unknown>; result: unknown }[];
  reply: string;
};

// This is an external MCP client: it deliberately has no first-party save-intent
// filter. The model must interpret the server's real initialization instructions.
export async function modelMcpClient(origin: string, token: string, respond: ModelResponder) {
  const client = new Client({ name: 'Skyttel språkprov', version: '1' });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
      }),
    );
    const instructions = client.getInstructions();
    if (!instructions) throw new Error('The MCP server did not supply instructions');
    const tools = (await client.listTools()).tools.map((tool) => ({
      type: 'function' as const,
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
      strict: false,
    }));
    const input: ResponseInputItem[] = [];
    const turns: ModelTurn[] = [];
    let requests = 0;
    return {
      close: () => client.close(),
      turns,
      async turn(message: string) {
        const turn: ModelTurn = { message, calls: [], reply: '' };
        turns.push(turn);
        input.push({ role: 'user', content: message });
        const signal = AbortSignal.timeout(120_000);
        for (let iteration = 0; iteration < 12; iteration++) {
          signal.throwIfAborted();
          if (++requests > 32 || JSON.stringify(input).length > 500_000)
            throw new Error('The model evaluation exceeded its bounded request or context limit');
          let response: Awaited<ReturnType<ModelResponder>>;
          try {
            response = await respond(instructions, input, tools, signal);
          } catch {
            // Provider errors may carry headers or request bodies. Report only
            // the outcome; the separately recorded usage metadata is bounded.
            throw new Error('The model provider request failed; check private provider access');
          }
          if (response.status !== 'completed')
            throw new Error('The model provider returned an incomplete response');
          signal.throwIfAborted();
          input.push(...toResponseInputItems(response.output));
          const requested = response.output.filter((item) => item.type === 'function_call');
          if (!requested.length) {
            turn.reply = response.output_text;
            return turn;
          }
          for (const call of requested) {
            signal.throwIfAborted();
            const args: unknown = JSON.parse(call.arguments);
            if (!args || typeof args !== 'object' || Array.isArray(args))
              throw new Error('The model returned invalid MCP tool arguments');
            const observed = {
              name: call.name,
              arguments: args as Record<string, unknown>,
              result: null as unknown,
            };
            turn.calls.push(observed);
            const result = await client.callTool(
              {
                name: call.name,
                arguments: args as Record<string, unknown>,
              },
              undefined,
              { signal },
            );
            observed.result = result;
            input.push({
              type: 'function_call_output',
              call_id: call.call_id,
              output: JSON.stringify(result),
            });
          }
        }
        throw new Error('The model did not finish within 12 provider requests');
      },
    };
  } catch (error) {
    await client.close();
    throw error;
  }
}

export function realModelKey(environment: NodeJS.ProcessEnv = process.env) {
  if (environment.SKYTTEL_REAL_MODEL_TESTS !== '1')
    throw new Error('Set SKYTTEL_REAL_MODEL_TESTS=1 to explicitly enable billable model tests');
  const key = environment.OPENAI_API_KEY?.trim();
  if (!key) throw new Error('Real model tests require OPENAI_API_KEY in the private environment');
  return key;
}
