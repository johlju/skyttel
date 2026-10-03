import { useId, useLayoutEffect, useRef, useState } from 'react';
import {
  conversationConsentText,
  conversationConsentTextVersion,
} from '../shared/conversation-consent.js';
import type { Conversation } from './use-conversation.js';
import type { useConversationPreferences } from './use-conversation-preferences.js';
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
}: {
  conversation: Conversation;
  householdName: string;
  personal?: ReturnType<typeof useConversationPreferences>;
}) {
  return (
    <div className="conversation-settings">
      {conversation.available === false && <p>Samtal med Skyttel är inte tillgängligt just nu.</p>}
      <ConsentSetting conversation={conversation} householdName={householdName} />
      {personal && <DraftSetting personal={personal} />}
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

/** What a button of the part Medgivande does, and the text that says how it went. */
type ConsentAction = { name: string; run: () => Promise<boolean>; done: string; failed: string };

/** The part Medgivande: the consent text, whether a consent is saved, and saving and revoking it. */
function ConsentSetting({
  conversation,
  householdName,
}: {
  conversation: Conversation;
  householdName: string;
}) {
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const actions = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
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
  async function change(action: ConsentAction) {
    if (busy) return;
    keepFocus.current = actions.current?.contains(document.activeElement) ?? false;
    setBusy(true);
    // An emptied text lets a screen reader read the same result once more.
    setFeedback('');
    const done = await action.run();
    setBusy(false);
    setFeedback(done ? action.done : action.failed);
  }
  const button = (action?: ConsentAction) =>
    action && (
      <button type="button" aria-disabled={busy} onClick={() => void change(action)}>
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
    </section>
  );
}
