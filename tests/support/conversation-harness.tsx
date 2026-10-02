import { useRef } from 'react';
import { ConversationConsent } from '../../src/client/ConversationConsent.js';
import {
  type ConversationPresentation,
  ConversationWorkspace,
} from '../../src/client/TextAssistant.js';
import { type ConversationMode, useConversation } from '../../src/client/use-conversation.js';
import { VoiceBox } from '../../src/client/VoiceBox.js';
import type { MapSelection } from '../../src/shared/text-assistant.js';
import { conversationTools } from './conversation.js';

/**
 * A conversation that keeps its own state, for tests outside the household's
 * map. It offers what the map offers for a conversation: the two conversation
 * buttons, the consent box and the voice box.
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
  const conversation = useConversation({
    householdId: presentation.householdId,
    onMapChange,
    onAccessLost,
    onSelectItem,
  });
  const { voice } = conversation;
  return (
    <>
      {(Object.keys(conversationTools) as ConversationMode[]).map((mode) => (
        <button
          key={mode}
          ref={mode === 'voice' ? microphone : undefined}
          type="button"
          aria-pressed={mode === 'voice' ? voice.microphone === 'on' : undefined}
          disabled={mode === 'voice' && Boolean(conversation.session) && voice.disabled}
          onClick={(event) => {
            chosen.current = event.currentTarget;
            // In a conversation that is going on, the voice button is the microphone.
            if (mode === 'voice' && conversation.session) voice.activate();
            else conversation.begin(mode);
          }}
        >
          {conversationTools[mode]}
        </button>
      ))}
      <VoiceBox conversation={conversation} microphoneButton={() => microphone.current} />
      <ConversationConsent conversation={conversation} chosen={chosen} />
      <ConversationWorkspace conversation={conversation} {...presentation} />
    </>
  );
}
