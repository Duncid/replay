import type { MidiLikeEvent, MicTranscriptionConfig } from "@/transcription/types";
import type { TranscribedNote } from "@/transcription/magenta/OAFEngine";

type SeenNote = {
  midi: number;
  onsetBucket: number;
  onsetAbsSec: number;
  endAbsSec: number;
  stableOffCount: number;
  offEmitted: boolean;
  confidence: number;
};

function makeKey(midi: number, onsetBucket: number) {
  return `${midi}:${onsetBucket}`;
}

function quantizeBucket(timeSec: number, bucketSec: number) {
  return Math.round(timeSec / bucketSec);
}

export function notesToMidiLikeEvents(params: {
  notes: TranscribedNote[];
  windowStartTimeAbsSec: number;
  nowAbsSec: number;
  config: MicTranscriptionConfig;
  seenNotes: Map<string, SeenNote>;
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
    if (!acceptExpectedOnly || !expectedWindow) return true;
    if (tAbs < expectedWindow.t0 || tAbs > expectedWindow.t1) return true;
    return expectedWindow.mids.some((exp) => Math.abs(exp - midi) <= tolerance);
  };

  notes.forEach((note) => {
    const durMs = (note.endTime - note.startTime) * 1000;
    const confidence = note.confidence ?? 0.7;
    if (durMs < config.minNoteMs || confidence < config.minConfidence) return;

    const onsetAbs = windowStartTimeAbsSec + note.startTime;
    const offAbs = windowStartTimeAbsSec + note.endTime;
    const midi = Math.round(note.pitch);

    if (!shouldAcceptPitch(midi, onsetAbs)) return;

    const bucket = quantizeBucket(onsetAbs, config.onsetBucketSec);
    const key = makeKey(midi, bucket);
    const seen = seenNotes.get(key);

    if (!seen) {
      const entry: SeenNote = {
        midi,
        onsetBucket: bucket,
        onsetAbsSec: onsetAbs,
        endAbsSec: offAbs,
        stableOffCount: 0,
        offEmitted: false,
        confidence,
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
      return;
    }

    if (offAbs > seen.endAbsSec) {
      seen.endAbsSec = offAbs;
    }
    seen.confidence = Math.max(seen.confidence, confidence);
    seen.stableOffCount += 1;
  });

  for (const [key, seen] of seenNotes) {
    if (seen.offEmitted) continue;
    const offIsPast = nowAbsSec >= seen.endAbsSec;
    if (!offIsPast) continue;
    // Conservative noteOff: require note end confirmation in at least 2 hops.
    if (seen.stableOffCount < 2) continue;
    seen.offEmitted = true;
    events.push({
      type: "noteOff",
      midi: seen.midi,
      t: seen.endAbsSec,
      confidence: seen.confidence,
      source: "mic",
    });
    // GC old entries after off emission.
    if (nowAbsSec - seen.endAbsSec > 1.5) {
      seenNotes.delete(key);
    }
  }

  // GC stale entries that never got enough off confirmation.
  for (const [key, seen] of seenNotes) {
    if (nowAbsSec - seen.onsetAbsSec > 8) {
      seenNotes.delete(key);
    }
  }

  events.sort((a, b) => a.t - b.t);
  return { events, droppedHops: params.droppedHops };
}
