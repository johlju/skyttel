import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { revokeRememberedLogin, type StoragePreference } from './browser-binding.js';
import { MapRequestError, request } from './map-request.js';

type Operation = { id: string; sessionId: string };
type State = 'idle' | 'saving' | 'saved' | 'rejected' | 'unknown' | 'checking' | 'unavailable';
type Result = { id: string; status: string; expiresAt: number };

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
  const [reauthenticated, setReauthenticated] = useState(false);
  const [requiresLogin, setRequiresLogin] = useState(false);
  const [resultChecked, setResultChecked] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState('');
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
          operation.current = { id: value.id, sessionId: value.sessionId };
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
  function setRequested(value: boolean) {
    if (busy.current || blocked || !saved || (value && !saved.remembered)) return;
    updateRequested(value);
    setState('idle');
    setRecoveryMessage('');
  }
  function undo() {
    if (busy.current || blocked || !saved) return;
    updateRequested(saved.remembered);
    setState('idle');
    setRecoveryMessage('');
  }
  async function writeOff(reset: boolean) {
    if (
      !userId ||
      owner.current !== userId ||
      !saved ||
      busy.current ||
      blocked ||
      (!reset && (requested || !saved.remembered))
    )
      return;
    const selected = { id: crypto.randomUUID(), sessionId: saved.sessionId };
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
    updateRequested(false);
    setState('saving');
    setRecoveryMessage('');
    setRequiresLogin(false);
    setReauthenticated(false);
    setResultChecked(false);
    const ticket = ++generation.current;
    try {
      const result = await revokeRememberedLogin(selected.id, saved);
      if (generation.current !== ticket) return;
      setSaved(result.result);
      setContinued(result.continued);
      setRequiresLogin(!result.continued);
      setState('saved');
      forget();
    } catch (error) {
      if (generation.current !== ticket) return;
      if (error instanceof MapRequestError && [400, 401, 403, 409].includes(error.status)) {
        setState('rejected');
        forget();
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
        `/api/browser-binding/results/${encodeURIComponent(selected.id)}`,
      );
      if (generation.current !== ticket) return;
      if (
        result.id !== selected.id ||
        result.status !== 'completed' ||
        !Number.isFinite(result.expiresAt)
      )
        throw new Error('result_unconfirmed');
      // The result is known even when the separate authentication read fails.
      setState('saved');
      setSaved(undefined);
      setContinued(false);
      setRequiresLogin(true);
      forget();
      try {
        const current = await request<StoragePreference>('/api/browser-binding/preference');
        if (generation.current !== ticket) return;
        setSaved(current);
        updateRequested(current.remembered);
        const sameLogin = current.sessionId === selected.sessionId;
        const confirmed =
          sameLogin && !current.remembered && current.expiresAt === result.expiresAt;
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
    reauthenticated,
    requiresLogin,
    resultChecked,
    recoveryMessage,
    dirty: Boolean(saved && saved.remembered !== requested),
    setRequested,
    undo,
    save: () => writeOff(false),
    reset: () => writeOff(true),
    checkAgain,
  };
}
