import { useRef, useState } from 'react';
import { ConversationConsent } from '../../src/client/ConversationConsent.js';
import {
  ConversationNoticeAnnouncements,
  ConversationNoticeCard,
  useConversationNotice,
} from '../../src/client/ConversationNotice.js';
import {
  type ConversationPresentation,
  ConversationWorkspace,
} from '../../src/client/TextAssistant.js';
import {
  type ConversationMode,
  conversationOngoing,
  useConversation,
} from '../../src/client/use-conversation.js';
import { VoiceBox } from '../../src/client/VoiceBox.js';
import type { MapSelection } from '../../src/shared/text-assistant.js';
import { conversationTools } from './conversation.js';

/**
 * A conversation that keeps its own state, for tests outside the household's
 * map. It offers what the map offers for a conversation: the two conversation
 * buttons, the consent box and the voice box. The text button opens and closes
 * the text view while voice-only starts keep it closed.
 */
export function StandaloneConversation({
  onMapChange,
  onAccessLost,
  onSelectItem,
  ...presentation
}: ConversationPresentation & {
  onMapChange: () => void;
  onAccessLost: () => void;
  onSelectItem: (target: MapSelection, signal: AbortSignal) => Promise<boolean>;
}) {
  const chosen = useRef<HTMLElement | null>(null);
  const microphone = useRef<HTMLButtonElement>(null);
  const [textViewOpen, setTextViewOpen] = useState(false);
  const conversation = useConversation({
    householdId: presentation.householdId,
    onStarted: (mode) => {
      if (mode === 'text') setTextViewOpen(true);
    },
    onMapChange,
    onAccessLost,
    onSelectItem,
  });
  const { voice } = conversation;
  const noticeState = useConversationNotice({
    conditions: {
      disconnectedActive: Boolean(
        conversation.disconnected && conversationOngoing(conversation, textViewOpen),
      ),
      disconnectedIdle: Boolean(
        conversation.disconnected && !conversationOngoing(conversation, textViewOpen),
      ),
      unavailable: conversation.available === false,
      taskFailed: Boolean(conversation.taskFailed),
      ...(conversation.voice.failure ? { [conversation.voice.failure.noticeId]: true } : {}),
      playbackStopped: conversation.voice.playbackBlocked,
    },
    ongoing: conversationOngoing(conversation, textViewOpen),
    requested: conversation.noticeRequested ?? 0,
    eventKey: `${conversation.session?.id}:${conversation.session?.revision}:${conversation.voice.failure?.occurrence ?? 0}`,
    diagnostic: conversation.voice.failure
      ? {
          noticeId: conversation.voice.failure.noticeId,
          reference: conversation.voice.failure.diagnosticId,
        }
      : undefined,
  });
  const notice = noticeState.notice && (
    <ConversationNoticeCard
      notice={noticeState.notice}
      closable={noticeState.closable}
      onDismiss={noticeState.dismiss}
      onAction={conversation.voice.playAudio}
      focusAfterRemoval={() => microphone.current}
    />
  );
  return (
    <>
      {(Object.keys(conversationTools) as ConversationMode[]).map((mode) => (
        <button
          key={mode}
          ref={mode === 'voice' ? microphone : undefined}
          type="button"
          aria-pressed={mode === 'voice' ? voice.microphone === 'on' : undefined}
          disabled={
            mode === 'voice' &&
            Boolean(conversation.session) &&
            (voice.disabled || conversation.inputBlocked)
          }
          aria-expanded={mode === 'text' ? textViewOpen : undefined}
          onClick={(event) => {
            chosen.current = event.currentTarget;
            // In a conversation that is going on, the voice button is the microphone.
            if (mode === 'voice' && conversation.session && !conversation.inputBlocked)
              voice.activate();
            else if (conversation.session) setTextViewOpen(!textViewOpen);
            else conversation.begin(mode);
          }}
        >
          {conversationTools[mode]}
        </button>
      ))}
      <VoiceBox
        conversation={conversation}
        microphoneButton={() => microphone.current}
        notice={textViewOpen ? null : notice}
      />
      <ConversationNoticeAnnouncements announcement={noticeState.announcement} />
      <ConversationConsent conversation={conversation} chosen={chosen} />
      <ConversationWorkspace
        conversation={conversation}
        notice={notice}
        textViewOpen={textViewOpen}
        onCloseTextView={() => setTextViewOpen(false)}
        {...presentation}
      />
    </>
  );
}
