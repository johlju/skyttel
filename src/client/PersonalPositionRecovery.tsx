import { useLayoutEffect, useRef } from 'react';
import { FormLossGuard } from './FormLossGuard.js';
import type { usePersonalView } from './use-personal-view.js';

export function PersonalPositionRecovery({
  personal,
  householdId,
  objectName,
  announce = true,
}: {
  personal: ReturnType<typeof usePersonalView>;
  householdId: string;
  objectName: (id: string) => string;
  announce?: boolean;
}) {
  const feedback = useRef<HTMLParagraphElement>(null);
  const recoveryButton = useRef<{ id: string; element: HTMLButtonElement } | null>(null);
  const entries = personal.unsavedPositions.filter(({ failed, reloading }) => failed || reloading);
  const notice = personal.positionRecovery;
  useLayoutEffect(() => {
    const button = recoveryButton.current;
    if (!notice || notice.id !== button?.id) return;
    if (!button.element.isConnected && document.activeElement === document.body)
      feedback.current?.focus({ preventScroll: true });
    recoveryButton.current = null;
  }, [notice]);
  async function recover(id: string, operation: () => Promise<void>, button: HTMLButtonElement) {
    recoveryButton.current = { id, element: button };
    await operation();
  }
  return (
    <>
      <FormLossGuard
        kind="positions"
        dirty={personal.unsavedPositions.length > 0}
        busy={false}
        householdId={householdId}
        onDiscard={personal.discardPositions}
        onBlocked={() => {}}
      />
      {(entries.length > 0 || notice) && (
        <div className="personal-position-feedback">
          {entries.length > 0 && (
            <section
              aria-label="Osparade personliga positioner"
              className="personal-position-recovery"
            >
              <h2>Osparade personliga positioner</h2>
              <ul>
                {entries.map(({ id, saving, reloading }) => (
                  <li key={id}>
                    <fieldset aria-label={`Position för ${objectName(id)}`}>
                      <legend>{objectName(id)}</legend>
                      <p role={announce ? 'status' : undefined} aria-atomic="true">
                        <span className="visually-hidden">{objectName(id)}: </span>
                        <span>
                          {saving
                            ? 'Positionen sparas…'
                            : reloading
                              ? 'Sparad position hämtas…'
                              : 'Positionen är inte sparad'}
                        </span>
                      </p>
                      <div className="personal-position-actions">
                        <button
                          type="button"
                          disabled={saving || reloading}
                          onClick={(event) =>
                            void recover(id, () => personal.retryPosition(id), event.currentTarget)
                          }
                        >
                          Försök igen
                        </button>
                        <button
                          type="button"
                          disabled={reloading}
                          onClick={(event) =>
                            void recover(id, () => personal.reloadPosition(id), event.currentTarget)
                          }
                        >
                          Läs in sparad position
                        </button>
                      </div>
                    </fieldset>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {notice && (
            <p
              ref={feedback}
              tabIndex={-1}
              role={notice.error ? 'alert' : 'status'}
              aria-atomic="true"
            >
              {objectName(notice.id)}: {notice.message}
            </p>
          )}
        </div>
      )}
    </>
  );
}
