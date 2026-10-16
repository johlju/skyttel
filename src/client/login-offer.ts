import { readStorageConsent } from './storage-consent.js';

type LoginOffer = { schemaVersion: 1; ask: boolean; lastLoginId?: string; pendingLoginId?: string };
const storageKey = (userId: string) => `skyttel-login-offer:${userId}`;
export function readLoginOffer(userId: string): LoginOffer {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(userId)) ?? 'null');
    if (value?.schemaVersion === 1 && typeof value.ask === 'boolean')
      return {
        schemaVersion: 1,
        ask: value.ask,
        ...(typeof value.lastLoginId === 'string' ? { lastLoginId: value.lastLoginId } : {}),
        ...(typeof value.pendingLoginId === 'string'
          ? { pendingLoginId: value.pendingLoginId }
          : {}),
      };
  } catch {
    /* No stored record grants permission to use optional storage. */
  }
  return { schemaVersion: 1, ask: true };
}
function write(userId: string, value: LoginOffer) {
  const raw = JSON.stringify(value);
  localStorage.setItem(storageKey(userId), raw);
  if (localStorage.getItem(storageKey(userId)) !== raw) throw new Error('offer_unconfirmed');
}
export function recordLoginOffer(userId: string, sessionId: string) {
  const current = readLoginOffer(userId);
  if (current.lastLoginId === sessionId) return;
  // Only the actual, verified callback records eligibility. Later permission
  // changes cannot create a prompt for an already running login.
  write(userId, {
    schemaVersion: 1,
    ask: current.ask,
    lastLoginId: sessionId,
    ...(readStorageConsent()?.preferences && current.ask ? { pendingLoginId: sessionId } : {}),
  });
}
export function claimLoginOffer(userId: string, sessionId: string) {
  const current = readLoginOffer(userId);
  if (!current.ask || current.pendingLoginId !== sessionId || !readStorageConsent()?.preferences)
    return false;
  write(userId, { schemaVersion: 1, ask: current.ask, lastLoginId: current.lastLoginId });
  return true;
}
export function setLoginOffers(userId: string, ask: boolean) {
  write(userId, { schemaVersion: 1, ask, lastLoginId: readLoginOffer(userId).lastLoginId });
}
