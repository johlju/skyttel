import { type ReactNode, useEffect } from 'react';
import type { TextAssistantView } from '../shared/text-assistant.js';
import type { TranscriptRow } from './ConversationTranscript.js';
import { useVoice, type Voice, type VoiceControl } from './use-voice.js';
import { WorkspaceIcon } from './WorkspaceTools.js';

/** A voice that keeps its own state, for use outside a conversation. */
export function VoiceAssistant({
  onControl,
  compact,
  children,
  ...options
}: {
  householdId: string;
  assistant: TextAssistantView;
  onAssistant: (view: TextAssistantView) => void;
  onAccessLost: () => void;
  onRecoveryNeeded?: () => void;
  autoStart?: boolean;
  compact?: boolean;
  children?: ReactNode;
  onTranscript?: (row: TranscriptRow) => void;
  onControl?: (control: VoiceControl | null) => void;
}) {
  const voice = useVoice(options);
  const { label, microphone, disabled, activate } = voice;
  useEffect(() => {
    onControl?.({ label, microphone, disabled, activate });
  }, [onControl, label, microphone, disabled, activate]);
  useEffect(() => () => onControl?.(null), [onControl]);
  return (
    <VoicePanel voice={voice} working={options.assistant.phase === 'working'} compact={compact}>
      {children}
    </VoicePanel>
  );
}

/** Shows the voice and calls its commands. It keeps no state of the voice. */
export function VoicePanel({
  voice,
  working,
  compact,
  children,
  information,
}: {
  voice: Voice;
  working: boolean;
  compact?: boolean;
  children?: ReactNode;
  information?: { open: boolean; onOpenChange: (open: boolean) => void };
}) {
  const { state, disconnected, paused, activity, microphone, label, error, playbackBlocked } =
    voice;
  return (
    <section aria-label="Skyttels röst" className="voice-assistant" data-voice-state={state}>
      <span
        className={`microphone-state${state === 'listening' && !disconnected && !paused ? ' connected' : ''}`}
      >
        {state === 'listening' && !disconnected
          ? paused
            ? 'Mikrofonen är pausad'
            : 'Mikrofonen är på'
          : 'Mikrofonen är av'}
      </span>
      {state === 'listening' && (
        <div className="voice-activity">
          <span
            aria-hidden="true"
            className={`voice-waveform${activity.microphone || activity.speaker ? ' has-sound' : ''}`}
          >
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>
            {activity.speaker
              ? 'Skyttel talar'
              : activity.microphone && microphone === 'on'
                ? 'Du talar'
                : microphone === 'on'
                  ? 'Lyssnar'
                  : 'Du kan fortfarande höra Skyttel'}
          </span>
        </div>
      )}
      {children}
      <div className="voice-controls">
        {state === 'idle' ? (
          <button
            type="button"
            className="primary"
            disabled={working}
            onClick={() => void voice.start()}
          >
            Starta röst
          </button>
        ) : (
          <button type="button" disabled={state === 'closing'} onClick={() => void voice.stop()}>
            Stäng av rösten
          </button>
        )}
        {(state === 'listening' || state === 'connecting' || state === 'permission') && (
          <button
            type="button"
            aria-pressed={state === 'listening' ? paused : undefined}
            onClick={voice.activate}
          >
            <WorkspaceIcon name={microphone === 'on' ? 'stop' : 'mic'} />
            {label}
          </button>
        )}
      </div>
      <details
        className="voice-information"
        hidden={compact}
        open={information?.open}
        onToggle={information && ((event) => information.onOpenChange(event.currentTarget.open))}
      >
        <summary>Om rösten</summary>
        <p>
          Rösten använder samma samtal och hela ditt utkast. OpenAI behandlar ljudet. Text och
          kartans formulär finns kvar.
        </p>
        <p>
          AI-rösten kan innehålla fel. Skyttels status och kvitton bekräftar vad som faktiskt har
          sparats eller markerats.
        </p>
      </details>
      <p
        className="voice-status"
        aria-live="polite"
        hidden={compact && state === 'listening' && !disconnected && voice.phase !== 'recovery'}
      >
        {state === 'permission'
          ? 'Väntar på mikrofonåtkomst. Mikrofonen är av tills du tillåter den och anslutningen är klar.'
          : state === 'connecting'
            ? 'Ansluter rösten… Mikrofonen är avstängd tills tjänsten är klar.'
            : state === 'closing'
              ? 'Stänger rösten… Mikrofonen är avstängd.'
              : state === 'idle'
                ? 'Rösten är avstängd.'
                : disconnected
                  ? 'Anslutningen är tillfälligt bruten. Mikrofonen är avstängd medan anslutningen kontrolleras.'
                  : voice.phase === 'working'
                    ? 'Assistenten arbetar…'
                    : voice.phase === 'recovery'
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
          <button type="button" onClick={voice.playAudio}>
            Spela upp ljud
          </button>
        </div>
      )}
    </section>
  );
}
