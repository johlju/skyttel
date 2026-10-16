import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { installationRestoredMessage } from '../shared/installation-restore.js';
import { changeRememberedLogin, type StoragePreference } from './browser-binding.js';
import { MapRequestError, request } from './map-request.js';
import { resetStorageConsent } from './storage-consent.js';

type Operation = {
  id: string;
  sessionId: string;
  generation?: string;
  remembered?: boolean;
  resetConsent?: boolean;
  resetConsentAt?: number;
};
type State =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'rejected'
  | 'unknown'
  | 'checking'
  | 'unavailable'
  | 'restored';
type Result = {
  id: string;
  userId: string;
  status: string;
  expiresAt?: number;
  remembered?: boolean;
};

/** The tab retains only the requested operation, never a preference or authority. */
export function useStoragePreference(userId?: string) {
  const owner = useRef(userId);
  const generation = useRef(0);
  const operation = useRef<Operation | null>(null);
  const busy = useRef(false);
  const [saved, setSaved] = useState<StoragePreference>();
  const [requested, updateRequested] = useState(false);
  const [state, setState] = useState<State>('idle');
  const [continued, setContinued] = useState(false);
  const [confirmedRemembered, setConfirmedRemembered] = useState(false);
  const [reauthenticated, setReauthenticated] = useState(false);
  const [requiresLogin, setRequiresLogin] = useState(false);
  const [resultChecked, setResultChecked] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const savedReference = useRef(saved);
  savedReference.current = saved;
  const passiveReadBlocked = useRef(false);
  passiveReadBlocked.current = busy.current || ['saving', 'checking', 'unknown'].includes(state);
  const storageKey = `skyttel-storage-operation:${userId}`;

  useLayoutEffect(() => {
    owner.current = userId;
    generation.current++;
    operation.current = null;
    busy.current = false;
    setSaved(undefined);
    updateRequested(false);
    setState('idle');
    setContinued(false);
    setReauthenticated(false);
    setRequiresLogin(false);
    setResultChecked(false);
    setRecoveryMessage('');
    return () => {
      generation.current++;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    const ticket = generation.current;
    let recovering = false;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        recovering = true;
        let value: Partial<Operation> | null = null;
        try {
          value = JSON.parse(raw);
        } catch {
          // An unreadable reference does not prove an earlier outcome.
        }
        if (
          value &&
          typeof value.id === 'string' &&
          /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.id) &&
          typeof value.sessionId === 'string' &&
          value.sessionId.length > 0
        )
          operation.current = {
            id: value.id,
            sessionId: value.sessionId,
            remembered: value.remembered === true,
            resetConsent: value.resetConsent === true,
            ...(typeof value.resetConsentAt === 'number' &&
            Number.isSafeInteger(value.resetConsentAt)
              ? { resetConsentAt: value.resetConsentAt }
              : {}),
            ...(typeof value.generation === 'string' && /^[a-f0-9-]{36}$/.test(value.generation)
              ? { generation: value.generation }
              : {}),
          };
        else
          setRecoveryMessage(
            'Åtgärdens referens saknas eller är skadad. Utfallet är fortfarande okänt.',
          );
        setState('unknown');
      }
    } catch {
      setState('unavailable');
      setRecoveryMessage(
        'Flikens återhämtningsuppgifter kunde inte läsas. Ingen ny ändring skickas. Kontrollera webbläsarens lagringsinställningar.',
      );
      return () => controller.abort();
    }
    void request<StoragePreference>('/api/browser-binding/preference', undefined, controller.signal)
      .then((current) => {
        if (controller.signal.aborted || generation.current !== ticket) return;
        if (current.userId !== userId) throw new Error('owner_changed');
        setSaved(current);
        if (!recovering) updateRequested(current.remembered);
      })
      .catch(() => {
        if (controller.signal.aborted || generation.current !== ticket) return;
        setRequiresLogin(true);
        if (!recovering) setState('unavailable');
      });
    return () => controller.abort();
  }, [storageKey, userId]);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    const refresh = () => {
      if (passiveReadBlocked.current) return;
      const ticket = generation.current;
      void request<StoragePreference>(
        '/api/browser-binding/preference',
        undefined,
        controller.signal,
      )
        .then((current) => {
          if (
            controller.signal.aborted ||
            passiveReadBlocked.current ||
            generation.current !== ticket ||
            current.userId !== userId
          )
            return;
          if (
            current.bindingId === savedReference.current?.bindingId &&
            current.remembered === savedReference.current.remembered
          )
            return;
          // An external rotation invalidates the old unsent function choice.
          // Never silently apply it to a replacement session or binding.
          setSaved(current);
          updateRequested(current.remembered);
        })
        .catch(() => {});
    };
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    const channel =
      typeof BroadcastChannel === 'function'
        ? new BroadcastChannel('skyttel-storage-state')
        : undefined;
    if (channel) channel.onmessage = refresh;
    return () => {
      controller.abort();
      channel?.close();
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [userId]);

  function forget() {
    operation.current = null;
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      setRecoveryMessage(
        'Resultatet är bekräftat men flikens referens kunde inte tas bort. En omladdning kan kräva att du kontrollerar samma resultat igen.',
      );
    }
  }

  const blocked = state === 'saving' || state === 'unknown' || state === 'checking';
  async function change(remembered: boolean, reset = false, resetConsentAt?: number) {
    if (
      !userId ||
      owner.current !== userId ||
      !saved ||
      busy.current ||
      blocked ||
      (!reset && remembered === saved.remembered)
    )
      return;
    const selected = {
      id: crypto.randomUUID(),
      sessionId: saved.sessionId,
      remembered,
      resetConsent: reset,
      ...(resetConsentAt !== undefined ? { resetConsentAt } : {}),
      ...(saved.generation ? { generation: saved.generation } : {}),
    };
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(selected));
      if (sessionStorage.getItem(storageKey) !== JSON.stringify(selected))
        throw new Error('storage_unavailable');
    } catch {
      setRecoveryMessage(
        'Flikens återhämtningsuppgifter kunde inte sparas. Ingen ändring har skickats. Kontrollera webbläsarens lagringsinställningar och försök igen.',
      );
      setState('unavailable');
      return;
    }
    operation.current = selected;
    busy.current = true;
    updateRequested(remembered);
    setState('saving');
    setRecoveryMessage('');
    setRequiresLogin(false);
    setReauthenticated(false);
    setResultChecked(false);
    const ticket = ++generation.current;
    try {
      const result = await changeRememberedLogin(selected.id, saved, remembered);
      if (generation.current !== ticket) return;
      setSaved(result.result);
      setConfirmedRemembered(remembered);
      setContinued(result.continued);
      setRequiresLogin(!result.continued);
      setState('saved');
      if (reset && resetConsentAt !== undefined) {
        try {
          resetStorageConsent(resetConsentAt);
        } catch {
          setRecoveryMessage(
            'Avstängningen är bekräftad men lagringssamtycket kunde inte återställas. Försök återställa samtycket igen.',
          );
        }
      }
      forget();
      return true;
    } catch (error) {
      if (generation.current !== ticket) return;
      if (error instanceof MapRequestError && [400, 401, 403, 409].includes(error.status)) {
        setRequiresLogin([401, 403].includes(error.status));
        updateRequested(saved.remembered);
        setState('rejected');
        forget();
        if (error.code === 'binding_changed') {
          try {
            const current = await request<StoragePreference>('/api/browser-binding/preference');
            if (generation.current === ticket && current.userId === userId) {
              setSaved(current);
              updateRequested(current.remembered);
            }
          } catch {
            /* A rejected precondition does not confirm new authority. */
          }
        }
      } else setState('unknown');
    } finally {
      if (generation.current === ticket) busy.current = false;
    }
  }
  async function checkAgain() {
    if (busy.current || state !== 'unknown') return;
    const selected = operation.current;
    if (!selected) {
      setRecoveryMessage(
        'Åtgärdens referens saknas eller är skadad. Utfallet är fortfarande okänt.',
      );
      return;
    }
    busy.current = true;
    setResultChecked(true);
    setState('checking');
    setRecoveryMessage('');
    setRequiresLogin(false);
    const ticket = ++generation.current;
    try {
      const result = await request<Result>(
        `/api/browser-binding/results/${encodeURIComponent(selected.id)}${
          selected.generation ? `?generation=${encodeURIComponent(selected.generation)}` : ''
        }`,
      );
      if (generation.current !== ticket) return;
      if (result.id !== selected.id || result.userId !== userId) throw new Error('owner_changed');
      if (result.status === 'unavailable_after_restore' && selected.generation) {
        forget();
        setState('restored');
        setSaved(undefined);
        updateRequested(false);
        setRequiresLogin(true);
        setRecoveryMessage(installationRestoredMessage);
        try {
          const current = await request<StoragePreference>('/api/browser-binding/preference');
          if (generation.current !== ticket) return;
          if (current.userId !== userId) throw new Error('owner_changed');
          setSaved(current);
          updateRequested(current.remembered);
          setRequiresLogin(false);
        } catch {
          // The restore is confirmed, but the old cached preference is not
          // evidence of the current login or its newly selected choice.
        }
        return;
      }
      if (
        result.status !== 'completed' ||
        typeof result.expiresAt !== 'number' ||
        !Number.isFinite(result.expiresAt)
      )
        throw new Error('result_unconfirmed');
      // The result is known even when the separate authentication read fails.
      setState('saved');
      setConfirmedRemembered(result.remembered ?? false);
      setSaved(undefined);
      setContinued(false);
      setRequiresLogin(true);
      if (selected.resetConsent && selected.resetConsentAt !== undefined) {
        try {
          resetStorageConsent(selected.resetConsentAt);
        } catch {
          setRecoveryMessage(
            'Avstängningen är bekräftad men lagringssamtycket kunde inte återställas. Försök återställa samtycket igen.',
          );
        }
      }
      forget();
      try {
        const current = await request<StoragePreference>('/api/browser-binding/preference');
        if (generation.current !== ticket) return;
        if (current.userId !== userId) throw new Error('owner_changed');
        setSaved(current);
        updateRequested(current.remembered);
        const sameLogin = current.sessionId === selected.sessionId;
        const confirmed =
          sameLogin &&
          current.remembered === (result.remembered ?? false) &&
          current.expiresAt === result.expiresAt;
        setContinued(confirmed);
        setReauthenticated(!sameLogin);
        setRequiresLogin(sameLogin && !confirmed);
      } catch {
        // A cookie or current-authentication failure cannot undo confirmed OFF.
      }
    } catch (error) {
      if (generation.current !== ticket) return;
      setState('unknown');
      setRequiresLogin(error instanceof MapRequestError && [401, 403].includes(error.status));
      setRecoveryMessage(
        error instanceof MapRequestError && error.status === 404
          ? 'Resultatet kan inte hämtas. Det kan saknas eller ha passerat kontrollfönstret på 24 timmar. Utfallet är fortfarande okänt.'
          : error instanceof MapRequestError && [401, 403].includes(error.status)
            ? 'Logga in igen för att kontrollera samma åtgärd.'
            : 'Resultatet kunde inte kontrolleras. Utfallet är fortfarande okänt. Kontrollera igen.',
      );
    } finally {
      if (generation.current === ticket) busy.current = false;
    }
  }
  return {
    saved,
    requested,
    state,
    continued,
    confirmedRemembered,
    reauthenticated,
    requiresLogin,
    resultChecked,
    recoveryMessage,
    change,
    checkAgain,
  };
}
