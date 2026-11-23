import { getContext } from "tone";

/** The piano voices and practice transport share this AudioContext. */
export function pianoAudioContext() { return getContext().rawContext as unknown as AudioContext; }
export function audioNow() { return pianoAudioContext().currentTime; }
let anchor: number | null = null;
let offset = 0;
let preparingOffset: number | null = null;
let cancel: (() => void) | undefined;
export function demoTime() {
  if (anchor === null) return preparingOffset;
  return audioNow() - anchor - (pianoAudioContext().outputLatency || 0) + offset;
}
export function stopDemoTimeline() { cancel?.(); cancel = undefined; anchor = null; preparingOffset = null; }
export function prepareDemoTimeline(originalOffset: number) { stopDemoTimeline(); preparingOffset = originalOffset; }
export function startDemoTimeline<T extends { pitch: number; startTime: number; endTime: number }>(
  notes: T[], total: number, originalOffset: number,
  onNote: (note: T, at: number) => void, onActive: (pitches: Set<number>) => void, onEnd: () => void,
) {
  stopDemoTimeline();
  anchor = audioNow() + .04; offset = originalOffset;
  const start = anchor;
  const sorted = [...notes].sort((a,b) => a.startTime - b.startTime);
  let next = 0, raf = 0, last = "";
  const frame = () => {
    if (anchor !== start) return;
    const now = audioNow() - start;
    // Schedule against render time, not wall timers. Suspension freezes this timeline.
    while (next < sorted.length && sorted[next].startTime <= now) {
      const note = sorted[next++]; onNote(note, Math.max(audioNow(), start + note.startTime));
    }
    const audible = now - (pianoAudioContext().outputLatency || 0);
    const pitches = new Set(sorted.filter(n => n.startTime <= audible && n.endTime > audible).map(n => n.pitch));
    const key = [...pitches].join(",");
    if (key !== last) { last = key; onActive(pitches); }
    if (audible >= total) { stopDemoTimeline(); onActive(new Set()); onEnd(); return; }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  cancel = () => cancelAnimationFrame(raf);
}
