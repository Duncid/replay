import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NoteEvent } from "@/components/PianoSheetPixiLayout";

export type PlaybackMode = "autoplay" | "player";
export type PlaybackPhase = "running" | "waiting";

export type InputNoteEvent = {
  type: "noteon" | "noteoff";
  midi: number;
  timeMs: number;
  velocity?: number;
};

export type Gate = {
  index: number;
  t: number;
  noteIds: string[];
  requiredPitches: number[];
  requiresFreshPress: Set<number>;
};

type GateProgress = {
  gateIndex: number;
  satisfied: Set<number>;
  firstHitMs: number | null;
  waitingStartMs: number;
};

type UseSheetPlaybackEngineOptions = {
  notes: NoteEvent[];
  mode: PlaybackMode;
  enabled: boolean;
  inputEvents: InputNoteEvent[];
  speed?: number;
  chordWindowMs?: number;
};

const DEFAULT_SPEED = 1;
const DEFAULT_CHORD_WINDOW_MS = 120;
const EPSILON = 1e-6;

function quantizeTimeSec(value: number) {
  return Math.round(value * 1000) / 1000;
}

function buildGates(notes: NoteEvent[]): Gate[] {
  if (notes.length === 0) return [];
  const groups = new Map<number, NoteEvent[]>();
  notes.forEach((note) => {
    const t = quantizeTimeSec(note.start);
    const list = groups.get(t);
    if (list) {
      list.push(note);
    } else {
      groups.set(t, [note]);
    }
  });
  const times = Array.from(groups.keys()).sort((a, b) => a - b);
  const gates: Gate[] = [];
  let previousRequired = new Set<number>();

  times.forEach((t, index) => {
    const group = groups.get(t) ?? [];
    const requiredPitches = Array.from(
      new Set(group.map((note) => note.midi))
    ).sort((a, b) => a - b);
    const requiresFreshPress = new Set<number>();
    requiredPitches.forEach((pitch) => {
      if (previousRequired.has(pitch)) {
        requiresFreshPress.add(pitch);
      }
    });
    gates.push({
      index,
      t,
      noteIds: group.map((note) => note.id),
      requiredPitches,
      requiresFreshPress,
    });
    previousRequired = new Set(requiredPitches);
  });

  return gates;
}

export function useSheetPlaybackEngine({
  notes,
  mode,
  enabled,
  inputEvents,
  speed = DEFAULT_SPEED,
  chordWindowMs = DEFAULT_CHORD_WINDOW_MS,
}: UseSheetPlaybackEngineOptions) {
  const gates = useMemo(() => buildGates(notes), [notes]);
  const endTime = useMemo(() => {
    if (notes.length === 0) return 0;
    return notes.reduce((maxEnd, note) => {
      const end = note.start + note.dur;
      return end > maxEnd ? end : maxEnd;
    }, 0);
  }, [notes]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [phase, setPhase] = useState<PlaybackPhase>("running");
  const [gateIndex, setGateIndex] = useState(0);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [focusedNoteIds, setFocusedNoteIds] = useState<Set<string>>(
    () => new Set()
  );
  const [activeNoteIds, setActiveNoteIds] = useState<Set<string>>(
    () => new Set()
  );

  const tRef = useRef(0);
  const phaseRef = useRef<PlaybackPhase>("running");
  const gateIndexRef = useRef(0);
  const modeRef = useRef<PlaybackMode>(mode);
  const isPlayingRef = useRef(false);
  const lastFrameMsRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const heldPitchesRef = useRef(new Set<number>());
  const lastNoteOnMsRef = useRef(new Map<number, number>());
  const gateProgressRef = useRef<GateProgress | null>(null);
  const lastProcessedInputIndexRef = useRef(0);

  const recomputeActiveNotes = useCallback(
    (timeSec: number) => {
      if (notes.length === 0) {
        setActiveNoteIds(new Set());
        return;
      }
      const active = new Set<string>();
      notes.forEach((note) => {
        if (note.start - EPSILON <= timeSec && timeSec < note.start + note.dur) {
          active.add(note.id);
        }
      });
      setActiveNoteIds(active);
    },
    [notes]
  );

  const updateFocus = useCallback(() => {
    if (modeRef.current !== "player") {
      setFocusedNoteIds(new Set());
      return;
    }
    if (phaseRef.current === "waiting") {
      const gate = gates[gateIndexRef.current];
      if (gate) {
        setFocusedNoteIds(new Set(gate.noteIds));
        return;
      }
    }
    setFocusedNoteIds(new Set());
  }, [gates]);

  const syncRefs = useCallback(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    syncRefs();
  }, [syncRefs]);

  useEffect(() => {
    if (!enabled) {
      setIsPlaying(false);
      isPlayingRef.current = false;
    }
  }, [enabled]);

  const enterWaiting = useCallback(
    (nowMs: number) => {
      phaseRef.current = "waiting";
      setPhase("waiting");
      const gate = gates[gateIndexRef.current];
      if (!gate) {
        gateProgressRef.current = null;
        setFocusedNoteIds(new Set());
        return;
      }
      const satisfied = new Set<number>();
      heldPitchesRef.current.forEach((pitch) => {
        if (
          gate.requiredPitches.includes(pitch) &&
          !gate.requiresFreshPress.has(pitch)
        ) {
          satisfied.add(pitch);
        }
      });
      gateProgressRef.current = {
        gateIndex: gate.index,
        satisfied,
        firstHitMs: null,
        waitingStartMs: nowMs,
      };
      updateFocus();
      if (satisfied.size >= gate.requiredPitches.length) {
        phaseRef.current = "running";
        setPhase("running");
        gateIndexRef.current = gateIndexRef.current + 1;
        setGateIndex(gateIndexRef.current);
        gateProgressRef.current = null;
        updateFocus();
      }
    },
    [gates, updateFocus]
  );

  const advanceGateIfSatisfied = useCallback(() => {
    const gate = gates[gateIndexRef.current];
    const progress = gateProgressRef.current;
    if (!gate || !progress) return;
    if (progress.satisfied.size >= gate.requiredPitches.length) {
      phaseRef.current = "running";
      setPhase("running");
      gateIndexRef.current = gateIndexRef.current + 1;
      setGateIndex(gateIndexRef.current);
      gateProgressRef.current = null;
      updateFocus();
      tRef.current = Math.min(endTime, gate.t + EPSILON);
      setPlayheadTime(tRef.current);
    }
  }, [endTime, gates, updateFocus]);

  const processInputEvent = useCallback(
    (event: InputNoteEvent) => {
      if (event.type === "noteon") {
        heldPitchesRef.current.add(event.midi);
        lastNoteOnMsRef.current.set(event.midi, event.timeMs);
        if (
          modeRef.current === "player" &&
          phaseRef.current === "waiting" &&
          isPlayingRef.current
        ) {
          const gate = gates[gateIndexRef.current];
          const progress = gateProgressRef.current;
          if (!gate || !progress) return;
          if (!gate.requiredPitches.includes(event.midi)) return;
          if (
            gate.requiresFreshPress.has(event.midi) &&
            event.timeMs < progress.waitingStartMs
          ) {
            return;
          }
          if (progress.firstHitMs === null) {
            progress.firstHitMs = event.timeMs;
          }
          if (
            progress.firstHitMs !== null &&
            event.timeMs - progress.firstHitMs > chordWindowMs
          ) {
            // Lenient mode: ignore timing; no reset needed.
          }
          progress.satisfied.add(event.midi);
          advanceGateIfSatisfied();
        }
      } else {
        heldPitchesRef.current.delete(event.midi);
      }
    },
    [advanceGateIfSatisfied, chordWindowMs, gates]
  );

  useEffect(() => {
    if (inputEvents.length === 0) return;
    const startIndex = lastProcessedInputIndexRef.current;
    if (startIndex >= inputEvents.length) return;
    for (let i = startIndex; i < inputEvents.length; i += 1) {
      processInputEvent(inputEvents[i]);
    }
    lastProcessedInputIndexRef.current = inputEvents.length;
  }, [inputEvents, processInputEvent]);

  const tick = useCallback(
    (nowMs: number) => {
      if (!isPlayingRef.current) {
        lastFrameMsRef.current = nowMs;
        return;
      }
      const lastMs = lastFrameMsRef.current ?? nowMs;
      const dt = Math.max(0, (nowMs - lastMs) / 1000);
      lastFrameMsRef.current = nowMs;

      let nextTime = tRef.current;

      if (modeRef.current === "autoplay") {
        nextTime = Math.min(endTime, nextTime + dt * speed);
      } else {
        const nextGate = gates[gateIndexRef.current];
        if (phaseRef.current === "running") {
          if (nextGate) {
            nextTime = Math.min(nextTime + dt * speed, nextGate.t);
            if (nextTime >= nextGate.t - EPSILON) {
              nextTime = nextGate.t;
              tRef.current = nextTime;
              setPlayheadTime(nextTime);
              recomputeActiveNotes(nextTime);
              enterWaiting(nowMs);
              return;
            }
          } else {
            nextTime = Math.min(endTime, nextTime + dt * speed);
          }
        } else {
          nextTime = nextGate ? nextGate.t : nextTime;
        }
      }

      tRef.current = nextTime;
      setPlayheadTime(nextTime);
      recomputeActiveNotes(nextTime);
      updateFocus();
      if (nextTime >= endTime - EPSILON) {
        setIsPlaying(false);
        isPlayingRef.current = false;
      }
    },
    [endTime, enterWaiting, gates, recomputeActiveNotes, speed, updateFocus]
  );

  useEffect(() => {
    if (!enabled) return;
    let isMounted = true;
    const loop = (now: number) => {
      if (!isMounted) return;
      tick(now);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      isMounted = false;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [enabled, tick]);

  const play = useCallback(() => {
    if (!enabled) return;
    setIsPlaying(true);
    isPlayingRef.current = true;
    lastFrameMsRef.current = null;
  }, [enabled]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    isPlayingRef.current = false;
  }, []);

  const stop = useCallback(() => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    tRef.current = 0;
    setPlayheadTime(0);
    phaseRef.current = "running";
    setPhase("running");
    gateIndexRef.current = 0;
    setGateIndex(0);
    gateProgressRef.current = null;
    setFocusedNoteIds(new Set());
    setActiveNoteIds(new Set());
  }, []);

  const seek = useCallback(
    (timeSec: number) => {
      const clamped = Math.max(0, Math.min(endTime, timeSec));
      tRef.current = clamped;
      setPlayheadTime(clamped);
      recomputeActiveNotes(clamped);
    },
    [endTime, recomputeActiveNotes]
  );

  const setMode = useCallback((nextMode: PlaybackMode) => {
    modeRef.current = nextMode;
  }, []);

  return {
    playheadTime,
    focusedNoteIds,
    activeNoteIds,
    isPlaying,
    phase,
    gateIndex,
    play,
    pause,
    stop,
    seek,
    setMode,
  };
}
