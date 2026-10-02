import { useRef } from 'react';
import { useVoice } from '../../src/client/use-voice.js';
import { VoicePanel } from '../../src/client/VoiceAssistant.js';
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
          cancel: onCancel,
        }}
        microphoneButton={() => button.current}
      />
      <VoicePanel voice={voice} />
    </>
  );
}
