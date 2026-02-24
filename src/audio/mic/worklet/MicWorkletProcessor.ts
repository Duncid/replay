import type { MicWorkletProcessorOptions } from "@/transcription/types";

declare const sampleRate: number;
declare const currentTime: number;
declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: AudioWorkletNodeOptions);
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}
declare function registerProcessor(
  name: string,
  processorCtor: new (options?: AudioWorkletNodeOptions) => AudioWorkletProcessor,
): void;

class MicWorkletProcessor extends AudioWorkletProcessor {
  private mode: "sab" | "message";
  private chunkSize: number;
  private sampleRateHz: number;
  private capacity = 0;
  private pcm: Float32Array | null = null;
  private state: Int32Array | null = null;
  private messageBuffer: Float32Array;
  private messageBufferIndex = 0;
  private framesSinceLevel = 0;

  constructor(options: AudioWorkletNodeOptions) {
    super();
    const processorOptions = (options.processorOptions ??
      {}) as MicWorkletProcessorOptions;
    this.mode = processorOptions.mode ?? "message";
    this.chunkSize = processorOptions.chunkSize ?? 1024;
    this.sampleRateHz = processorOptions.sampleRate ?? sampleRate;
    this.messageBuffer = new Float32Array(this.chunkSize);

    if (
      this.mode === "sab" &&
      processorOptions.pcmSAB &&
      processorOptions.stateSAB &&
      processorOptions.capacity
    ) {
      this.capacity = processorOptions.capacity;
      this.pcm = new Float32Array(processorOptions.pcmSAB);
      this.state = new Int32Array(processorOptions.stateSAB);
    }
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channel = input[0];
    if (!channel || channel.length === 0) return true;

    let rms = 0;
    for (let i = 0; i < channel.length; i++) {
      const sample = channel[i];
      rms += sample * sample;

      if (this.mode === "sab" && this.pcm && this.state && this.capacity > 0) {
        const writeIndex = Atomics.load(this.state, 0);
        this.pcm[writeIndex % this.capacity] = sample;
        Atomics.store(this.state, 0, writeIndex + 1);
      } else {
        this.messageBuffer[this.messageBufferIndex++] = sample;
        if (this.messageBufferIndex >= this.chunkSize) {
          const chunk = this.messageBuffer.slice(0, this.messageBufferIndex);
          const chunkStartTimeSec =
            currentTime - this.messageBufferIndex / this.sampleRateHz;
          this.port.postMessage({
            type: "pcmChunk",
            chunk,
            chunkStartTimeSec,
            sampleRate: this.sampleRateHz,
          });
          this.messageBufferIndex = 0;
        }
      }
    }

    this.framesSinceLevel += 1;
    if (this.framesSinceLevel >= 12) {
      this.framesSinceLevel = 0;
      const level = Math.sqrt(rms / channel.length);
      this.port.postMessage({ type: "level", rms: level });
    }

    return true;
  }
}

registerProcessor("mic-worklet-processor", MicWorkletProcessor);
