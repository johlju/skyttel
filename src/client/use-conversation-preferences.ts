import { useEffect, useRef, useState } from 'react';
import {
  type ConversationPreferences,
  defaultConversationPreferences,
} from '../shared/conversation-preferences.js';
import { request } from './map-request.js';

type Change = {
  patch: Partial<ConversationPreferences>;
  kind: 'draft' | 'width' | 'reset';
  resolve: (saved: boolean) => void;
};

/** Serialize partial personal choices so rapid arrow presses do not lose a step. */
export function useConversationPreferences(path: string) {
  const [preferences, setPreferences] = useState(defaultConversationPreferences);
  const [known, setKnown] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [widthFeedback, setWidthFeedback] = useState('');
  const accepted = useRef(defaultConversationPreferences);
  const queue = useRef<Change[]>([]);
  const inFlight = useRef<Change | null>(null);
  const running = useRef(false);
  const preview = useRef(false);
  const previewPatch = useRef<Partial<ConversationPreferences>>({});
  const epoch = useRef(0);
  const revision = useRef(0);
  const reads = useRef(0);
  const requests = useRef<AbortController | null>(null);
  useEffect(() => {
    const generation = ++epoch.current;
    const controller = new AbortController();
    requests.current = controller;
    setKnown(false);
    setPending(false);
    setPreferences(defaultConversationPreferences);
    accepted.current = defaultConversationPreferences;
    setFeedback('');
    setWidthFeedback('');
    const refresh = () => {
      if (running.current || preview.current) return;
      const before = revision.current;
      const reading = ++reads.current;
      void request<ConversationPreferences>(
        `${path}/conversation-preferences`,
        undefined,
        controller.signal,
      )
        .then((value) => {
          if (
            generation !== epoch.current ||
            before !== revision.current ||
            reading !== reads.current ||
            running.current ||
            preview.current
          )
            return;
          accepted.current = value;
          setPreferences(value);
          setKnown(true);
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setFeedback('Valet kunde inte läsas in. Ladda om sidan och försök igen.');
        });
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      epoch.current++;
      controller.abort();
      window.removeEventListener('focus', refresh);
      for (const item of queue.current) item.resolve(false);
      queue.current = [];
      inFlight.current = null;
      running.current = false;
      preview.current = false;
      previewPatch.current = {};
    };
  }, [path]);
  async function change(patch: Partial<ConversationPreferences>, kind: Change['kind']) {
    if (!known) return false;
    revision.current++;
    preview.current = false;
    previewPatch.current = {};
    setPreferences((value) => ({ ...value, ...patch }));
    if (kind === 'draft') setFeedback('');
    else setWidthFeedback('');
    const completion = new Promise<boolean>((resolve) =>
      queue.current.push({ patch, kind, resolve }),
    );
    if (!running.current) {
      running.current = true;
      setPending(true);
      const generation = epoch.current;
      void (async () => {
        while (queue.current.length && generation === epoch.current) {
          const item = queue.current.shift();
          if (!item) break;
          inFlight.current = item;
          try {
            const result = await request<ConversationPreferences>(
              `${path}/conversation-preferences`,
              item.patch,
              requests.current?.signal,
            );
            if (generation !== epoch.current) {
              item.resolve(false);
              return;
            }
            accepted.current = result;
            inFlight.current = null;
            const shown = { ...result };
            for (const waiting of queue.current) Object.assign(shown, waiting.patch);
            Object.assign(shown, previewPatch.current);
            setPreferences(shown);
            if (item.kind === 'draft') setFeedback('Valet är sparat');
            if (item.kind === 'reset') setWidthFeedback('Bredderna är återställda');
            item.resolve(true);
          } catch {
            item.resolve(false);
            if (generation !== epoch.current) return;
            inFlight.current = null;
            setPreferences(accepted.current);
            if (item.kind === 'draft') setFeedback('Valet kunde inte sparas. Försök igen.');
            else setWidthFeedback('Bredderna kunde inte sparas. Försök igen.');
            for (const waiting of queue.current) waiting.resolve(false);
            queue.current = [];
          }
        }
        if (generation === epoch.current) {
          running.current = false;
          setPending(false);
        }
      })();
    }
    return completion;
  }
  return {
    preferences,
    known,
    pending,
    feedback,
    widthFeedback,
    configure: (showDraftOnStart: boolean) =>
      pending ? Promise.resolve(false) : change({ showDraftOnStart }, 'draft'),
    previewWidths(patch: Partial<Pick<ConversationPreferences, 'textWidth' | 'draftWidth'>>) {
      preview.current = true;
      previewPatch.current = patch;
      setPreferences((value) => ({ ...value, ...patch }));
    },
    resize: (patch: Partial<Pick<ConversationPreferences, 'textWidth' | 'draftWidth'>>) =>
      change(patch, 'width'),
    resetWidths: () => change({ textWidth: 400, draftWidth: 340 }, 'reset'),
    cancelPreview() {
      preview.current = false;
      previewPatch.current = {};
      const shown = { ...accepted.current };
      if (inFlight.current) Object.assign(shown, inFlight.current.patch);
      for (const waiting of queue.current) Object.assign(shown, waiting.patch);
      setPreferences(shown);
    },
  };
}
