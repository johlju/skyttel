import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { type FormLeaveGuard, type LeaveConfirmation, useFormLeave } from './FormLeave.js';
import { trapDialogTab } from './modal-focus.js';

/** Retain unsent work until all applicable departure decisions are confirmed. */
export function FormLossGuard({
  dirty,
  busy,
  householdId,
  onDiscard,
  onBlocked,
  description,
  kind = 'form',
}: {
  dirty: boolean;
  busy: boolean;
  householdId?: string;
  onDiscard: () => void;
  onBlocked: () => void;
  description?: string;
  kind?: 'form' | 'positions';
}) {
  const { register } = useFormLeave();
  const [leave, setLeave] = useState<{ proceed: LeaveConfirmation; cancel: () => void } | null>(
    null,
  );
  const dialog = useRef<HTMLDialogElement>(null);
  const continueButton = useRef<HTMLButtonElement>(null);
  const editingFocus = useRef<HTMLElement | null>(null);
  const guard = useRef<FormLeaveGuard>({ active: () => true, leave: () => {} });
  const positions = kind === 'positions';
  const title = positions ? 'Lämna osparade positioner?' : 'Lämna ändrade uppgifter?';
  guard.current.active = () => (positions ? dirty : true);
  guard.current.scope = positions ? 'household' : undefined;
  guard.current.retain = (pathname, search) =>
    Boolean(
      householdId &&
        (positions
          ? pathname === `/households/${encodeURIComponent(householdId)}` ||
            pathname.startsWith(`/households/${encodeURIComponent(householdId)}/`)
          : pathname === `/households/${encodeURIComponent(householdId)}` &&
            new URLSearchParams(search).has('report')),
    );
  guard.current.leave = (proceed, cancel) => {
    if (busy) {
      onBlocked();
      cancel();
    } else if (dirty) {
      editingFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setLeave({ proceed, cancel });
    } else {
      proceed(onDiscard);
    }
  };
  useLayoutEffect(() => register(guard.current), [register]);
  useLayoutEffect(() => {
    if (leave) {
      dialog.current?.showModal();
      continueButton.current?.focus();
    } else dialog.current?.close();
  }, [leave]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy]);
  function cancel() {
    dialog.current?.close();
    leave?.cancel();
    setLeave(null);
    editingFocus.current?.focus({ preventScroll: true });
  }
  return createPortal(
    <dialog
      ref={dialog}
      className="object-type-loss"
      aria-label={title}
      onKeyDown={(event) => {
        event.stopPropagation();
        trapDialogTab(event);
      }}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }}
    >
      <header>
        <h2>{title}</h2>
      </header>
      <div className="object-type-loss-body">
        <p>
          {description ??
            (positions
              ? dirty
                ? 'Dina senaste positioner är inte sparade. Om du lämnar hushållet försvinner de lokala ändringarna.'
                : 'Alla positioner är nu sparade. Du kan lämna hushållet.'
              : 'Ändringar som inte lagts i utkastet försvinner. Förslag som redan finns i ditt utkast behålls.')}
        </p>
      </div>
      <footer>
        <button ref={continueButton} type="button" className="primary" onClick={cancel}>
          {positions ? 'Stanna kvar' : 'Fortsätt redigera'}
        </button>
        <button
          type="button"
          onClick={() => {
            const proceed = leave?.proceed;
            dialog.current?.close();
            setLeave(null);
            proceed?.(onDiscard);
          }}
        >
          {positions
            ? dirty
              ? 'Lämna och kasta positionerna'
              : 'Lämna hushållet'
            : 'Kasta ändringarna och fortsätt'}
        </button>
      </footer>
    </dialog>,
    document.body,
  );
}
