import { useCallback, useEffect, useRef, useState } from 'react';
import type { TextAssistantView } from '../shared/text-assistant.js';
import type { VoiceAssistantResponse, VoiceAssistantView } from '../shared/voice-assistant.js';
import type { TranscriptRow } from './ConversationTranscript.js';
import { MapRequestError, request } from './map-request.js';
import { createVoiceTransport, type VoiceTransport } from './voice-transport.js';

type Attempt = {
  path: string;
  controller: AbortController;
  transport?: VoiceTransport;
  voiceId?: string;
  poll?: ReturnType<typeof setTimeout>;
};
async function stopRemote(path: string, id: string) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request<VoiceAssistantResponse>(`${path}/${id}/stop`, {}, controller.signal).catch(
        () => null,
      ),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), 5000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
export function VoiceAssistant(props: {
  householdId: string;
  assistant: TextAssistantView;
  onAssistant: (view: TextAssistantView) => void;
  onAccessLost: () => void;
  onRecoveryNeeded?: () => void;
  autoStart?: boolean;
  onTranscript?: (row: TranscriptRow) => void;
}) {
  const path = `/api/households/${encodeURIComponent(props.householdId)}/text-assistant/${encodeURIComponent(props.assistant.id)}/voice`;
  const latest = useRef(props);
  latest.current = props;
  const current = useRef<Attempt | null>(null);
  const epoch = useRef(0);
  const mounted = useRef(true);
  const [state, setState] = useState<'idle' | 'connecting' | 'listening' | 'closing'>('idle');
  const [voice, setVoice] = useState<VoiceAssistantView | null>(null);
  const [error, setError] = useState('');
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [disconnected, setDisconnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const apply = useCallback((view: TextAssistantView) => {
    const shown = latest.current.assistant;
    if (
      view.id === shown.id &&
      view.revision >= shown.revision &&
      view.review.contentVersion >= shown.review.contentVersion &&
      (view.review.contentVersion > shown.review.contentVersion ||
        view.review.version >= shown.review.version)
    )
      latest.current.onAssistant(view);
  }, []);
  const stop = useCallback(
    async (message = '') => {
      const attempt = current.current;
      if (!attempt) return;
      attempt.transport?.stopCapture();
      current.current = null;
      const generation = ++epoch.current;
      clearTimeout(attempt.poll);
      attempt.controller.abort();
      if (mounted.current) {
        setState('closing');
        setPlaybackBlocked(false);
        setError(message);
      }
      const result = attempt.voiceId ? await stopRemote(attempt.path, attempt.voiceId) : null;
      attempt.transport?.close();
      if (!mounted.current || generation !== epoch.current) return;
      if (result) {
        apply(result.assistant);
        setVoice(result.voice);
      }
      setState('idle');
      if (attempt.voiceId && !result) {
        latest.current.onRecoveryNeeded?.();
        setError(
          'Mikrofonen är avstängd. Serverns avslut kunde inte bekräftas. Kontrollera sparförsök innan du fortsätter; ett genomfört sparande är inte ångrat.',
        );
      }
    },
    [apply],
  );
  useEffect(() => {
    mounted.current = true;
    setState('idle');
    setVoice(null);
    setError('');
    setPlaybackBlocked(false);
    setDisconnected(false);
    return () => {
      mounted.current = false;
      if (current.current?.path === path) void stop();
      epoch.current++;
    };
  }, [path, stop]);
  const start = useCallback(async () => {
    if (current.current) return;
    const attempt: Attempt = { path, controller: new AbortController() };
    current.current = attempt;
    epoch.current++;
    setState('connecting');
    setPaused(false);
    setDisconnected(false);
    setVoice(null);
    setError('');
    const active = () => mounted.current && current.current === attempt;
    const anchor = () => {
      const assistant = latest.current.assistant;
      return {
        revision: assistant.revision,
        draftVersion: assistant.review.version,
        contentVersion: assistant.review.contentVersion,
      };
    };
    const fail = (failure?: unknown, reason = 'network') => {
      if (!active()) return;
      if (failure instanceof MapRequestError && [401, 403].includes(failure.status))
        latest.current.onAccessLost();
      const denied =
        (failure instanceof Error || failure instanceof DOMException) &&
        failure.name === 'NotAllowedError';
      void stop(
        denied
          ? 'Mikrofonen tilläts inte. Tillåt mikrofonen i webbläsaren och försök igen, eller fortsätt med text och formulär.'
          : reason === 'audio'
            ? 'Ljuduppspelningen avbröts. Starta rösten igen eller fortsätt med text. Ett genomfört sparande är inte ångrat.'
            : reason === 'microphone'
              ? 'Mikrofonen slutade fungera. Kontrollera mikrofonen och starta rösten igen, eller fortsätt med text.'
              : reason === 'provider'
                ? 'Rösttjänsten avbröt samtalet. Fortsätt med text eller formulär och kontrollera sparförsök. Ett genomfört sparande är inte ångrat.'
                : 'Röstanslutningen avbröts. Fortsätt med text eller formulär och kontrollera sparförsök. Ett genomfört sparande är inte ångrat.',
      );
    };
    const poll = async () => {
      if (!active() || !attempt.voiceId) return;
      try {
        const result = await request<VoiceAssistantResponse>(
          `${path}/${attempt.voiceId}/poll`,
          anchor(),
          attempt.controller.signal,
        );
        if (!active()) return;
        apply(result.assistant);
        setVoice(result.voice);
        if (result.voice.phase === 'error') {
          fail(undefined, 'provider');
          return;
        }
        if (result.voice.phase === 'closed' || result.voice.phase === 'closing') {
          void stop();
          return;
        }
        attempt.poll = setTimeout(() => void poll(), 500);
      } catch (failure) {
        fail(failure);
      }
    };
    try {
      attempt.transport = createVoiceTransport({
        onReady: () => {
          if (active()) setState('listening');
        },
        onClosed: () => {
          if (active())
            void stop(
              'Rösttjänsten avslutade samtalet. Text och formulär finns kvar. Kontrollera sparförsök om utfallet är oklart.',
            );
        },
        onFailure: (reason) => fail(undefined, reason),
        onPlaybackBlocked: (blocked) => {
          if (active()) setPlaybackBlocked(blocked);
        },
        onDisconnected: (value) => {
          if (active()) setDisconnected(value);
        },
        onTranscript: (row) => {
          if (active()) latest.current.onTranscript?.(row);
        },
      });
      await attempt.transport.connect(async (sdp, options) => {
        let result: VoiceAssistantResponse;
        try {
          result = await request<VoiceAssistantResponse>(
            path,
            { sdp, ...anchor() },
            options.signal,
          );
        } catch (failure) {
          fail(failure);
          throw failure;
        }
        if (!active()) {
          void stopRemote(path, result.voice.id);
          throw new DOMException('Voice setup cancelled', 'AbortError');
        }
        attempt.voiceId = result.voice.id;
        apply(result.assistant);
        setVoice(result.voice);
        attempt.poll = setTimeout(() => void poll(), 500);
        if (!result.sdp) throw new Error('Missing voice answer');
        return result.sdp;
      }, attempt.controller.signal);
    } catch (failure) {
      fail(failure);
    }
  }, [path, apply, stop]);
  useEffect(() => {
    if (props.autoStart) void start();
  }, [props.autoStart, start]);
  return (
    <section aria-label="Skyttels röst" className="voice-assistant">
      <div className="voice-controls">
        {state === 'idle' ? (
          <button
            type="button"
            className="primary"
            disabled={props.assistant.phase === 'working'}
            onClick={() => void start()}
          >
            Starta röst
          </button>
        ) : (
          <button type="button" disabled={state === 'closing'} onClick={() => void stop()}>
            Stäng av rösten
          </button>
        )}
        {state === 'listening' && (
          <button
            type="button"
            aria-pressed={paused}
            onClick={() => {
              current.current?.transport?.setMicrophonePaused(!paused);
              setPaused(!paused);
            }}
          >
            {paused ? 'Återuppta mikrofon' : 'Pausa mikrofon'}
          </button>
        )}
        <span
          className={`microphone-state${state === 'listening' && !disconnected && !paused ? ' connected' : ''}`}
        >
          {state === 'listening' && !disconnected
            ? paused
              ? 'Mikrofonen är pausad'
              : 'Mikrofonen är på'
            : 'Mikrofonen är av'}
        </span>
      </div>
      <p>
        Rösten använder samma samtal och hela ditt utkast. OpenAI behandlar ljudet. Text och kartans
        formulär finns kvar.
      </p>
      <p>
        AI-rösten kan innehålla fel. Skyttels status och kvitton bekräftar vad som faktiskt har
        sparats eller markerats.
      </p>
      <p className="voice-status" aria-live="polite">
        {state === 'connecting'
          ? 'Ansluter rösten… Mikrofonen är avstängd tills tjänsten är klar.'
          : state === 'closing'
            ? 'Stänger rösten… Mikrofonen är avstängd.'
            : state === 'idle'
              ? 'Rösten är avstängd.'
              : disconnected
                ? 'Anslutningen är tillfälligt bruten. Mikrofonen är avstängd medan anslutningen kontrolleras.'
                : voice?.phase === 'working'
                  ? 'Assistenten arbetar…'
                  : voice?.phase === 'recovery'
                    ? 'Kontrollera det tidigare sparförsöket innan nya ändringar.'
                    : paused
                      ? 'Mikrofonen är pausad. Samtalet är kvar och du kan fortfarande höra Skyttel.'
                      : 'Lyssnar. Du kan tala, rätta eller be att spara hela utkastet.'}
      </p>
      {error && <p role="alert">{error}</p>}
      {playbackBlocked && (
        <div>
          <p role="alert">
            Webbläsaren stoppade ljuduppspelningen. Starta ljudet för att höra rösten.
          </p>
          <button type="button" onClick={() => void current.current?.transport?.playAudio()}>
            Spela upp ljud
          </button>
        </div>
      )}
    </section>
  );
}
