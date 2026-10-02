import { type RefObject, useId, useLayoutEffect, useRef, useState } from 'react';
import { conversationConsentText } from '../shared/conversation-consent.js';
import type { Conversation } from './use-conversation.js';
import './conversation-consent.css';

const gap = 16;
const box = (element?: Element | null) => element?.getBoundingClientRect() ?? new DOMRect();

/**
 * Where the box opens: under the toolbar when the toolbar lies at the top,
 * and next to the chosen button when the toolbar stands to the left. The
 * toolbar's place decides, not whether the device is mobile.
 */
function place(dialog: HTMLElement, chosen: DOMRect, toolbar: DOMRect) {
  if (window.matchMedia('(max-width: 700px)').matches)
    return { top: toolbar.bottom + gap, left: gap };
  // A chosen button that is no longer shown leaves the toolbar to open next to.
  const beside = chosen.width ? chosen : toolbar;
  const right = beside.right + gap;
  const fits = right + dialog.offsetWidth + gap <= window.innerWidth;
  return {
    top: Math.max(gap, Math.min(beside.top, window.innerHeight - dialog.offsetHeight - gap)),
    left: Math.max(gap, fits ? right : beside.left - gap - dialog.offsetWidth),
  };
}

/**
 * The consent box: a small dialog that asks for the conversation consent when
 * a conversation is requested without a valid one. The button that the user
 * chose decides how the conversation starts, and gets the focus back.
 */
export function ConversationConsent({
  conversation,
  chosen,
}: {
  conversation: Conversation;
  /** The button that the user chose to start the conversation with. */
  chosen: RefObject<HTMLElement | null>;
}) {
  return conversation.consent.asking ? (
    <ConsentBox conversation={conversation} chosen={chosen} />
  ) : null;
}

function ConsentBox({
  conversation,
  chosen,
}: {
  conversation: Conversation;
  chosen: RefObject<HTMLElement | null>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const [remember, setRemember] = useState(false);
  const { saving, error } = conversation.consent;
  useLayoutEffect(() => {
    const shown = dialog.current;
    if (!shown) return;
    const button = chosen.current;
    // The chosen button is measured before the box takes the focus from it.
    const beside = box(button);
    const position = () => {
      const { top, left } = place(shown, beside, box(document.getElementById('workspace-tools')));
      shown.style.top = `${top}px`;
      shown.style.left = `${left}px`;
      shown.style.maxHeight = `calc(100dvh - ${top + gap}px)`;
    };
    shown.showModal();
    position();
    heading.current?.focus();
    window.addEventListener('resize', position);
    return () => {
      window.removeEventListener('resize', position);
      shown.close();
      button?.focus();
    };
  }, [chosen]);
  return (
    <dialog
      ref={dialog}
      className="conversation-consent"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-text`}
      onCancel={(event) => {
        event.preventDefault();
        conversation.decline();
      }}
    >
      <h2 id={`${id}-title`} ref={heading} tabIndex={-1}>
        Samtal med Skyttel
      </h2>
      <div id={`${id}-text`}>
        {conversationConsentText.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      <label className="conversation-consent-remember">
        <input
          type="checkbox"
          checked={remember}
          aria-describedby={`${id}-revoke`}
          onChange={(event) => setRemember(event.target.checked)}
        />
        Fråga inte igen för det här hushållet
      </label>
      <p id={`${id}-revoke`} className="conversation-consent-revoke">
        Du kan återkalla det i Inställningar.
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="conversation-consent-actions">
        <button
          type="button"
          className="primary"
          disabled={saving}
          onClick={() => void conversation.approve(remember)}
        >
          Godkänn och starta
        </button>
        <button type="button" onClick={conversation.decline}>
          Avbryt
        </button>
      </div>
    </dialog>
  );
}
