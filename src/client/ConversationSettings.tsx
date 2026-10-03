import { useId, useLayoutEffect, useRef, useState } from 'react';
import {
  conversationConsentText,
  conversationConsentTextVersion,
} from '../shared/conversation-consent.js';
import { draftCount } from './ConversationDraft.js';
import type { Conversation } from './use-conversation.js';
import type { useConversationPreferences } from './use-conversation-preferences.js';
import { useConversationViewport } from './use-conversation-viewport.js';
import './conversation-settings.css';

const savedDate = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'long' });

/**
 * The content of the page Samtal med Skyttel in the household's Settings. Each
 * part is a section of its own. Every control saves at once, so the page has
 * no save button, and a short text at the control says how it went.
 */
export function ConversationSettings({
  conversation,
  householdName,
  personal,
  ongoing = false,
}: {
  conversation: Conversation;
  householdName: string;
  ongoing?: boolean;
  personal?: ReturnType<typeof useConversationPreferences>;
}) {
  const { mobile } = useConversationViewport();
  return (
    <div className="conversation-settings">
      {conversation.available === false && <p>Samtal med Skyttel är inte tillgängligt just nu.</p>}
      <ConsentSetting conversation={conversation} householdName={householdName} ongoing={ongoing} />
      {personal && <DraftSetting personal={personal} />}
      {personal && !mobile && <WidthSetting personal={personal} />}
    </div>
  );
}

function DraftSetting({ personal }: { personal: ReturnType<typeof useConversationPreferences> }) {
  const id = useId();
  return (
    <section className="conversation-setting" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Utkastet</h2>
      <p className="conversation-setting-scope">Gäller dig i alla dina hushåll.</p>
      <label>
        <input
          type="checkbox"
          checked={personal.preferences.showDraftOnStart}
          disabled={!personal.known}
          aria-disabled={personal.pending}
          aria-describedby={`${id}-help`}
          onChange={(event) => void personal.configure(event.target.checked)}
        />{' '}
        Visa utkastet när ett samtal börjar
      </label>
      <p id={`${id}-help`}>Ett tomt utkast visas när Skyttel föreslår den första ändringen.</p>
      <p className="conversation-setting-feedback" role="status">
        {personal.feedback}
      </p>
    </section>
  );
}

function WidthSetting({ personal }: { personal: ReturnType<typeof useConversationPreferences> }) {
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const restore = useRef(false);
  const [busy, setBusy] = useState(false);
  const changed = personal.preferences.textWidth !== 400 || personal.preferences.draftWidth !== 340;
  useLayoutEffect(() => {
    if (restore.current && !busy && !changed) {
      restore.current = false;
      heading.current?.focus();
    }
  }, [busy, changed]);
  return (
    <section className="conversation-setting" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} ref={heading} tabIndex={-1}>
        Textvyns bredd
      </h2>
      <p className="conversation-setting-scope">Gäller dig i alla dina hushåll.</p>
      {personal.known &&
        (changed || busy ? (
          <div className="conversation-setting-actions">
            <button
              type="button"
              aria-disabled={busy || personal.pending}
              onClick={async () => {
                if (busy || personal.pending) return;
                restore.current = true;
                setBusy(true);
                const saved = await personal.resetWidths();
                if (!saved) restore.current = false;
                setBusy(false);
              }}
            >
              Återställ bredderna
            </button>
          </div>
        ) : (
          <p>Du har inte ändrat bredderna.</p>
        ))}
      <p className="conversation-setting-feedback" role="status">
        {personal.widthFeedback}
      </p>
    </section>
  );
}

/** What a button of the part Medgivande does, and the text that says how it went. */
type ConsentAction = { name: string; run: () => Promise<boolean>; done: string; failed: string };

/** The part Medgivande: the consent text, whether a consent is saved, and saving and revoking it. */
function ConsentSetting({
  conversation,
  householdName,
  ongoing,
}: {
  conversation: Conversation;
  householdName: string;
  ongoing: boolean;
}) {
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const actions = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [confirm, setConfirm] = useState(false);
  const { saved, visit, known } = conversation.consent;
  // A consent that is saved for an older consent text no longer applies.
  const current = saved?.textVersion === conversationConsentTextVersion ? saved : null;
  const status = current
    ? `Sparat den ${savedDate.format(new Date(current.savedAt))}.`
    : visit
      ? 'Du har godkänt för det här besöket. Inget medgivande är sparat.'
      : saved
        ? 'Medgivandetexten har ändrats. Inget medgivande är sparat.'
        : 'Inget medgivande är sparat.';
  const save: ConsentAction = {
    name: 'Spara medgivandet',
    run: conversation.saveConsent,
    done: 'Medgivandet är sparat',
    failed: 'Medgivandet kunde inte sparas. Försök igen.',
  };
  const revoke: ConsentAction = {
    name: 'Återkalla medgivandet',
    run: conversation.revokeConsent,
    done: 'Medgivandet är återkallat',
    failed: 'Medgivandet kunde inte återkallas. Försök igen.',
  };
  // A consent cannot be saved while the conversation is not offered. It can still be revoked.
  const canSave = known && !current && conversation.available === true;
  const canRevoke = known && Boolean(current || visit);
  // The first button stays in place and changes its name when the consent is saved or revoked.
  const [first, second] = [...(canSave ? [save] : []), ...(canRevoke ? [revoke] : [])];
  // The focus stays on the button that the user pressed. When that button is
  // no longer shown, the focus goes to the one that is, or to the part's
  // heading when no button is left.
  const keepFocus = useRef(false);
  useLayoutEffect(() => {
    if (!keepFocus.current || busy) return;
    keepFocus.current = false;
    if (!actions.current?.contains(document.activeElement))
      (actions.current?.querySelector('button') ?? heading.current)?.focus();
  });
  async function change(action: ConsentAction, confirmed = false) {
    if (busy) return;
    keepFocus.current = confirmed || (actions.current?.contains(document.activeElement) ?? false);
    setBusy(true);
    // An emptied text lets a screen reader read the same result once more.
    setFeedback('');
    const done = await action.run();
    setBusy(false);
    setFeedback(done ? action.done : action.failed);
  }
  const button = (action?: ConsentAction) =>
    action && (
      <button
        type="button"
        aria-disabled={busy}
        onClick={() => {
          if (busy) return;
          if (action === revoke && ongoing) setConfirm(true);
          else void change(action);
        }}
      >
        {action.name}
      </button>
    );
  return (
    <section className="conversation-setting" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} ref={heading} tabIndex={-1}>
        Medgivande
      </h2>
      <p className="conversation-setting-scope">Gäller dig i hushållet {householdName}.</p>
      {conversationConsentText.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      <p>
        Ett sparat medgivande gäller alla dina samtal i hushållet {householdName} tills du
        återkallar det.
      </p>
      {known && <p className="conversation-setting-status">{status}</p>}
      <div ref={actions} className="conversation-setting-actions">
        {button(first)}
        {button(second)}
      </div>
      <p className="conversation-setting-feedback" role="status">
        {feedback}
      </p>
      {confirm && (
        <RevocationConfirmation
          conversation={conversation}
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false);
            void change(revoke, true);
          }}
        />
      )}
    </section>
  );
}

/** Native modal focus containment, Escape and focus restoration belong to this dialog. */
function RevocationConfirmation({
  conversation,
  onCancel,
  onConfirm,
}: {
  conversation: Conversation;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const shown = dialog.current;
    const chosen = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    shown?.showModal();
    heading.current?.focus();
    return () => {
      shown?.close();
      chosen?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="conversation-revocation"
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const buttons = dialog.current?.querySelectorAll('button');
        const first = buttons?.[0];
        const last = buttons?.[buttons.length - 1];
        if (!event.shiftKey && event.target === last) {
          event.preventDefault();
          first?.focus();
        } else if (event.shiftKey && (event.target === first || event.target === heading.current)) {
          event.preventDefault();
          last?.focus();
        }
      }}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-text`}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id={`${id}-title`} ref={heading} tabIndex={-1}>
        Återkalla medgivandet
      </h2>
      <p id={`${id}-text`}>
        Samtalet avslutas och samtalstexten töms.{' '}
        {conversation.session?.saving
          ? 'Skyttel sparar ditt utkast. Sparandet slutförs.'
          : `Utkastet med ${draftCount(conversation.session?.review)} osparade ändringar ligger kvar.`}
      </p>
      <div className="conversation-setting-actions">
        <button type="button" onClick={onConfirm}>
          Återkalla och avsluta samtalet
        </button>
        <button type="button" onClick={onCancel}>
          Avbryt
        </button>
      </div>
    </dialog>
  );
}
