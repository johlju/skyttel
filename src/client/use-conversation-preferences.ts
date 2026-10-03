import { useEffect, useState } from 'react';
import {
  type ConversationPreferences,
  defaultConversationPreferences,
} from '../shared/conversation-preferences.js';
import { request } from './map-request.js';

export function useConversationPreferences(path: string) {
  const [preferences, setPreferences] = useState<ConversationPreferences>(
    defaultConversationPreferences,
  );
  const [known, setKnown] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setKnown(false);
    void request<ConversationPreferences>(
      `${path}/conversation-preferences`,
      undefined,
      controller.signal,
    )
      .then((value) => {
        setPreferences(value);
        setKnown(true);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setFeedback('Valet kunde inte läsas in. Ladda om sidan och försök igen.');
      });
    return () => controller.abort();
  }, [path]);
  return {
    preferences,
    known,
    pending,
    feedback,
    async configure(showDraftOnStart: boolean) {
      if (!known || pending) return;
      setPending(true);
      setFeedback('');
      const previous = preferences;
      setPreferences({ showDraftOnStart });
      try {
        setPreferences(
          await request<ConversationPreferences>(`${path}/conversation-preferences`, {
            showDraftOnStart,
          }),
        );
        setFeedback('Valet är sparat');
      } catch {
        setPreferences(previous);
        setFeedback('Valet kunde inte sparas. Försök igen.');
      } finally {
        setPending(false);
      }
    },
  };
}
