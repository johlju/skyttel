import { useSyncExternalStore } from 'react';
import { storageConsentInformationVersion } from '../shared/storage-consent.js';

export const storageConsentKey = 'skyttel-storage-consent';
export const storagePurposeVersion = storageConsentInformationVersion;
export const storageConsentEvent = 'skyttel-storage-consent-changed';
export type StorageConsent = {
  schemaVersion: 1;
  informationVersion: number;
  preferences: boolean;
  decidedAt: number;
};

const unreadableConsent = Symbol('unreadable_consent');
let rejectedConsent: string | null | typeof unreadableConsent | undefined;
function storedConsent() {
  try {
    return localStorage.getItem(storageConsentKey);
  } catch {
    return undefined;
  }
}
function rawConsent() {
  const raw = storedConsent();
  if (raw === undefined) return null;
  // A failed withdrawal cannot make the old permission usable again in this
  // document. A genuinely new saved decision or confirmed write can replace it.
  if (
    (rejectedConsent === unreadableConsent && raw !== null) ||
    (rejectedConsent !== undefined && raw === rejectedConsent)
  )
    return null;
  rejectedConsent = undefined;
  return raw;
}
export function readStorageConsent(): StorageConsent | null {
  try {
    const value = JSON.parse(rawConsent() ?? 'null');
    return value?.schemaVersion === 1 &&
      value.informationVersion === storagePurposeVersion &&
      typeof value.preferences === 'boolean' &&
      Number.isSafeInteger(value.decidedAt) &&
      value.decidedAt >= 0
      ? value
      : null;
  } catch {
    return null;
  }
}
export function writeStorageConsent(preferences: boolean) {
  const choice: StorageConsent = {
    schemaVersion: 1,
    informationVersion: storagePurposeVersion,
    preferences,
    decidedAt: Math.max(Date.now(), (readStorageConsent()?.decidedAt ?? 0) + 1),
  };
  const value = JSON.stringify(choice);
  try {
    localStorage.setItem(storageConsentKey, value);
    if (localStorage.getItem(storageConsentKey) !== value) throw new Error('consent_unconfirmed');
  } catch (error) {
    if (!preferences) {
      rejectedConsent = storedConsent() ?? unreadableConsent;
      window.dispatchEvent(new Event(storageConsentEvent));
    }
    throw error;
  }
  rejectedConsent = undefined;
  window.dispatchEvent(new Event(storageConsentEvent));
  return choice;
}
export function resetStorageConsent(expectedDecisionAt?: number) {
  if (expectedDecisionAt !== undefined) {
    const current = readStorageConsent();
    if (!current || current.preferences || current.decidedAt !== expectedDecisionAt) return;
  }
  localStorage.removeItem(storageConsentKey);
  if (localStorage.getItem(storageConsentKey) !== null) throw new Error('consent_unconfirmed');
  window.dispatchEvent(new Event(storageConsentEvent));
}
function subscribe(notify: () => void) {
  const reread = () => notify();
  window.addEventListener('storage', reread);
  window.addEventListener('focus', reread);
  window.addEventListener(storageConsentEvent, reread);
  return () => {
    window.removeEventListener('storage', reread);
    window.removeEventListener('focus', reread);
    window.removeEventListener(storageConsentEvent, reread);
  };
}
export function useStorageConsent() {
  useSyncExternalStore(subscribe, rawConsent);
  return readStorageConsent();
}
