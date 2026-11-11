import type { PlaybackRecording } from '../../scripts/model-evaluation/playback.js';

/** Controlled external recognizer: inspect only the rendered WAV, with no
 * expected response words or server/transcript hints. */
export function renderedToneWindows(recording: PlaybackRecording, frequency: number) {
  return toneWindowEnds(recording, frequency).length;
}

/** A lower device-clock boundary for the last complete detected tone window.
 * Detection resolves 100 ms windows; a partial final window is not included.
 * Source callbacks cross browser/Node scheduling queues and are not playout
 * timestamps. This oracle uses only rendered PCM and receiver clock samples. */
export function renderedToneBoundary(recordings: PlaybackRecording[], frequency: number) {
  let boundary: number | undefined;
  for (const recording of recordings) {
    const end = toneWindowEnds(recording, frequency).at(-1);
    if (end === undefined) continue;
    const position = (recording.firstFrame + end) / recording.sampleRate;
    const clock = recording.clocks.findLast((sample) => sample.position <= position);
    if (clock) boundary = Math.max(boundary ?? -Infinity, clock.at);
  }
  if (boundary !== undefined) return boundary;
  throw new Error(`No rendered ${frequency} Hz tone with a device-clock boundary.`);
}

function toneWindowEnds(recording: PlaybackRecording, frequency: number) {
  const pcm = recording.wav.subarray(44);
  const windowFrames = Math.round(recording.sampleRate / 10);
  const matching: number[] = [];
  for (let start = 0; start + windowFrames < recording.frames; start += windowFrames) {
    const cycleFrames: number[] = [];
    let previousCrossing: number | undefined;
    let peak = 0;
    for (let frame = start + 1; frame < start + windowFrames; frame++) {
      const value = pcm.readInt16LE(frame * 2);
      peak = Math.max(peak, Math.abs(value));
      if (value > 0 && pcm.readInt16LE((frame - 1) * 2) <= 0) {
        if (previousCrossing !== undefined) cycleFrames.push(frame - previousCrossing);
        previousCrossing = frame;
      }
    }
    // Silent edges shorten a tone's presence in a window, not its period.
    // Counting crossings over the whole window can call a partial 880 Hz
    // tone 400 Hz. The median complete cycle also ignores gaps between bursts.
    cycleFrames.sort((a, b) => a - b);
    const period = cycleFrames[Math.floor(cycleFrames.length / 2)];
    const crossings = cycleFrames.length + 1;
    if (
      peak > 100 &&
      Math.abs(crossings - frequency / 10) < 5 &&
      period &&
      Math.abs(recording.sampleRate / period - frequency) < 50
    )
      matching.push(start + windowFrames);
  }
  return matching;
}
