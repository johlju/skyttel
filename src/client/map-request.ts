import { buildHeader, notifyOutdatedClient } from './build-guard.js';

export class MapRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string = 'request_failed',
    readonly diagnosticId?: string,
  ) {
    super(code);
  }
}

export async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers:
      body === undefined
        ? undefined
        : {
            'Content-Type': 'application/json',
            'X-Skyttel-Build': buildHeader,
          },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    notifyOutdatedClient(result.error);
    throw new MapRequestError(
      response.status,
      result.error,
      typeof result.diagnosticId === 'string' &&
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(result.diagnosticId)
        ? result.diagnosticId
        : undefined,
    );
  }
  return response.json() as Promise<T>;
}
