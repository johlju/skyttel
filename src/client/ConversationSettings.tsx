import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  conversationConsentText,
  conversationConsentTextVersion,
} from '../shared/conversation-consent.js';
import type { Conversation } from './use-conversation.js';
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
}: {
  conversation: Conversation;
  householdName: string;
}) {
  return (
    <div className="conversation-settings">
      {conversation.available === false && <p>Samtal med Skyttel är inte tillgängligt just nu.</p>}
      <ConsentSetting conversation={conversation} householdName={householdName} />
    </div>
  );
}

/** The part Medgivande: the consent text, whether a consent is saved, and saving and revoking it. */
function ConsentSetting({
  conversation,
  householdName,
}: {
  conversation: Conversation;
  householdName: string;
}) {
  const id = useId();
  const actions = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const { saved, visit, known } = conversation.consent;
  const { refreshConsent } = conversation;
  useEffect(refreshConsent, [refreshConsent]);
  // A consent that is saved for an older consent text no longer applies.
  const current = saved?.textVersion === conversationConsentTextVersion ? saved : null;
  const status = current
    ? `Sparat den ${savedDate.format(new Date(current.savedAt))}.`
    : visit
      ? 'Du har godkänt för det här besöket. Inget medgivande är sparat.'
      : saved
        ? 'Medgivandetexten har ändrats. Inget medgivande är sparat.'
        : 'Inget medgivande är sparat.';
  // A consent cannot be saved while the conversation is not offered. It can still be revoked.
  const canSave = known && !current && conversation.available === true;
  const canRevoke = known && Boolean(current || visit);
  // The focus stays on the button that the user pressed. When that button is
  // no longer shown, the focus goes to the one that is.
  const keepFocus = useRef(false);
  useLayoutEffect(() => {
    if (!keepFocus.current || busy) return;
    keepFocus.current = false;
    if (!actions.current?.contains(document.activeElement))
      actions.current?.querySelector('button')?.focus();
  });
  async function change(action: 'save' | 'revoke') {
    if (busy) return;
    keepFocus.current = actions.current?.contains(document.activeElement) ?? false;
    setBusy(true);
    // An emptied text lets a screen reader read the same result once more.
    setFeedback('');
    const done = await (action === 'save'
      ? conversation.saveConsent()
      : conversation.revokeConsent());
    setBusy(false);
    setFeedback(
      action === 'save'
        ? done
          ? 'Medgivandet är sparat'
          : 'Medgivandet kunde inte sparas. Försök igen.'
        : done
          ? 'Medgivandet är återkallat'
          : 'Medgivandet kunde inte återkallas. Försök igen.',
    );
  }
  const save = { name: 'Spara medgivandet', action: 'save' } as const;
  const revoke = { name: 'Återkalla medgivandet', action: 'revoke' } as const;
  // The first button stays in place and changes its name when the consent is saved or revoked.
  const [first, second] = [...(canSave ? [save] : []), ...(canRevoke ? [revoke] : [])];
  return (
    <section className="conversation-setting" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Medgivande</h2>
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
        {first && (
          <button type="button" aria-disabled={busy} onClick={() => void change(first.action)}>
            {first.name}
          </button>
        )}
        {second && (
          <button type="button" aria-disabled={busy} onClick={() => void change(second.action)}>
            {second.name}
          </button>
        )}
      </div>
      <p className="conversation-setting-feedback" role="status">
        {feedback}
      </p>
    </section>
  );
}
