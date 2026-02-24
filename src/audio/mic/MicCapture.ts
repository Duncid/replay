import {
  createSharedRingBuffer,
  type SharedRingBuffer,
} from "@/audio/mic/shared/RingBuffer";
import type {
  MicWorkletProcessorOptions,
  WorkerPcmChunkPayload,
  WorkletMode,
  WorkletToMainMessage,
} from "@/transcription/types";
import micWorkletUrl from "@/audio/mic/worklet/MicWorkletProcessor.ts?url";

type MicCaptureOptions = {
  chunkSize?: number;
  ringCapacity?: number;
  constraints?: MediaTrackConstraints;
  renderToOutput?: boolean;
  onLevel?: (rms: number) => void;
  onChunk?: (payload: WorkerPcmChunkPayload) => void;
  onError?: (message: string) => void;
};

export type MicCaptureStartResult = {
  sampleRate: number;
  mode: WorkletMode;
  sharedBuffer?: SharedRingBuffer & {
    pcmSAB: SharedArrayBuffer;
    stateSAB: SharedArrayBuffer;
  };
};

export class MicCapture {
  private options: Required<
    Pick<
      MicCaptureOptions,
      "chunkSize" | "ringCapacity" | "constraints" | "renderToOutput"
    >
  > &
    Pick<MicCaptureOptions, "onLevel" | "onChunk" | "onError">;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sinkNode: AudioNode | null = null;
  private sharedBufferResult: MicCaptureStartResult["sharedBuffer"];
  private mode: WorkletMode = "message";
  private startPromise: Promise<MicCaptureStartResult> | null = null;
  private stopPromise: Promise<void> | null = null;
  private isStopping = false;
  private hasReportedContextError = false;

  constructor(options: MicCaptureOptions = {}) {
    this.options = {
      chunkSize: options.chunkSize ?? 1024,
      ringCapacity: options.ringCapacity ?? 48000 * 4,
      constraints: options.constraints ?? {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
      },
      renderToOutput: options.renderToOutput ?? false,
      onLevel: options.onLevel,
      onChunk: options.onChunk,
      onError: options.onError,
    };
  }

  async start(): Promise<MicCaptureStartResult> {
    if (this.startPromise) return this.startPromise;
    if (this.stopPromise) await this.stopPromise;

    if (this.audioContext && this.workletNode) {
      return this.getStartResult();
    }

    this.startPromise = this.startInternal().finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  private async startInternal(): Promise<MicCaptureStartResult> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: this.options.constraints,
      });

      this.audioContext = new AudioContext({ latencyHint: "interactive" });
      this.audioContext.onstatechange = () => {
        if (!this.audioContext || this.isStopping) return;
        const state = this.audioContext.state as AudioContextState | "interrupted";
        if ((state === "interrupted" || state === "closed") && !this.hasReportedContextError) {
          this.hasReportedContextError = true;
          this.options.onError?.(
            state === "interrupted"
              ? "Microphone audio was interrupted by the device."
              : "Microphone audio context closed unexpectedly.",
          );
          // Stop capture on fatal/interruptive states to avoid repeated renderer errors.
          void this.stop();
        }
      };

      await this.audioContext.audioWorklet.addModule(micWorkletUrl);

      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
      const canUseSAB = typeof SharedArrayBuffer !== "undefined";
      this.mode = canUseSAB ? "sab" : "message";

      let processorOptions: MicWorkletProcessorOptions = {
        mode: this.mode,
        chunkSize: this.options.chunkSize,
        sampleRate: this.audioContext.sampleRate,
      };

      if (this.mode === "sab") {
        const ring = createSharedRingBuffer(this.options.ringCapacity);
        this.sharedBufferResult = {
          ...ring,
          ...{
            pcm: new Float32Array(ring.pcmSAB),
            state: new Int32Array(ring.stateSAB),
          },
        };
        processorOptions = {
          ...processorOptions,
          pcmSAB: ring.pcmSAB,
          stateSAB: ring.stateSAB,
          capacity: ring.capacity,
        };
      } else {
        this.sharedBufferResult = undefined;
      }

      this.workletNode = new AudioWorkletNode(
        this.audioContext,
        "mic-worklet-processor",
        { processorOptions, numberOfOutputs: 0 },
      );
      this.workletNode.port.onmessage = (
        event: MessageEvent<WorkletToMainMessage>,
      ) => {
        const msg = event.data;
        if (msg.type === "level") {
          this.options.onLevel?.(msg.rms);
        } else if (msg.type === "pcmChunk") {
          this.options.onChunk?.({
            chunk: msg.chunk,
            chunkStartTimeSec: msg.chunkStartTimeSec,
            sampleRate: msg.sampleRate,
          });
        }
      };

      this.sourceNode.connect(this.workletNode);

      return this.getStartResult();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to initialize microphone";
      this.options.onError?.(message);
      await this.stop();
      throw error;
    }
  }

  private getStartResult(): MicCaptureStartResult {
    return {
      sampleRate: this.audioContext?.sampleRate ?? 48000,
      mode: this.mode,
      sharedBuffer: this.sharedBufferResult,
    };
  }

  async stop() {
    if (this.stopPromise) return this.stopPromise;
    this.stopPromise = this.stopInternal().finally(() => {
      this.stopPromise = null;
    });
    return this.stopPromise;
  }

  private async stopInternal() {
    this.isStopping = true;
    try {
      if (this.workletNode) {
        try {
          this.workletNode.port.onmessage = null;
          this.workletNode.disconnect();
        } catch {
          // ignore disconnect cleanup errors
        }
        this.workletNode = null;
      }
      if (this.sinkNode) {
        try {
          this.sinkNode.disconnect();
        } catch {
          // ignore sink disconnect errors
        }
        this.sinkNode = null;
      }
      if (this.sourceNode) {
        try {
          this.sourceNode.disconnect();
        } catch {
          // ignore source disconnect errors
        }
        this.sourceNode = null;
      }
      if (this.stream) {
        this.stream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch {
            // ignore track stop errors
          }
        });
        this.stream = null;
      }
      if (this.audioContext) {
        this.audioContext.onstatechange = null;
        if (this.audioContext.state !== "closed") {
          try {
            await this.audioContext.close();
          } catch {
            // ignore close race/device errors
          }
        }
        this.audioContext = null;
      }
    } finally {
      this.sharedBufferResult = undefined;
      this.hasReportedContextError = false;
      this.isStopping = false;
    }
  }
}
