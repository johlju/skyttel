import { request } from './map-request.js';

export const browserBindingLock = 'skyttel-browser-binding';

async function initialize(signal?: AbortSignal) {
  try {
    const result = await request<{ candidate: string; cookieName: string; origin: string }>(
      '/api/browser-binding/candidate',
      {},
      signal,
    );
    if (signal?.aborted) throw new Error('binding_cancelled');
    const https = window.location.protocol === 'https:';
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
    const name = https ? '__Host-skyttel_binding' : 'skyttel_binding';
    if (
      result.origin !== window.location.origin ||
      (!https && !loopback) ||
      result.cookieName !== name ||
      !/^[a-f0-9]{64}$/.test(result.candidate)
    )
      throw new Error('binding_unavailable');
    // biome-ignore lint/suspicious/noDocumentCookie: The approved protocol requires a synchronous write while holding the origin lock.
    document.cookie = `${name}=${result.candidate}; Path=/; SameSite=Lax${https ? '; Secure' : ''}`;
    if (!document.cookie.split(';').some((part) => part.trim() === `${name}=${result.candidate}`))
      throw new Error('binding_unavailable');
    const registration = await request<{ status: string }>(
      '/api/browser-binding/register',
      {},
      signal,
    );
    if (registration.status !== 'confirmed' || signal?.aborted)
      throw new Error('binding_unavailable');
  } catch {
    throw new Error('binding_unconfirmed');
  }
}

/** Only this coordinated client writes the security cookie. JSON replies can
 * arrive after navigation without an old server header replacing the binding. */
export async function withBrowserBinding<T>(operation: () => Promise<T>, signal?: AbortSignal) {
  if (
    !window.isSecureContext ||
    typeof navigator.locks?.request !== 'function' ||
    window.top !== window.self
  )
    throw new Error('binding_unavailable');
  return navigator.locks.request(
    browserBindingLock,
    { ...(signal ? { signal } : {}) },
    async () => {
      await initialize(signal);
      return operation();
    },
  );
}
