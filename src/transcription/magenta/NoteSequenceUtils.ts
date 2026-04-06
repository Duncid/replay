import type { MidiLikeEvent, MicTranscriptionConfig } from "@/transcription/types";
import type { TranscribedNote } from "@/transcription/magenta/OAFEngine";

/** One active mic note per MIDI pitch (worker-owned map, mutated each hop). */
export type MicSeenNoteState = {
  midi: number;
  onsetAbsSec: number;
  endAbsSec: number;
  offEmitted: boolean;
  confidence: number;
  /** Consecutive hops with no qualifying detection for this pitch (silence / gap). */
  hopsWithoutRenewal: number;
};

function makeKey(midi: number) {
  return String(midi);
}

const END_EPS_SEC = 1e-3;

/** Pull detector output toward the closest expected pitch when within snapRadius (learn / tune). */
function snapMidiToNearestExpected(
  floatMidi: number,
  mids: number[],
  snapRadiusSemitones: number,
): number {
  let best: number | null = null;
  let bestD = Infinity;
  for (const m of mids) {
    const d = Math.abs(m - floatMidi);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  const rounded = Math.round(floatMidi);
  if (best === null || bestD > snapRadiusSemitones) return rounded;
  return best;
}

export function notesToMidiLikeEvents(params: {
  notes: TranscribedNote[];
  windowStartTimeAbsSec: number;
  nowAbsSec: number;
  config: MicTranscriptionConfig;
  seenNotes: Map<string, MicSeenNoteState>;
  droppedHops: number;
  expectedWindow?: { mids: number[]; t0: number; t1: number } | null;
}): { events: MidiLikeEvent[]; droppedHops: number } {
  const {
    notes,
    windowStartTimeAbsSec,
    nowAbsSec,
    config,
    seenNotes,
    expectedWindow,
  } = params;
  const events: MidiLikeEvent[] = [];

  const tolerance = config.pitchToleranceSemitones ?? 0;
  const acceptExpectedOnly = !!config.acceptExpectedOnly;

  const shouldAcceptPitch = (midi: number, tAbs: number) => {
    if (!acceptExpectedOnly || !expectedWindow?.mids?.length) return true;
    if (tAbs < expectedWindow.t0 || tAbs > expectedWindow.t1) return true;
    return expectedWindow.mids.some((exp) => Math.abs(exp - midi) <= tolerance);
  };

  const renewedMidis = new Set<number>();

  notes.forEach((note) => {
    const durMs = (note.endTime - note.startTime) * 1000;
    const confidence = note.confidence ?? 0.7;
    if (durMs < config.minNoteMs || confidence < config.minConfidence) return;

    const onsetAbs = windowStartTimeAbsSec + note.startTime;
    const offAbs = windowStartTimeAbsSec + note.endTime;
    let midi: number;
    if (
      acceptExpectedOnly &&
      expectedWindow?.mids?.length
    ) {
      const snapRadius = Math.max(tolerance, 0.5);
      midi = snapMidiToNearestExpected(
        note.pitch,
        expectedWindow.mids,
        snapRadius,
      );
    } else {
      midi = Math.round(note.pitch);
    }

    if (!shouldAcceptPitch(midi, onsetAbs)) return;

    const key = makeKey(midi);
    let seen = seenNotes.get(key);
    if (seen?.offEmitted) {
      seenNotes.delete(key);
      seen = undefined;
    }

    if (!seen) {
      const entry: MicSeenNoteState = {
        midi,
        onsetAbsSec: onsetAbs,
        endAbsSec: offAbs,
        offEmitted: false,
        confidence,
        hopsWithoutRenewal: 0,
      };
      seenNotes.set(key, entry);
      events.push({
        type: "noteOn",
        midi,
        velocity: note.velocity ?? 0.8,
        t: onsetAbs,
        confidence,
        source: "mic",
      });
      renewedMidis.add(midi);
      return;
    }

    seen.endAbsSec = Math.max(seen.endAbsSec, offAbs);
    seen.onsetAbsSec = Math.min(seen.onsetAbsSec, onsetAbs);
    seen.confidence = Math.max(seen.confidence, confidence);
    seen.hopsWithoutRenewal = 0;
    renewedMidis.add(midi);
  });

  for (const [, seen] of seenNotes) {
    if (seen.offEmitted) continue;
    if (!renewedMidis.has(seen.midi)) {
      seen.hopsWithoutRenewal += 1;
    }
  }

  for (const [key, seen] of seenNotes) {
    if (seen.offEmitted) continue;
    const pastEnd = nowAbsSec + END_EPS_SEC >= seen.endAbsSec;
    if (
      pastEnd &&
      seen.hopsWithoutRenewal >= 2
    ) {
      seen.offEmitted = true;
      events.push({
        type: "noteOff",
        midi: seen.midi,
        t: seen.endAbsSec,
        confidence: seen.confidence,
        source: "mic",
      });
      seenNotes.delete(key);
    }
  }

  for (const [key, seen] of seenNotes) {
    if (seen.offEmitted) {
      seenNotes.delete(key);
      continue;
    }
    if (nowAbsSec - seen.onsetAbsSec > 8) {
      events.push({
        type: "noteOff",
        midi: seen.midi,
        t: nowAbsSec,
        confidence: seen.confidence,
        source: "mic",
      });
      seenNotes.delete(key);
    }
  }

  events.sort((a, b) => a.t - b.t);
  return { events, droppedHops: params.droppedHops };
}
