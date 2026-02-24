/// <reference lib="webworker" />

import {
  attachSharedRingBuffer,
  RingBufferReader,
} from "@/audio/mic/shared/RingBuffer";
import { HeuristicOAFEngine, type OAFEngine } from "@/transcription/magenta/OAFEngine";
import { notesToMidiLikeEvents } from "@/transcription/magenta/NoteSequenceUtils";
import {
  DEFAULT_MIC_TRANSCRIPTION_CONFIG,
  type MainToWorkerMessage,
  type MicTranscriptionConfig,
  type WorkerExpectedNotesPayload,
  type WorkerStatus,
  type WorkerToMainMessage,
} from "@/transcription/types";

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

let status: WorkerStatus = "idle";
let sampleRate = 48000;
let config: MicTranscriptionConfig = { ...DEFAULT_MIC_TRANSCRIPTION_CONFIG };
let hopTimer: number | null = null;
let running = false;
let backend: "webgl" | "wasm" | "cpu" | "heuristic" = "heuristic";

let ringReader: RingBufferReader | null = null;
let recentPcm = new Float32Array(0);
let recentStartAbs = 0;
let knownAbsTime = 0;
let expectedWindow: WorkerExpectedNotesPayload | null = null;
const droppedHops = 0;

const seenNotes = new Map<
  string,
  {
    midi: number;
    onsetBucket: number;
    onsetAbsSec: number;
    endAbsSec: number;
    stableOffCount: number;
    offEmitted: boolean;
    confidence: number;
  }
>();

const engine: OAFEngine = new HeuristicOAFEngine();

function post(message: WorkerToMainMessage) {
  ctx.postMessage(message);
}

function setStatus(next: WorkerStatus, reason?: string) {
  status = next;
  post({ type: "status", payload: { status, reason } });
}

function appendPcm(chunk: Float32Array, chunkStartTimeSec: number) {
  if (recentPcm.length === 0) {
    recentPcm = chunk.slice();
    recentStartAbs = chunkStartTimeSec;
    knownAbsTime = chunkStartTimeSec + chunk.length / sampleRate;
    return;
  }

  const merged = new Float32Array(recentPcm.length + chunk.length);
  merged.set(recentPcm, 0);
  merged.set(chunk, recentPcm.length);
  recentPcm = merged;
  knownAbsTime = chunkStartTimeSec + chunk.length / sampleRate;

  const maxSamples = Math.ceil((config.windowSec + 1.0) * sampleRate);
  if (recentPcm.length > maxSamples) {
    const drop = recentPcm.length - maxSamples;
    recentPcm = recentPcm.slice(drop);
    recentStartAbs += drop / sampleRate;
  }
}

function maybeReadSharedBuffer() {
  if (!ringReader) return;
  const chunk = ringReader.readAvailable();
  if (chunk.length === 0) return;
  const chunkStart = knownAbsTime;
  appendPcm(chunk, chunkStart);
  knownAbsTime = chunkStart + chunk.length / sampleRate;
}

async function runHop() {
  if (!running || status !== "running") return;
  const startedAt = performance.now();
  try {
    maybeReadSharedBuffer();
    const windowSamples = Math.floor(config.windowSec * sampleRate);
    if (recentPcm.length < windowSamples) return;

    const windowAudio = recentPcm.slice(recentPcm.length - windowSamples);
    const windowStartAbs =
      knownAbsTime > 0
        ? knownAbsTime - windowAudio.length / sampleRate
        : recentStartAbs + (recentPcm.length - windowAudio.length) / sampleRate;

    const inferStarted = performance.now();
    const seq = await engine.transcribe(windowAudio, sampleRate);
    const inferenceMs = performance.now() - inferStarted;

    const nowAbsSec = knownAbsTime || windowStartAbs + windowAudio.length / sampleRate;
    const { events } = notesToMidiLikeEvents({
      notes: seq.notes,
      windowStartTimeAbsSec: windowStartAbs,
      nowAbsSec,
      config,
      seenNotes,
      droppedHops,
      expectedWindow,
    });

    if (events.length > 0) {
      post({ type: "events", payload: events });
    }

    post({
      type: "metrics",
      payload: {
        backend,
        inferenceMs,
        hopCycleMs: performance.now() - startedAt,
        droppedHops,
        queueDepthMs: (recentPcm.length / sampleRate) * 1000,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transcription failure";
    setStatus("error", message);
    post({ type: "error", payload: { message } });
  }
}

function startLoop() {
  if (hopTimer !== null) return;
  hopTimer = setInterval(
    () => void runHop(),
    Math.max(30, Math.round(config.hopSec * 1000)),
  ) as unknown as number;
}

function stopLoop() {
  if (hopTimer !== null) {
    clearInterval(hopTimer);
    hopTimer = null;
  }
}

ctx.onmessage = async (event: MessageEvent<MainToWorkerMessage>) => {
  const msg = event.data;
  switch (msg.type) {
    case "init": {
      sampleRate = msg.payload.sampleRate;
      config = { ...config, ...msg.payload.config };
      setStatus("initializing");
      try {
        await engine.init();
        backend = engine.getBackend();
        setStatus("idle");
        post({ type: "ready" });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to initialize transcription engine";
        setStatus("error", message);
        post({ type: "error", payload: { message } });
      }
      return;
    }
    case "attachSharedBuffer": {
      sampleRate = msg.payload.sampleRate;
      const ring = attachSharedRingBuffer(
        msg.payload.pcmSAB,
        msg.payload.stateSAB,
        msg.payload.capacity,
      );
      ringReader = new RingBufferReader(ring);
      return;
    }
    case "pcmChunk": {
      sampleRate = msg.payload.sampleRate;
      appendPcm(msg.payload.chunk, msg.payload.chunkStartTimeSec);
      return;
    }
    case "config": {
      config = { ...config, ...msg.payload };
      if (running) {
        stopLoop();
        startLoop();
      }
      return;
    }
    case "expectedNotes": {
      expectedWindow = msg.payload;
      return;
    }
    case "start": {
      running = true;
      setStatus("running");
      startLoop();
      return;
    }
    case "stop": {
      running = false;
      stopLoop();
      setStatus("stopped");
      return;
    }
    case "dispose": {
      running = false;
      stopLoop();
      await engine.dispose();
      ringReader = null;
      recentPcm = new Float32Array(0);
      seenNotes.clear();
      expectedWindow = null;
      setStatus("idle");
      return;
    }
    default:
      return;
  }
};
