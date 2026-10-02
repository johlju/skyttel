import { useRef } from 'react';
import { ConversationConsent } from '../../src/client/ConversationConsent.js';
import {
  type ConversationPresentation,
  ConversationWorkspace,
} from '../../src/client/TextAssistant.js';
import { type ConversationMode, useConversation } from '../../src/client/use-conversation.js';
import type { MapSelection } from '../../src/shared/text-assistant.js';
import { conversationTools } from './conversation.js';

/**
 * A conversation that keeps its own state, for tests outside the household's
 * map. It offers what the map offers for a start: the two conversation
 * buttons and the consent box.
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
  const conversation = useConversation({
    householdId: presentation.householdId,
    onMapChange,
    onAccessLost,
    onSelectItem,
  });
  return (
    <>
      {(Object.keys(conversationTools) as ConversationMode[]).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={(event) => {
            chosen.current = event.currentTarget;
            conversation.begin(mode);
          }}
        >
          {conversationTools[mode]}
        </button>
      ))}
      <ConversationConsent conversation={conversation} chosen={chosen} />
      <ConversationWorkspace conversation={conversation} {...presentation} />
    </>
  );
}
