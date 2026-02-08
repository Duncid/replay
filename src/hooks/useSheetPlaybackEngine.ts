import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NoteEvent } from "@/components/PianoSheetPixiLayout";

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
  enabled: boolean;
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

/**
 * Find the gate index whose time is >= the given time.
 * If the time is past all gates, returns gates.length.
 */
function findGateIndexForTime(gates: Gate[], timeSec: number): number {
  for (let i = 0; i < gates.length; i++) {
    if (gates[i].t >= timeSec - EPSILON) return i;
  }
  return gates.length;
}

export function useSheetPlaybackEngine({
  notes,
  enabled,
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

  const [isAutoplay, setIsAutoplay] = useState(false);
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
  const isAutoplayRef = useRef(false);
  const lastFrameMsRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const heldPitchesRef = useRef(new Set<number>());
  const lastNoteOnMsRef = useRef(new Map<number, number>());
  const gateProgressRef = useRef<GateProgress | null>(null);
  // Whether player-mode advancement is active (after a gate is satisfied,
  // the engine advances through silence gaps until the next gate).
  const playerAdvancingRef = useRef(false);

  const activeNoteIdsRef = useRef<Set<string>>(new Set());

  const recomputeActiveNotes = useCallback(
    (timeSec: number): boolean => {
      const prev = activeNoteIdsRef.current;
      if (notes.length === 0) {
        if (prev.size > 0) {
          activeNoteIdsRef.current = new Set();
          setActiveNoteIds(activeNoteIdsRef.current);
          return true;
        }
        return false;
      }
      const active = new Set<string>();
      notes.forEach((note) => {
        if (
          note.start - EPSILON <= timeSec &&
          timeSec < note.start + note.dur
        ) {
          active.add(note.id);
        }
      });
      // Only update state if the content actually changed
      if (
        active.size !== prev.size ||
        Array.from(active).some((id) => !prev.has(id))
      ) {
        activeNoteIdsRef.current = active;
        setActiveNoteIds(active);
        return true;
      }
      return false;
    },
    [notes]
  );

  const focusedNoteIdsRef = useRef<Set<string>>(new Set());

  const setFocusedIfChanged = useCallback(
    (next: Set<string>) => {
      const prev = focusedNoteIdsRef.current;
      if (
        next.size !== prev.size ||
        Array.from(next).some((id) => !prev.has(id))
      ) {
        focusedNoteIdsRef.current = next;
        setFocusedNoteIds(next);
      }
    },
    []
  );

  const updateFocus = useCallback(() => {
    if (isAutoplayRef.current) {
      setFocusedIfChanged(new Set());
      return;
    }
    if (phaseRef.current === "waiting") {
      const gate = gates[gateIndexRef.current];
      if (gate) {
        setFocusedIfChanged(new Set(gate.noteIds));
        return;
      }
    }
    setFocusedIfChanged(new Set());
  }, [gates, setFocusedIfChanged]);

  useEffect(() => {
    if (!enabled) {
      setIsAutoplay(false);
      isAutoplayRef.current = false;
      playerAdvancingRef.current = false;
    }
  }, [enabled]);

  const enterWaiting = useCallback(
    (nowMs: number) => {
      phaseRef.current = "waiting";
      setPhase("waiting");
      playerAdvancingRef.current = false;
      const gate = gates[gateIndexRef.current];
      if (!gate) {
        gateProgressRef.current = null;
        setFocusedIfChanged(new Set());
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
        // Already satisfied (held keys match) — advance immediately
        phaseRef.current = "running";
        setPhase("running");
        gateIndexRef.current = gateIndexRef.current + 1;
        setGateIndex(gateIndexRef.current);
        gateProgressRef.current = null;
        playerAdvancingRef.current = true;
        updateFocus();
      }
    },
    [gates, setFocusedIfChanged, updateFocus]
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
      playerAdvancingRef.current = true;
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

        // If autoplay is running, stop it — user is taking over
        if (isAutoplayRef.current) {
          isAutoplayRef.current = false;
          setIsAutoplay(false);
          // Sync gateIndex to current playhead position so gates work
          // from wherever autoplay left off
          const newGateIdx = findGateIndexForTime(gates, tRef.current);
          gateIndexRef.current = newGateIdx;
          setGateIndex(newGateIdx);
          // Enter waiting at the current gate if we're at its time
          const gate = gates[newGateIdx];
          if (gate && Math.abs(tRef.current - gate.t) < EPSILON) {
            enterWaiting(event.timeMs);
          } else {
            phaseRef.current = "running";
            setPhase("running");
            playerAdvancingRef.current = true;
          }
        }

        // Look-ahead: if advancing toward a gate and the pressed pitch
        // matches the next gate, snap the playhead forward to it
        if (phaseRef.current === "running" && !isAutoplayRef.current) {
          const nextGate = gates[gateIndexRef.current];
          if (nextGate && nextGate.requiredPitches.includes(event.midi)) {
            tRef.current = nextGate.t;
            setPlayheadTime(nextGate.t);
            recomputeActiveNotes(nextGate.t);
            enterWaiting(event.timeMs);
            // Now fall through to the waiting block below
          }
        }

        // Process gate satisfaction — works whenever we're waiting at a gate
        if (phaseRef.current === "waiting") {
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
    [advanceGateIfSatisfied, chordWindowMs, enterWaiting, gates, recomputeActiveNotes]
  );

  const processInputEventRef = useRef(processInputEvent);
  processInputEventRef.current = processInputEvent;

  const handleInputEvent = useCallback((event: InputNoteEvent) => {
    processInputEventRef.current(event);
  }, []);

  const tick = useCallback(
    (nowMs: number) => {
      const autoplay = isAutoplayRef.current;
      const advancing = playerAdvancingRef.current;

      // If nothing is driving time forward, just keep lastFrame fresh
      if (!autoplay && !advancing) {
        lastFrameMsRef.current = nowMs;

        // Even when idle, if we're not at a gate yet, check if we should
        // enter waiting at the current position's gate
        if (phaseRef.current !== "waiting") {
          const gate = gates[gateIndexRef.current];
          if (gate && tRef.current >= gate.t - EPSILON) {
            tRef.current = gate.t;
            setPlayheadTime(gate.t);
            recomputeActiveNotes(gate.t);
            enterWaiting(nowMs);
          }
        }
        return;
      }

      const lastMs = lastFrameMsRef.current ?? nowMs;
      const dt = Math.max(0, (nowMs - lastMs) / 1000);
      lastFrameMsRef.current = nowMs;

      let nextTime = tRef.current;

      if (autoplay) {
        // Autoplay: advance continuously, no gate stops
        nextTime = Math.min(endTime, nextTime + dt * speed);
      } else {
        // Player advancing: move through silence gaps, stop at next gate
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
            // Past all gates — advance to end
            nextTime = Math.min(endTime, nextTime + dt * speed);
            if (nextTime >= endTime - EPSILON) {
              playerAdvancingRef.current = false;
            }
          }
        } else {
          // Waiting at gate — don't advance time
          return;
        }
      }

      tRef.current = nextTime;
      const activeChanged = recomputeActiveNotes(nextTime);
      if (activeChanged) {
        setPlayheadTime(nextTime);
      }
      updateFocus();

      if (nextTime >= endTime - EPSILON) {
        if (autoplay) {
          setIsAutoplay(false);
          isAutoplayRef.current = false;
        }
        playerAdvancingRef.current = false;
      }
    },
    [endTime, enterWaiting, gates, recomputeActiveNotes, speed, updateFocus]
  );

  // RAF loop runs always when enabled — needed for both autoplay and
  // player-mode silence-gap advancement
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
    isAutoplayRef.current = true;
    setIsAutoplay(true);
    playerAdvancingRef.current = false;
    lastFrameMsRef.current = null;
    // Clear gate waiting state so autoplay runs freely
    phaseRef.current = "running";
    setPhase("running");
    gateProgressRef.current = null;
    setFocusedIfChanged(new Set());
  }, [enabled, setFocusedIfChanged]);

  const pause = useCallback(() => {
    isAutoplayRef.current = false;
    setIsAutoplay(false);
    playerAdvancingRef.current = false;
    // Sync gate index to where the playhead is so player mode
    // can pick up from here
    const newGateIdx = findGateIndexForTime(gates, tRef.current);
    gateIndexRef.current = newGateIdx;
    setGateIndex(newGateIdx);
  }, [gates]);

  const stop = useCallback(() => {
    isAutoplayRef.current = false;
    setIsAutoplay(false);
    playerAdvancingRef.current = false;
    tRef.current = 0;
    setPlayheadTime(0);
    phaseRef.current = "running";
    setPhase("running");
    gateIndexRef.current = 0;
    setGateIndex(0);
    gateProgressRef.current = null;
    focusedNoteIdsRef.current = new Set();
    setFocusedNoteIds(focusedNoteIdsRef.current);
    activeNoteIdsRef.current = new Set();
    setActiveNoteIds(activeNoteIdsRef.current);
  }, []);

  const seek = useCallback(
    (timeSec: number) => {
      const clamped = Math.max(0, Math.min(endTime, timeSec));
      tRef.current = clamped;
      setPlayheadTime(clamped);
      recomputeActiveNotes(clamped);
      const newGateIdx = findGateIndexForTime(gates, clamped);
      gateIndexRef.current = newGateIdx;
      setGateIndex(newGateIdx);
    },
    [endTime, gates, recomputeActiveNotes]
  );

  return {
    playheadTime,
    playheadTimeRef: tRef,
    focusedNoteIds,
    activeNoteIds,
    isAutoplay,
    phase,
    gateIndex,
    play,
    pause,
    stop,
    seek,
    handleInputEvent,
  };
}
