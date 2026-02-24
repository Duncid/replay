export type MidiLikeSource = "mic";

export type MidiLikeEvent =
  | {
      type: "noteOn";
      midi: number;
      velocity: number;
      t: number;
      confidence: number;
      source: MidiLikeSource;
    }
  | {
      type: "noteOff";
      midi: number;
      t: number;
      confidence: number;
      source: MidiLikeSource;
    };

export type MicTranscriptionConfig = {
  windowSec: number;
  hopSec: number;
  lookbackSec: number;
  minNoteMs: number;
  minConfidence: number;
  onsetBucketSec: number;
  acceptExpectedOnly?: boolean;
  pitchToleranceSemitones?: number;
};

export const DEFAULT_MIC_TRANSCRIPTION_CONFIG: MicTranscriptionConfig = {
  windowSec: 2.5,
  hopSec: 0.25,
  lookbackSec: 0.5,
  minNoteMs: 60,
  minConfidence: 0.55,
  onsetBucketSec: 0.03,
  acceptExpectedOnly: false,
  pitchToleranceSemitones: 0,
};

export type TranscriptionMetrics = {
  backend: "webgl" | "wasm" | "cpu" | "heuristic";
  inferenceMs: number;
  hopCycleMs: number;
  droppedHops: number;
  queueDepthMs: number;
};

export type WorkerStatus = "idle" | "initializing" | "running" | "stopped" | "error";

export type WorkerInitPayload = {
  sampleRate: number;
  config: MicTranscriptionConfig;
};

export type WorkerPcmChunkPayload = {
  chunk: Float32Array;
  chunkStartTimeSec: number;
  sampleRate: number;
};

export type WorkerSharedBufferPayload = {
  pcmSAB: SharedArrayBuffer;
  stateSAB: SharedArrayBuffer;
  capacity: number;
  sampleRate: number;
};

export type WorkerExpectedNotesPayload = {
  mids: number[];
  t0: number;
  t1: number;
};

export type MainToWorkerMessage =
  | { type: "init"; payload: WorkerInitPayload }
  | { type: "start" }
  | { type: "stop" }
  | { type: "pcmChunk"; payload: WorkerPcmChunkPayload }
  | { type: "attachSharedBuffer"; payload: WorkerSharedBufferPayload }
  | { type: "config"; payload: Partial<MicTranscriptionConfig> }
  | { type: "expectedNotes"; payload: WorkerExpectedNotesPayload }
  | { type: "dispose" };

export type WorkerToMainMessage =
  | { type: "ready" }
  | { type: "status"; payload: { status: WorkerStatus; reason?: string } }
  | { type: "events"; payload: MidiLikeEvent[] }
  | { type: "metrics"; payload: TranscriptionMetrics }
  | { type: "error"; payload: { message: string } };

export type WorkletMode = "sab" | "message";

export type MicWorkletProcessorOptions = {
  mode: WorkletMode;
  chunkSize: number;
  sampleRate: number;
  pcmSAB?: SharedArrayBuffer;
  stateSAB?: SharedArrayBuffer;
  capacity?: number;
};

export type WorkletToMainMessage =
  | {
      type: "pcmChunk";
      chunk: Float32Array;
      chunkStartTimeSec: number;
      sampleRate: number;
    }
  | { type: "level"; rms: number };
