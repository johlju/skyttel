import { WorkspaceIcon, type WorkspaceTarget } from './WorkspaceTools.js';

export function WelcomeGuidance({
  onOpen,
  onDismiss,
  empty = false,
}: {
  onOpen: (target: WorkspaceTarget, chosen: HTMLElement) => void;
  onDismiss: () => void;
  empty?: boolean;
}) {
  return (
    <aside className={empty ? undefined : 'workspace-guidance'} aria-label="Kom igång med kartan">
      <button
        type="button"
        className="workspace-close"
        aria-label="Stäng vägledningen"
        onClick={onDismiss}
      >
        <WorkspaceIcon name="close" />
      </button>
      <h2>{empty ? 'Vad hör ihop hemma hos er?' : 'Vad vill du börja med?'}</h2>
      <p>
        Tala, skriv eller använd listan. Dina förslag blir gemensamma först när du sparar hela
        utkastet.
      </p>
      <div className="access-actions">
        <button
          type="button"
          className="primary"
          onClick={(event) => onOpen('voice', event.currentTarget)}
        >
          Tala
        </button>
        <button type="button" onClick={(event) => onOpen('conversation', event.currentTarget)}>
          Skriv
        </button>
        <button type="button" onClick={(event) => onOpen('list', event.currentTarget)}>
          Öppna listan
        </button>
      </div>
    </aside>
  );
}
