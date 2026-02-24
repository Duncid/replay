import { MicCapture } from "@/audio/mic/MicCapture";
import {
  DEFAULT_MIC_TRANSCRIPTION_CONFIG,
  type MainToWorkerMessage,
  type MicTranscriptionConfig,
  type MidiLikeEvent,
  type TranscriptionMetrics,
  type WorkerStatus,
  type WorkerToMainMessage,
} from "@/transcription/types";
import { midiToFrequency, midiToNoteName } from "@/utils/noteSequenceUtils";
import { useEffect, useMemo, useRef, useState } from "react";

type MicInputAdapterOptions = {
  enabled: boolean;
  config?: Partial<MicTranscriptionConfig>;
  visualFallbackEnabled?: boolean;
  isGuided?: boolean;
  expectedNotesProvider?: (() => { mids: number[]; t0: number; t1: number } | null) | null;
  onNoteOn?: (noteKey: string, frequency: number, velocity: number) => void;
  onNoteOff?: (noteKey: string, frequency: number) => void;
};

type MicInputAdapterState = {
  isListening: boolean;
  status: WorkerStatus;
  error: string | null;
  level: number;
  mode: "sab" | "message" | null;
  metrics: TranscriptionMetrics | null;
};

function toVelocity(v: number | undefined) {
  if (!Number.isFinite(v)) return 0.8;
  return Math.max(0.1, Math.min(1, v as number));
}

function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

function detectPitch(
  buffer: Float32Array,
  sampleRate: number,
): { frequency: number | null; confidence: number; rms: number } {
  let size = buffer.length;
  let rms = 0;
  for (let i = 0; i < size; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / size);
  if (rms < 0.008) return { frequency: null, confidence: 0, rms };

  let r1 = 0;
  let r2 = size - 1;
  const threshold = 0.2;
  while (r1 < size && Math.abs(buffer[r1]) < threshold) r1++;
  while (r2 > r1 && Math.abs(buffer[r2]) < threshold) r2--;
  const trimmed = buffer.slice(r1, r2);
  size = trimmed.length;
  if (size < 2) return { frequency: null, confidence: 0, rms };

  const correlations = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    let correlation = 0;
    for (let j = 0; j < size - i; j++) {
      correlation += trimmed[j] * trimmed[j + i];
    }
    correlations[i] = correlation;
  }

  let d = 0;
  while (d < size - 1 && correlations[d] > correlations[d + 1]) d++;

  let maxValue = -1;
  let maxIndex = -1;
  for (let i = d; i < size; i++) {
    if (correlations[i] > maxValue) {
      maxValue = correlations[i];
      maxIndex = i;
    }
  }
  if (maxIndex <= 0 || correlations[0] === 0) {
    return { frequency: null, confidence: 0, rms };
  }

  const prev = correlations[maxIndex - 1] ?? correlations[maxIndex];
  const next = correlations[maxIndex + 1] ?? correlations[maxIndex];
  const denominator = 2 * (2 * correlations[maxIndex] - prev - next);
  const offset = denominator === 0 ? 0 : (next - prev) / denominator;
  const period = maxIndex + offset || maxIndex;
  const frequency = sampleRate / period;
  const confidence = maxValue / correlations[0];
  return { frequency, confidence, rms };
}

export function useMicTranscriptionInputAdapter(
  options: MicInputAdapterOptions,
): MicInputAdapterState {
  const {
    enabled,
    isGuided,
    expectedNotesProvider,
    onNoteOn,
    onNoteOff,
    visualFallbackEnabled = true,
  } = options;
  const cfgWindowSec = options.config?.windowSec;
  const cfgHopSec = options.config?.hopSec;
  const cfgLookbackSec = options.config?.lookbackSec;
  const cfgMinNoteMs = options.config?.minNoteMs;
  const cfgMinConfidence = options.config?.minConfidence;
  const cfgOnsetBucketSec = options.config?.onsetBucketSec;
  const cfgAcceptExpectedOnly = options.config?.acceptExpectedOnly;
  const cfgPitchToleranceSemitones = options.config?.pitchToleranceSemitones;
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState<WorkerStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [mode, setMode] = useState<"sab" | "message" | null>(null);
  const [metrics, setMetrics] = useState<TranscriptionMetrics | null>(null);

  const captureRef = useRef<MicCapture | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const teardownPromiseRef = useRef<Promise<void> | null>(null);
  const isStoppingRef = useRef(false);
  const expectedTimerRef = useRef<number | null>(null);
  const activeKeysRef = useRef<Set<string>>(new Set());
  const activeByMidiRef = useRef<Map<number, string>>(new Map());
  const lastWorkerEventAtRef = useRef(0);
  const fallbackActiveMidiRef = useRef<number | null>(null);
  const fallbackLastVoicedAtRef = useRef(0);
  const onNoteOnRef = useRef<typeof onNoteOn>(onNoteOn);
  const onNoteOffRef = useRef<typeof onNoteOff>(onNoteOff);
  const expectedNotesProviderRef =
    useRef<MicInputAdapterOptions["expectedNotesProvider"]>(expectedNotesProvider);

  useEffect(() => {
    onNoteOnRef.current = onNoteOn;
    onNoteOffRef.current = onNoteOff;
    expectedNotesProviderRef.current = expectedNotesProvider;
  }, [onNoteOn, onNoteOff, expectedNotesProvider]);

  const config = useMemo(() => {
    return {
      ...DEFAULT_MIC_TRANSCRIPTION_CONFIG,
      ...(cfgWindowSec !== undefined ? { windowSec: cfgWindowSec } : {}),
      ...(cfgHopSec !== undefined ? { hopSec: cfgHopSec } : {}),
      ...(cfgLookbackSec !== undefined ? { lookbackSec: cfgLookbackSec } : {}),
      ...(cfgMinNoteMs !== undefined ? { minNoteMs: cfgMinNoteMs } : {}),
      ...(cfgMinConfidence !== undefined
        ? { minConfidence: cfgMinConfidence }
        : {}),
      ...(cfgOnsetBucketSec !== undefined
        ? { onsetBucketSec: cfgOnsetBucketSec }
        : {}),
      ...(cfgAcceptExpectedOnly !== undefined
        ? { acceptExpectedOnly: cfgAcceptExpectedOnly }
        : {}),
      ...(cfgPitchToleranceSemitones !== undefined
        ? { pitchToleranceSemitones: cfgPitchToleranceSemitones }
        : {}),
    };
  }, [
    cfgWindowSec,
    cfgHopSec,
    cfgLookbackSec,
    cfgMinNoteMs,
    cfgMinConfidence,
    cfgOnsetBucketSec,
    cfgAcceptExpectedOnly,
    cfgPitchToleranceSemitones,
  ]);

  function getFriendlyMicError(error: unknown): string {
    if (error instanceof DOMException) {
      if (error.name === "NotAllowedError") {
        return "Microphone permission was denied.";
      }
      if (error.name === "NotFoundError") {
        return "No microphone device was found.";
      }
      if (error.name === "NotReadableError") {
        return "Microphone is busy or unavailable.";
      }
      if (error.name === "AbortError") {
        return "Microphone start was interrupted.";
      }
    }
    if (error instanceof Error) {
      return error.message;
    }
    return "Failed to initialize microphone input.";
  }

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;
    const activeKeys = activeKeysRef.current;
    const activeByMidi = activeByMidiRef.current;

    const emitNoteOn = (midi: number, velocity: number) => {
      const noteKey = midiToNoteName(midi);
      const freq = midiToFrequency(midi);
      if (activeKeys.has(noteKey)) return;
      activeKeys.add(noteKey);
      activeByMidi.set(midi, noteKey);
      onNoteOnRef.current?.(noteKey, freq, toVelocity(velocity));
    };

    const emitNoteOff = (midi: number) => {
      const noteKey = midiToNoteName(midi);
      const freq = midiToFrequency(midi);
      const key = activeByMidi.get(midi) ?? noteKey;
      if (!activeKeys.has(key)) return;
      activeKeys.delete(key);
      activeByMidi.delete(midi);
      onNoteOffRef.current?.(key, freq);
    };

    const handleEvents = (events: MidiLikeEvent[]) => {
      if (events.length > 0) {
        lastWorkerEventAtRef.current = performance.now();
      }
      events.forEach((evt) => {
        if (evt.type === "noteOn") {
          emitNoteOn(evt.midi, evt.velocity);
        } else {
          emitNoteOff(evt.midi);
        }
      });
    };

    const maybeProcessFallbackChunk = (chunk: Float32Array, sampleRate: number) => {
      if (!visualFallbackEnabled) return;
      // Let worker output take precedence when available.
      if (performance.now() - lastWorkerEventAtRef.current < 450) return;

      const { frequency, confidence, rms } = detectPitch(chunk, sampleRate);
      const voiced =
        !!frequency &&
        confidence >= 0.78 &&
        rms >= 0.01 &&
        frequency > 65 &&
        frequency < 2000;
      const now = performance.now();

      if (voiced) {
        fallbackLastVoicedAtRef.current = now;
        const midi = Math.round(hzToMidi(frequency!));
        const current = fallbackActiveMidiRef.current;
        if (current === null) {
          fallbackActiveMidiRef.current = midi;
          emitNoteOn(midi, Math.min(1, Math.max(0.2, rms * 8)));
          return;
        }
        if (Math.abs(current - midi) >= 1) {
          emitNoteOff(current);
          fallbackActiveMidiRef.current = midi;
          emitNoteOn(midi, Math.min(1, Math.max(0.2, rms * 8)));
        }
        return;
      }

      const current = fallbackActiveMidiRef.current;
      if (current !== null && now - fallbackLastVoicedAtRef.current > 160) {
        emitNoteOff(current);
        fallbackActiveMidiRef.current = null;
      }
    };

    const start = async () => {
      try {
        if (teardownPromiseRef.current) {
          await teardownPromiseRef.current;
        }
        if (cancelled || isStoppingRef.current) return;

        setError(null);
        const worker = new Worker(
          new URL("../transcription/TranscriptionWorker.ts", import.meta.url),
          { type: "module" },
        );
        workerRef.current = worker;
        worker.onmessage = (event: MessageEvent<WorkerToMainMessage>) => {
          const msg = event.data;
          if (msg.type === "status") {
            setStatus(msg.payload.status);
            if (msg.payload.reason) setError(msg.payload.reason);
          } else if (msg.type === "events") {
            handleEvents(msg.payload);
          } else if (msg.type === "metrics") {
            setMetrics(msg.payload);
          } else if (msg.type === "error") {
            setError(msg.payload.message);
          }
        };
        worker.onerror = (e) => {
          setError(e.message || "Microphone worker error");
          setStatus("error");
        };

        const capture = new MicCapture({
          onLevel: setLevel,
          onError: (message) => {
            if (cancelled) return;
            setStatus("error");
            setError(message);
          },
          onChunk: (payload) => {
            if (cancelled) return;
            const workerMessage: MainToWorkerMessage = { type: "pcmChunk", payload };
            worker.postMessage(workerMessage);
            maybeProcessFallbackChunk(payload.chunk, payload.sampleRate);
          },
        });
        captureRef.current = capture;
        const startResult = await capture.start();
        if (cancelled) return;

        setMode(startResult.mode);
        const initMsg: MainToWorkerMessage = {
          type: "init",
          payload: {
            sampleRate: startResult.sampleRate,
            config: {
              ...config,
              acceptExpectedOnly: isGuided ? config.acceptExpectedOnly : false,
            },
          },
        };
        worker.postMessage(initMsg);

        if (startResult.sharedBuffer) {
          worker.postMessage({
            type: "attachSharedBuffer",
            payload: {
              pcmSAB: startResult.sharedBuffer.pcmSAB,
              stateSAB: startResult.sharedBuffer.stateSAB,
              capacity: startResult.sharedBuffer.capacity,
              sampleRate: startResult.sampleRate,
            },
          } satisfies MainToWorkerMessage);
        }

        worker.postMessage({ type: "start" } satisfies MainToWorkerMessage);
        setIsListening(true);

        if (expectedNotesProviderRef.current) {
          expectedTimerRef.current = window.setInterval(() => {
            const windowNotes = expectedNotesProviderRef.current?.();
            if (!windowNotes) return;
            worker.postMessage({
              type: "expectedNotes",
              payload: windowNotes,
            } satisfies MainToWorkerMessage);
          }, 120);
        }
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setError(getFriendlyMicError(e));
      }
    };

    void start();

    return () => {
      cancelled = true;
      isStoppingRef.current = true;
      teardownPromiseRef.current = (async () => {
        setIsListening(false);
        activeKeys.clear();
        activeByMidi.clear();
        if (expectedTimerRef.current !== null) {
          clearInterval(expectedTimerRef.current);
          expectedTimerRef.current = null;
        }
        if (workerRef.current) {
          workerRef.current.postMessage({
            type: "stop",
          } satisfies MainToWorkerMessage);
          workerRef.current.postMessage({
            type: "dispose",
          } satisfies MainToWorkerMessage);
          workerRef.current.terminate();
          workerRef.current = null;
        }
        if (fallbackActiveMidiRef.current !== null) {
          emitNoteOff(fallbackActiveMidiRef.current);
          fallbackActiveMidiRef.current = null;
        }
        if (captureRef.current) {
          await captureRef.current.stop().catch(() => undefined);
          captureRef.current = null;
        }
      })().finally(() => {
        isStoppingRef.current = false;
        teardownPromiseRef.current = null;
      });
    };
  }, [
    config,
    enabled,
    isGuided,
    visualFallbackEnabled,
  ]);

  return {
    isListening,
    status,
    error,
    level,
    mode,
    metrics,
  };
}
