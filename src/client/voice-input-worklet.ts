// PCM stays only in this audio thread until WebRTC can receive it. Audio goes
// through the negotiated media track, never the Live JSON data channel.
declare class AudioWorkletProcessor {
  port: MessagePort;
}
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;
declare const sampleRate: number;

class HeldVoiceInput extends AudioWorkletProcessor {
  private capture = false;
  private transmit = false;
  private blocks: Float32Array[] = [];
  private block = 0;
  private offset = 0;
  private waiting = false;
  constructor() {
    super();
    this.port.onmessage = ({
      data,
    }: MessageEvent<{ capture?: boolean; transmit?: boolean; discard?: boolean }>) => {
      if (data.discard) {
        this.blocks = [];
        this.block = this.offset = 0;
        this.waiting = false;
      }
      if (data.capture !== undefined) this.capture = data.capture;
      if (data.transmit !== undefined) this.transmit = data.transmit;
    };
  }
  process(inputs: Float32Array[][], outputs: Float32Array[][]) {
    const incoming = inputs[0]?.[0];
    const outgoing = outputs[0]?.[0];
    if (this.capture && incoming) {
      // Match the transport's startup timeout and fail visibly rather than
      // retaining unbounded speech or silently dropping its beginning.
      if ((this.blocks.length - this.block) * incoming.length > sampleRate * 30) {
        this.capture = false;
        this.blocks = [];
        this.block = this.offset = 0;
        this.port.postMessage({ failed: true });
        return false;
      }
      this.blocks.push(incoming.slice());
      this.waiting = true;
    }
    if (!outgoing || !this.transmit) return true;
    let written = 0;
    while (written < outgoing.length && this.block < this.blocks.length) {
      const block = this.blocks[this.block];
      const amount = Math.min(outgoing.length - written, block.length - this.offset);
      outgoing.set(block.subarray(this.offset, this.offset + amount), written);
      written += amount;
      this.offset += amount;
      if (this.offset === block.length) {
        this.block++;
        this.offset = 0;
      }
    }
    if (this.block === this.blocks.length) {
      this.blocks = [];
      this.block = 0;
      if (!this.capture && this.waiting) {
        this.waiting = false;
        this.port.postMessage({ drained: true });
      }
    } else if (this.block >= 1024) {
      this.blocks.splice(0, this.block);
      this.block = 0;
    }
    return true;
  }
}
registerProcessor('skyttel-held-input', HeldVoiceInput);

export {};
