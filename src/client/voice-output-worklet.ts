// GPT-Live sends one unlabelled mono stream. Decide which samples reach the
// speaker on the rendering thread, including the first sample after a quiet gap.
declare class AudioWorkletProcessor {
  port: MessagePort;
}
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;
declare const sampleRate: number;

class VoiceOutput extends AudioWorkletProcessor {
  private closed = false;
  private muted = false;
  private correcting = false;
  private quietFrames = 0;
  private readonly minimumQuiet = Math.ceil(sampleRate * 0.2);

  constructor() {
    super();
    this.port.onmessage = ({ data }) => {
      if (data === 'close') this.closed = true;
      else if (data === 'interrupt') {
        this.muted = true;
        this.correcting = false;
        this.quietFrames = 0;
      } else if (data === 'correction') {
        this.correcting = true;
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]) {
    if (this.closed) return false;
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!input || !output) return true;
    if (!this.muted) {
      output.set(input);
      return true;
    }
    for (let i = 0; i < input.length; i++) {
      if (this.correcting && this.quietFrames >= this.minimumQuiet) {
        this.muted = false;
        output.set(input.subarray(i), i);
        this.port.postMessage('open');
        break;
      }
      this.quietFrames = Math.abs(input[i]) > 0.015 ? 0 : this.quietFrames + 1;
    }
    return true;
  }
}
registerProcessor('skyttel-voice-output', VoiceOutput);

export {};
