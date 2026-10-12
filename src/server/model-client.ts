import OpenAI from 'openai';
import { Agent, fetch as transportFetch } from 'undici';

const dispatcher = new Agent({ headersTimeout: 0, bodyTimeout: 0 });

/** Model generation can be silent for minutes. Keep caller cancellation,
 * without SDK, response-header or response-body processing deadlines. */
export const modelTransport: typeof fetch = (input, init) =>
  // Undici implements web fetch; its iterator types differ from DOM typings.
  transportFetch(
    input as Parameters<typeof transportFetch>[0],
    {
      ...init,
      dispatcher,
    } as Parameters<typeof transportFetch>[1],
  ) as unknown as Promise<Response>;

export class ModelClient extends OpenAI {
  private readonly transport: typeof fetch;

  constructor(options: ConstructorParameters<typeof OpenAI>[0]) {
    const transport = options?.fetch ?? modelTransport;
    super({ ...options, fetch: transport });
    this.transport = transport;
  }

  override fetchWithTimeout(
    url: RequestInfo,
    init: RequestInit | undefined,
    _milliseconds: number,
    _controller: AbortController,
  ): Promise<Response> {
    // The SDK passes the caller's signal in init; the transport keeps it
    // active through response-body reading too.
    return this.transport.call(undefined, url, init);
  }
}
