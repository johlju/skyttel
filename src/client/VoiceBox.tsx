import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ContextAnnouncement, ContextSymbol } from './ConversationContext.js';
import type { Conversation } from './use-conversation.js';
import type { Voice } from './use-voice.js';
import './voice-box.css';

// The status words, highest first: when several apply, the first one is shown.
const statuses = [
  { id: 'working', word: 'Skyttel arbetar', wave: 'still', stop: true },
  { id: 'speaking', word: 'Skyttel talar', wave: 'skyttel', stop: true },
  { id: 'saved', word: 'Sparat', wave: 'still', stop: false },
  { id: 'starting', word: 'Rösten startar', wave: 'dimmed', stop: false },
  { id: 'user', word: 'Du talar', wave: 'user', stop: false },
  { id: 'waiting', word: 'Väntar på ditt svar', wave: 'still', stop: false },
  { id: 'listening', word: 'Lyssnar', wave: 'still', stop: false },
] as const;

export type VoiceBoxStatus = Omit<(typeof statuses)[number], 'wave'> & {
  wave: 'still' | 'dimmed' | 'user' | 'skyttel';
};

type VoiceBoxState = Pick<
  Voice,
  'microphone' | 'starting' | 'speaking' | 'userSpeaking' | 'working' | 'waitingForAnswer' | 'saved'
>;

/**
 * What the voice box shows, or null when the box is not shown. The box belongs
 * to the voice: a conversation with text alone never shows it.
 */
export function voiceBoxStatus(voice: VoiceBoxState, working: boolean): VoiceBoxStatus | null {
  const on = voice.microphone === 'on';
  const applies = {
    // A written message counts while the microphone is on.
    working: voice.working || (on && working),
    speaking: voice.speaking,
    saved: voice.saved,
    starting: voice.starting,
    user: voice.userSpeaking,
    waiting: voice.waitingForAnswer,
    listening: on,
  };
  const status = statuses.find((status) => applies[status.id]) ?? null;
  return status?.id === 'waiting' && !on ? { ...status, wave: 'dimmed' } : status;
}

// How much each of the seven bars takes of the sound level, highest in the middle.
const barWeights = [0.45, 0.7, 0.9, 1, 0.85, 0.65, 0.4];
const reducedMotion = '(prefers-reduced-motion: reduce)';

/**
 * Seven bars. While the user talks they follow the microphone's sound level.
 * The other forms, and both fixed forms at reduced motion, are in the styles.
 */
function Waveform({ form, level }: { form: VoiceBoxStatus['wave']; level: () => number }) {
  const wave = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const bars = [...(wave.current?.children ?? [])] as HTMLElement[];
    if (form !== 'user') return;
    const reduced = window.matchMedia?.(reducedMotion);
    let frame = 0;
    const draw = (now: number) => {
      const heard = level();
      for (const [index, bar] of bars.entries()) {
        const sway = 0.65 + 0.35 * Math.sin(now / 90 + index * 1.9);
        bar.style.height = `${(4 + heard * 20 * barWeights[index] * sway).toFixed(1)}px`;
      }
      frame = requestAnimationFrame(draw);
    };
    const follow = () => {
      cancelAnimationFrame(frame);
      for (const bar of bars) bar.style.height = '';
      if (!reduced?.matches) frame = requestAnimationFrame(draw);
    };
    follow();
    reduced?.addEventListener('change', follow);
    return () => {
      reduced?.removeEventListener('change', follow);
      cancelAnimationFrame(frame);
      for (const bar of bars) bar.style.height = '';
    };
  }, [form, level]);
  return (
    <span ref={wave} aria-hidden="true" className="voice-wave" data-form={form}>
      {barWeights.map((weight) => (
        <i key={weight} />
      ))}
    </span>
  );
}

/**
 * One status occurrence across the voice box, text view and Settings. The
 * household keeps this mounted when the visible surfaces move or disappear.
 */
export function VoiceStatusAnnouncements({
  conversation,
  microphoneButton,
  textViewOpen = false,
  microphoneOffExplained = false,
}: {
  conversation: Pick<Conversation, 'voice' | 'working'> & Partial<Pick<Conversation, 'session'>>;
  microphoneButton?: () => HTMLElement | null;
  textViewOpen?: boolean;
  microphoneOffExplained?: boolean;
}) {
  const { voice } = conversation;
  const status = voiceBoxStatus(voice, conversation.working);
  const on = (voice.microphoneAnnouncement ?? voice.microphone) === 'on';
  const [announcement, setAnnouncement] = useState({ count: 0, text: '' });
  const shown = status?.id ?? null;
  const before = useRef({ on, shown });
  // Whether the user has yet to be told that the microphone, once on, is off.
  const owesOff = useRef(on);
  const announcedSave = useRef('');
  const toldWork = useRef(false);
  const working = voice.working || conversation.working;
  const microphoneButtonNow = useRef(microphoneButton);
  microphoneButtonNow.current = microphoneButton;
  useEffect(() => {
    const previous = before.current;
    before.current = { on, shown };
    if (on) owesOff.current = true;
    if (!working) toldWork.current = false;
    // A screen reader says the state of the button by itself while the focus is on it.
    const button = microphoneButtonNow.current?.();
    const saysState = Boolean(button) && document.activeElement === button;
    let text = '';
    if (on && !previous.on) text = saysState ? '' : 'Lyssnar';
    else if (working && !toldWork.current && (shown === 'working' || textViewOpen)) {
      toldWork.current = true;
      text = 'Skyttel arbetar';
    } else if (shown === 'saved' && announcedSave.current !== voice.savedId) {
      announcedSave.current = voice.savedId ?? '';
      text = 'Sparat';
    } else if (!on && !shown && owesOff.current) {
      owesOff.current = false;
      text = saysState || microphoneOffExplained ? '' : 'Mikrofonen är av';
    }
    if (text) setAnnouncement(({ count }) => ({ count: count + 1, text }));
  }, [on, shown, voice.savedId, working, textViewOpen, microphoneOffExplained]);
  return (
    <>
      <p className="voice-announcement" aria-live="polite" aria-atomic="true">
        <span key={announcement.count}>{announcement.text}</span>
      </p>
      <ContextAnnouncement
        percentage={conversation.session?.contextPercentage ?? 0}
        visible={Boolean(status)}
        conversationKey={`${conversation.session?.id ?? ''}:${conversation.session?.contextRevision ?? 0}`}
      />
    </>
  );
}

export function VoiceBox({
  conversation,
  microphoneButton,
  focusAfterStop,
  notice,
  hideStop = false,
  announce = true,
}: {
  conversation: Pick<Conversation, 'voice' | 'working' | 'cancel'> &
    Partial<Pick<Conversation, 'session'>>;
  microphoneButton?: () => HTMLElement | null;
  focusAfterStop?: () => HTMLElement | null;
  notice?: ReactNode;
  hideStop?: boolean;
  /** The household mounts announcements once, outside changing visual surfaces. */
  announce?: boolean;
}) {
  const { voice } = conversation;
  const status = voiceBoxStatus(voice, conversation.working);
  const microphoneButtonNow = useRef(microphoneButton);
  microphoneButtonNow.current = microphoneButton;
  const focusAfterStopNow = useRef(focusAfterStop);
  focusAfterStopNow.current = focusAfterStop;
  // The stop icon goes away while it may have the focus, which must not be lost.
  const stopFocused = useRef(false);
  const stopShown = Boolean(status?.stop && !hideStop);
  useLayoutEffect(() => {
    if (stopShown || !stopFocused.current) return;
    stopFocused.current = false;
    (focusAfterStopNow.current?.() ?? microphoneButtonNow.current?.())?.focus();
  }, [stopShown]);
  const corner = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = corner.current;
    if (!node) return;
    const measure = () =>
      node
        .closest<HTMLElement>('.household-map')
        ?.style.setProperty('--conversation-corner-height', `${node.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="conversation-corner" ref={corner}>
      {announce && (
        <VoiceStatusAnnouncements conversation={conversation} microphoneButton={microphoneButton} />
      )}
      {status && (
        // biome-ignore lint/a11y/useSemanticElements: a named group that is not a form
        <div className="voice-box" role="group" aria-label="Röstruta">
          <Waveform form={status.wave} level={voice.level} />
          {status.id === 'saved' && (
            <svg className="voice-saved" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="m5 12 4 4L19 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
          <span>{status.word}</span>
          <ContextSymbol percentage={conversation.session?.contextPercentage ?? 0} />
          {status.stop && !hideStop && (
            <button
              type="button"
              className="voice-stop"
              aria-label="Avbryt"
              title="Avbryt"
              onFocus={() => {
                stopFocused.current = true;
              }}
              onBlur={(event) => {
                if (event.currentTarget.isConnected) stopFocused.current = false;
              }}
              onClick={() => {
                // Suggested changes stay in the draft. Only the work and the voice stop.
                void conversation.cancel();
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
              </svg>
            </button>
          )}
        </div>
      )}
      {notice}
    </div>
  );
}
