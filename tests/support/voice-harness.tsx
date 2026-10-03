import { useRef } from 'react';
import {
  ConversationNoticeAnnouncements,
  ConversationNoticeCard,
  useConversationNotice,
} from '../../src/client/ConversationNotice.js';
import { useVoice } from '../../src/client/use-voice.js';
import { VoiceBox } from '../../src/client/VoiceBox.js';
import { conversationTools } from './conversation.js';

/** The harness's way to close the voice connection at once, as the map does when it is left. */
export const closeVoiceConnection = 'Stäng röstanslutningen';

/**
 * A voice that keeps its own state, for tests outside the household's map. It
 * offers what the map offers for the voice: the microphone button, the voice
 * box and what the voice box has no word for.
 */
export function StandaloneVoice({
  onCancel = async () => {},
  ...options
}: Parameters<typeof useVoice>[0] & {
  /** Stops the work in progress, as the conversation does. */
  onCancel?: () => Promise<void>;
}) {
  const voice = useVoice(options);
  const button = useRef<HTMLButtonElement>(null);
  const notices = useConversationNotice({
    conditions: {
      ...(voice.failure ? { [voice.failure.noticeId]: true } : {}),
      playbackStopped: voice.playbackBlocked,
    },
    ongoing: voice.starting || voice.state === 'listening',
    requested: 0,
    eventKey: String(voice.failure?.occurrence ?? 0),
    diagnostic: voice.failure
      ? { noticeId: voice.failure.noticeId, reference: voice.failure.diagnosticId }
      : undefined,
  });
  return (
    <>
      <button
        ref={button}
        type="button"
        title={voice.starting ? 'Avbryt starten av rösten' : undefined}
        aria-pressed={voice.microphone === 'on'}
        disabled={voice.disabled}
        onClick={voice.activate}
      >
        {conversationTools.voice}
      </button>
      <button type="button" onClick={() => void voice.stop()}>
        {closeVoiceConnection}
      </button>
      <VoiceBox
        conversation={{
          voice,
          working: options.assistant?.phase === 'working',
          cancel: () => voice.silence(onCancel),
        }}
        microphoneButton={() => button.current}
        notice={
          notices.notice && (
            <ConversationNoticeCard
              key={notices.notice.id}
              notice={notices.notice}
              closable={notices.closable}
              onDismiss={notices.dismiss}
              onAction={voice.playAudio}
              focusAfterRemoval={() => button.current}
            />
          )
        }
      />
      <ConversationNoticeAnnouncements announcement={notices.announcement} />
    </>
  );
}
