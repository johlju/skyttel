import { MapRequestError, request } from './map-request.js';

export const browserBindingLock = 'skyttel-browser-binding';

function writeBindingCookie(pair: string, expiresAt?: number) {
  // biome-ignore lint/suspicious/noDocumentCookie: All binding writes are synchronous while holding the same origin lock.
  document.cookie = `${pair}; Path=/; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}${expiresAt === undefined ? '' : `; Expires=${new Date(expiresAt).toUTCString()}`}`;
}

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
    if (!document.cookie.split(';').some((part) => part.trim() === `${name}=${result.candidate}`)) {
      writeBindingCookie(`${name}=${result.candidate}`);
    }
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
  return withBindingLock(async () => {
    await initialize(signal);
    return operation();
  }, signal);
}

async function withBindingLock<T>(operation: () => Promise<T>, signal?: AbortSignal) {
  if (
    !window.isSecureContext ||
    typeof navigator.locks?.request !== 'function' ||
    window.top !== window.self
  )
    throw new Error('binding_unavailable');
  return navigator.locks.request(browserBindingLock, { ...(signal ? { signal } : {}) }, operation);
}

export async function confirmBrowserLogin(proof: string, signal: AbortSignal) {
  return withBindingLock(async () => {
    type Confirmation = {
      status: string;
      sessionId: string;
      revision: number;
      remembered: boolean;
      expiresAt: number;
      cookieName: string;
      origin: string;
    };
    const read = () =>
      request<Confirmation>(
        `/api/browser-binding/confirmation?proof=${encodeURIComponent(proof)}`,
        {},
        signal,
      );
    const result = await read();
    if (signal.aborted || result.status !== 'confirmed' || result.origin !== window.location.origin)
      throw new Error('login_unconfirmed');
    const name =
      window.location.protocol === 'https:' ? '__Host-skyttel_binding' : 'skyttel_binding';
    const pair = document.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`));
    if (!pair || result.cookieName !== name || !Number.isFinite(result.expiresAt))
      throw new Error('login_unconfirmed');
    // Absolute Expires cannot gain a fresh lifetime when delivery is delayed.
    // The confirmation is authenticated by the current cookie pair; its proof
    // is a correlation value, never a replacement authentication key.
    writeBindingCookie(pair, result.remembered ? result.expiresAt : undefined);
    try {
      const current = await read();
      if (
        current.sessionId !== result.sessionId ||
        current.revision !== result.revision ||
        current.remembered !== result.remembered ||
        current.expiresAt !== result.expiresAt
      )
        throw new Error('login_unconfirmed');
    } catch (error) {
      // A callback can replace the session while this lock holds a delayed
      // read. Demote only the same cookie that this operation just wrote,
      // including on abort. An unconfirmed old choice cannot leave persistence.
      if (document.cookie.split(';').some((part) => part.trim() === pair)) {
        writeBindingCookie(pair);
      }
      throw error;
    }
  }, signal);
}

export type StoragePreference = {
  userId: string;
  remembered: boolean;
  sessionId: string;
  bindingId: string;
  expiresAt: number;
  inactiveAfterMs: number;
};

export async function revokeRememberedLogin(id: string, expected: StoragePreference) {
  // Failure to acquire the lock happens before the save request. Once saving
  // starts, a transport error has an unknown outcome and must never be retried.
  let started = false;
  try {
    return await withBindingLock(async () => {
      started = true;
      const result = await request<
        StoragePreference & {
          id: string;
          status: string;
          candidate: string;
          cookieName: string;
          origin: string;
        }
      >('/api/browser-binding/revoke', {
        id,
        sessionId: expected.sessionId,
        bindingId: expected.bindingId,
      });
      if (
        result.status !== 'completed' ||
        result.remembered !== false ||
        result.id !== id ||
        result.userId !== expected.userId
      )
        throw new Error('revocation_unconfirmed');
      // The server change is confirmed independently of replacement-cookie
      // registration. A failure below cannot undo that confirmed OFF result.
      try {
        const name =
          window.location.protocol === 'https:' ? '__Host-skyttel_binding' : 'skyttel_binding';
        if (
          result.origin !== window.location.origin ||
          result.cookieName !== name ||
          !/^[a-f0-9]{64}$/.test(result.candidate)
        )
          throw new Error('binding_unconfirmed');
        const pair = `${name}=${result.candidate}`;
        writeBindingCookie(pair);
        if (!document.cookie.split(';').some((part) => part.trim() === pair))
          throw new Error('binding_unconfirmed');
        const signal = AbortSignal.timeout(10_000);
        await request('/api/browser-binding/register', {}, signal);
        const current = await request<StoragePreference>(
          '/api/browser-binding/preference',
          {},
          signal,
        );
        return {
          result,
          continued:
            current.userId === result.userId &&
            current.sessionId === result.sessionId &&
            current.bindingId === result.bindingId &&
            !current.remembered &&
            current.expiresAt === result.expiresAt,
        };
      } catch {
        return { result, continued: false };
      }
    });
  } catch (error) {
    if (!started) throw new MapRequestError(409, 'binding_unavailable');
    throw error;
  }
}
