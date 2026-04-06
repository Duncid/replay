export type TranscribedNote = {
  pitch: number;
  startTime: number;
  endTime: number;
  velocity?: number;
  confidence?: number;
};

export type TranscribedSequence = {
  notes: TranscribedNote[];
};

export interface OAFEngine {
  init(): Promise<void>;
  transcribe(audio: Float32Array, sampleRate: number): Promise<TranscribedSequence>;
  getBackend(): "webgl" | "wasm" | "cpu" | "heuristic";
  dispose(): Promise<void>;
}

const MIN_RMS = 0.0065;
const MIN_CONFIDENCE = 0.4;

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
  if (rms < MIN_RMS) return { frequency: null, confidence: 0, rms };

  let r1 = 0;
  let r2 = size - 1;
  const threshold = 0.15;
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

/**
 * Heuristic fallback transcription engine.
 * It preserves the OAFEngine interface so we can swap in Onsets & Frames later
 * without changing worker integration.
 */
export class HeuristicOAFEngine implements OAFEngine {
  async init(): Promise<void> {}

  async transcribe(
    audio: Float32Array,
    sampleRate: number,
  ): Promise<TranscribedSequence> {
    const winSize = Math.max(256, Math.floor(sampleRate * 0.05));
    const hop = Math.max(128, Math.floor(winSize / 3));
    const notes: TranscribedNote[] = [];
    const minNoteOnUnvoiced = 0.04;
    const minNoteOnPitchChange = 0.022;
    const minNoteTail = 0.04;

    let current:
      | { pitch: number; startTime: number; lastTime: number; confidence: number }
      | null = null;

    for (let i = 0; i + winSize < audio.length; i += hop) {
      const frame = audio.subarray(i, i + winSize);
      const res = detectPitch(frame, sampleRate);
      const t = i / sampleRate;
      const voiced =
        !!res.frequency &&
        res.confidence >= MIN_CONFIDENCE &&
        res.frequency > 50 &&
        res.frequency < 5000;
      if (!voiced) {
        if (current && t - current.startTime >= minNoteOnUnvoiced) {
          notes.push({
            pitch: Math.round(current.pitch),
            startTime: current.startTime,
            endTime: t,
            velocity: 0.8,
            confidence: current.confidence,
          });
        }
        current = null;
        continue;
      }

      const midi = hzToMidi(res.frequency!);
      if (!current) {
        current = {
          pitch: midi,
          startTime: t,
          lastTime: t,
          confidence: res.confidence,
        };
        continue;
      }
      const roundedNext = Math.round(midi);
      const roundedCur = Math.round(current.pitch);
      if (roundedNext !== roundedCur) {
        if (t - current.startTime >= minNoteOnPitchChange) {
          notes.push({
            pitch: roundedCur,
            startTime: current.startTime,
            endTime: t,
            velocity: 0.8,
            confidence: current.confidence,
          });
        }
        current = {
          pitch: midi,
          startTime: t,
          lastTime: t,
          confidence: res.confidence,
        };
      } else {
        current.lastTime = t;
        current.confidence = (current.confidence + res.confidence) / 2;
      }
    }

    if (current) {
      const endTime = Math.min(audio.length / sampleRate, current.lastTime + 0.05);
      if (endTime - current.startTime >= minNoteTail) {
        notes.push({
          pitch: Math.round(current.pitch),
          startTime: current.startTime,
          endTime,
          velocity: 0.8,
          confidence: current.confidence,
        });
      }
    }

    return { notes };
  }

  getBackend() {
    return "heuristic" as const;
  }

  async dispose(): Promise<void> {}
}
