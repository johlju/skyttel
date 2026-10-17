import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { type FormLeaveGuard, useFormLeave } from './FormLeave.js';
import { trapDialogTab } from './modal-focus.js';

/** Protect only the active form's unsent values. Completed proposals belong to the draft. */
export function FormLossGuard({
  dirty,
  busy,
  householdId,
  onDiscard,
  onBlocked,
  description = 'Ändringar som inte lagts i utkastet försvinner. Förslag som redan finns i ditt utkast behålls.',
}: {
  dirty: boolean;
  busy: boolean;
  householdId?: string;
  onDiscard: () => void;
  onBlocked: () => void;
  description?: string;
}) {
  const { register } = useFormLeave();
  const [leave, setLeave] = useState<{ proceed: () => void; cancel: () => void } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const continueButton = useRef<HTMLButtonElement>(null);
  const editingFocus = useRef<HTMLElement | null>(null);
  const guard = useRef<FormLeaveGuard>({ active: () => true, leave: () => {} });
  guard.current.retain = (pathname, search) =>
    Boolean(
      householdId &&
        pathname === `/households/${encodeURIComponent(householdId)}` &&
        new URLSearchParams(search).has('report'),
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
      onDiscard();
      proceed();
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
    leave?.cancel();
    dialog.current?.close();
    setLeave(null);
    editingFocus.current?.focus({ preventScroll: true });
  }
  return createPortal(
    <dialog
      ref={dialog}
      className="object-type-loss"
      aria-label="Lämna ändrade uppgifter?"
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
        <h2>Lämna ändrade uppgifter?</h2>
      </header>
      <div className="object-type-loss-body">
        <p>{description}</p>
      </div>
      <footer>
        <button ref={continueButton} type="button" className="primary" onClick={cancel}>
          Fortsätt redigera
        </button>
        <button
          type="button"
          onClick={() => {
            const proceed = leave?.proceed;
            dialog.current?.close();
            setLeave(null);
            onDiscard();
            proceed?.();
          }}
        >
          Kasta ändringarna och fortsätt
        </button>
      </footer>
    </dialog>,
    document.body,
  );
}
