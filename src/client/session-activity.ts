import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionStatus } from '../shared/session-activity.js';
import { request } from './map-request.js';

function expiryReason(
  value: SessionStatus | undefined,
  known: Extract<SessionStatus, { state: 'active' }> | undefined,
  loginId: string | undefined,
) {
  if (!value || !Number.isFinite(value.serverTime) || !loginId) return;
  if (value.state === 'expired' && value.sessionId === loginId) return value.reason;
  if (
    value.state === 'anonymous' &&
    known?.sessionId === loginId &&
    value.serverTime >= known.expiresAt &&
    value.bindingId === known.bindingId &&
    value.bindingRevision === known.bindingRevision
  )
    return known.reason;
}

/** Browser events report actions; only the server decides whether access
 * remains valid. Timers use server durations and always verify the end. */
export function useSessionActivity(
  loginId: string | undefined,
  policyRevision: number,
  onExpired: () => void,
  anonymousStatus?: SessionStatus,
  confirmedAnonymous = false,
) {
  const [warning, setWarning] = useState(false);
  const [reason, setReason] = useState<'absolute' | 'inactivity'>();
  const owner = useRef<string>(undefined);
  const generation = useRef(0);
  const policy = useRef<Extract<SessionStatus, { state: 'active' }>>(undefined);
  const latestRevision = useRef(policyRevision);
  latestRevision.current = policyRevision;
  const clear = useCallback(() => {
    generation.current++;
    setWarning(false);
    setReason(undefined);
    owner.current = undefined;
    policy.current = undefined;
  }, []);
  useEffect(() => {
    const revision = ++generation.current;
    if (!loginId) {
      if (confirmedAnonymous) setWarning(false);
      return;
    }
    if (owner.current !== loginId) {
      owner.current = loginId;
      policy.current = undefined;
      setReason(undefined);
      setWarning(false);
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let warningTimer: ReturnType<typeof setTimeout> | undefined;
    let ended = false;
    let sequence = 0;
    let applied = 0;
    const current = () =>
      generation.current === revision &&
      latestRevision.current === policyRevision &&
      !controller.signal.aborted;
    const channel =
      typeof BroadcastChannel === 'undefined'
        ? undefined
        : new BroadcastChannel(`skyttel-session:${loginId}`);
    function finish(value: 'absolute' | 'inactivity' | undefined) {
      if (!current() || ended) return;
      ended = true;
      setReason(value);
      setWarning(false);
      onExpired();
    }
    async function read(kind?: string, rechecking = false) {
      const serial = ++sequence;
      try {
        const value = await request<SessionStatus>(
          `/api/browser-binding/${kind ? 'activity' : 'status'}`,
          kind ? { kind } : {},
          controller.signal,
        );
        if (!current() || serial < applied || ended || !Number.isFinite(value.serverTime)) return;
        applied = serial;
        if (value.state === 'expired') return finish(expiryReason(value, policy.current, loginId));
        if (value.state === 'anonymous') {
          if (!rechecking) return read(undefined, true);
          // A cleanup sweep may remove the ended row before this read. The
          // previous policy belongs to this exact S and server time verifies
          // its deadline. An unrelated early loss never becomes inactivity.
          return finish(expiryReason(value, policy.current, loginId));
        }
        if (value.state !== 'active' || !Number.isFinite(value.expiresAt)) return;
        if (value.sessionId !== loginId) return finish(undefined);
        policy.current = value;
        setReason(undefined);
        clearTimeout(timer);
        clearTimeout(warningTimer);
        const remaining = Math.max(0, value.expiresAt - value.serverTime);
        setWarning(remaining > 0 && remaining <= 5 * 60_000);
        if (remaining > 5 * 60_000)
          warningTimer = setTimeout(
            () => {
              if (current() && !ended) setWarning(true);
            },
            remaining - 5 * 60_000,
          );
        timer = setTimeout(() => void read(), Math.max(1, remaining));
        if (kind) channel?.postMessage('activity');
      } catch {
        // Network errors and rejected unrelated requests prove no expiry.
      }
    }
    const input = (event: Event) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable)
      )
        void read('write');
    };
    const click = (event: Event) => {
      if (!(event.target instanceof Element)) return;
      const control = event.target.closest('button,a,[role="button"],select');
      if (control?.matches(':disabled,[aria-disabled="true"]')) return;
      if (control || event.target.matches('.household-map canvas')) void read('navigate');
    };
    let drag: { x: number; y: number } | undefined;
    const pointerDown = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.matches('.household-map canvas'))
        drag = { x: event.clientX, y: event.clientY };
    };
    const pointerUp = (event: PointerEvent) => {
      if (drag && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 3)
        void read('navigate');
      drag = undefined;
    };
    const mapNavigation = (event: Event) => {
      if (!(event.target instanceof Element) || !event.target.closest('.household-map')) return;
      if (
        event instanceof KeyboardEvent &&
        ![
          'ArrowLeft',
          'ArrowRight',
          'ArrowUp',
          'ArrowDown',
          'Home',
          'End',
          'PageUp',
          'PageDown',
        ].includes(event.key)
      )
        return;
      void read('navigate');
    };
    const historyNavigation = () => void read('navigate');
    const foreground = () => void read();
    channel?.addEventListener('message', foreground);
    document.addEventListener('input', input, true);
    document.addEventListener('change', input, true);
    document.addEventListener('click', click, true);
    document.addEventListener('pointerdown', pointerDown, true);
    document.addEventListener('pointerup', pointerUp, true);
    document.addEventListener('wheel', mapNavigation, { capture: true, passive: true });
    document.addEventListener('keydown', mapNavigation, true);
    window.addEventListener('popstate', historyNavigation);
    window.addEventListener('focus', foreground);
    const poll = setInterval(foreground, 5000);
    void read();
    return () => {
      controller.abort();
      clearTimeout(timer);
      clearTimeout(warningTimer);
      clearInterval(poll);
      channel?.close();
      document.removeEventListener('input', input, true);
      document.removeEventListener('change', input, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('pointerdown', pointerDown, true);
      document.removeEventListener('pointerup', pointerUp, true);
      document.removeEventListener('wheel', mapNavigation, true);
      document.removeEventListener('keydown', mapNavigation, true);
      window.removeEventListener('popstate', historyNavigation);
      window.removeEventListener('focus', foreground);
    };
  }, [loginId, onExpired, policyRevision, confirmedAnonymous]);
  return {
    warning: warning && !confirmedAnonymous,
    reason: anonymousStatus ? expiryReason(anonymousStatus, policy.current, owner.current) : reason,
    clear,
  };
}
