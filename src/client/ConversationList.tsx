import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { RetainedConversation } from '../shared/text-assistant.js';
import type { Conversation } from './use-conversation.js';
import { WorkspaceIcon } from './WorkspaceTools.js';

function date(value?: number, dateOnly = false) {
  if (value === undefined) return 'Datum saknas';
  const time = new Date(value);
  return (
    <time dateTime={time.toISOString()}>
      {dateOnly ? time.toLocaleDateString('sv-SE') : time.toLocaleString('sv-SE')}
    </time>
  );
}

function ConversationInformation({ row, close }: { row: RetainedConversation; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [status, setStatus] = useState('');
  useLayoutEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  const filter = `and(eq(metadata_key, "conversation_id"), eq(metadata_value, "${row.id}"))`;
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setStatus('Kopierat.');
    } catch {
      setStatus('Markera texten och kopiera den manuellt.');
    }
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby={id}
      className="conversation-model-dialog"
      onCancel={close}
    >
      <h2 id={id}>Samtalsinformation</h2>
      <dl>
        <dt>Titel</dt>
        <dd>{row.title}</dd>
        <dt>Skapat</dt>
        <dd>{date(row.createdAt)}</dd>
        <dt>Senaste begäran</dt>
        <dd>{date(row.lastRequestAt)}</dd>
        <dt>Löper ut</dt>
        <dd>{date(row.expiresAt)}</dd>
        <dt>Samtals-ID</dt>
        <dd>
          <code>{row.id}</code>
        </dd>
        <dt>LangSmith-filter</dt>
        <dd>
          <code>{filter}</code>
        </dd>
      </dl>
      <p>
        Filtret hittar de spår som har skickats för samtalet. Om sändningen är avstängd eller
        leveranser saknas kan träffar saknas.
      </p>
      <button type="button" onClick={() => void copy(row.id)}>
        Kopiera samtals-ID
      </button>
      <button type="button" onClick={() => void copy(filter)}>
        Kopiera LangSmith-filter
      </button>
      <p role="status">{status}</p>
      <button type="button" onClick={close}>
        Stäng
      </button>
    </dialog>
  );
}

function ConversationDeletion({
  row,
  busy,
  remove,
  close,
}: {
  row: RetainedConversation;
  busy: boolean;
  remove: (id: string) => Promise<string | undefined>;
  close: (deleted: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useLayoutEffect(() => {
    const node = dialog.current;
    node?.showModal();
    cancel.current?.focus();
    return () => node?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      className="conversation-model-dialog conversation-delete-dialog"
      onCancel={(event) => {
        if (pending) event.preventDefault();
      }}
      onClose={(event) => {
        if (!event.currentTarget.open) close(event.currentTarget.returnValue === 'deleted');
      }}
    >
      <h2 id={`${id}-title`}>Ta bort samtal?</h2>
      <p id={`${id}-description`}>
        <strong>{row.title}</strong> tas bort. Dina utkaständringar och sparade ändringar på kartan
        finns kvar. Det går inte att ångra.
      </p>
      {busy && !error && (
        <p role="status">Skyttel arbetar eller talar i samtalet. Vänta tills det är klart.</p>
      )}
      {error && <p role="alert">{error}</p>}
      {pending && <p role="status">Tar bort samtalet…</p>}
      <form
        className="conversation-delete-actions"
        onSubmit={async (event) => {
          event.preventDefault();
          if (pending || busy) return;
          setPending(true);
          setError('');
          const result = await remove(row.id);
          setPending(false);
          if (result) setError(result);
          else dialog.current?.close('deleted');
        }}
      >
        <button type="submit" disabled={busy || pending}>
          Ta bort
        </button>
        <button
          ref={cancel}
          type="button"
          disabled={pending}
          onClick={() => dialog.current?.close()}
        >
          Avbryt
        </button>
      </form>
    </dialog>
  );
}

export function ConversationList({
  conversation,
  onSelected,
  id,
}: {
  conversation: Conversation;
  onSelected: () => void;
  id: string;
}) {
  const [information, setInformation] = useState<string>();
  const [deletion, setDeletion] = useState<RetainedConversation>();
  const [deletionStatus, setDeletionStatus] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const read = useRef(conversation.listRetained);
  read.current = conversation.listRetained;
  useEffect(() => {
    let closed = false;
    let timer: number | undefined;
    function schedule() {
      if (!closed) timer = window.setTimeout(poll, 3000);
    }
    function poll() {
      void read.current?.().then(schedule, schedule);
    }
    queueMicrotask(() => {
      if (!closed) poll();
    });
    return () => {
      closed = true;
      window.clearTimeout(timer);
    };
  }, []);
  const rows = conversation.retainedConversations;
  const detail = rows?.find((row) => row.id === information);
  const deleting = rows?.find((row) => row.id === deletion?.id);
  const selectedId = conversation.session?.id;
  return (
    <section id={id} className="conversation-list" aria-labelledby={`${id}-heading`}>
      <h3 ref={heading} id={`${id}-heading`} tabIndex={-1}>
        Samtal
      </h3>
      <p className="visually-hidden" role="status">
        {deletionStatus}
      </p>
      {conversation.listError && <p role="alert">{conversation.listError}</p>}
      {rows === undefined ? (
        !conversation.listError && <p>Hämtar samtal…</p>
      ) : rows.length === 0 ? (
        <p>Inga samtal ännu.</p>
      ) : (
        <ul>
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className="conversation-list-title"
                disabled={conversation.switchBlocked}
                aria-current={row.id === selectedId ? 'true' : undefined}
                aria-label={row.title}
                aria-describedby={
                  row.lastRequestAt === undefined ? undefined : `${id}-date-${row.id}`
                }
                onClick={async () => {
                  if (await conversation.openRetained?.(row.id)) onSelected();
                }}
              >
                <strong>{row.title}</strong>
                {row.lastRequestAt !== undefined && (
                  <span className="conversation-list-date" id={`${id}-date-${row.id}`}>
                    {date(row.lastRequestAt, true)}
                  </span>
                )}
              </button>
              <button
                type="button"
                className="conversation-list-action"
                aria-label="Samtalsinformation"
                title="Samtalsinformation"
                aria-haspopup="dialog"
                onClick={() => setInformation(row.id)}
              >
                <WorkspaceIcon name="info" />
              </button>
              {conversation.deleteRetained && (
                <button
                  type="button"
                  className="conversation-list-action conversation-list-delete"
                  aria-label={`Ta bort samtalet: ${row.title}`}
                  title={`Ta bort samtalet: ${row.title}`}
                  aria-haspopup="dialog"
                  onClick={() => {
                    setDeletionStatus('');
                    setDeletion(row);
                  }}
                >
                  <WorkspaceIcon name="trash" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {detail && <ConversationInformation row={detail} close={() => setInformation(undefined)} />}
      {deletion && conversation.deleteRetained && (
        <ConversationDeletion
          row={deletion}
          busy={Boolean(
            deleting?.busy || (deletion.id === selectedId && conversation.switchBlocked),
          )}
          remove={conversation.deleteRetained}
          close={(deleted) => {
            setDeletion(undefined);
            if (deleted) {
              setDeletionStatus('Samtalet togs bort.');
              heading.current?.focus();
            }
          }}
        />
      )}
    </section>
  );
}
