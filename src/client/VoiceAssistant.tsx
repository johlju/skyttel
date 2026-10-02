import type { ReactNode } from 'react';
import type { Voice } from './use-voice.js';

/**
 * Shows what the voice box has no word for: why the voice failed, and audio
 * that the browser stopped. It keeps no state of the voice.
 */
export function VoicePanel({ voice, children }: { voice: Voice; children?: ReactNode }) {
  const { error, playbackBlocked } = voice;
  return (
    <section aria-label="Skyttels röst" className="voice-assistant">
      {children}
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
