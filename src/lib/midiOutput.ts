let output: MIDIOutput | null = null;
let enabled = false;
const active = new Set<() => void>();
const counts = new Map<MIDIOutput, Map<number, number>>();
const listeners = new Set<() => void>();
export const subscribeMidiOutput = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const hasMidiOutput = () => output !== null;
export function releaseMidiOutputNotes() {
  for (const release of [...active]) release();
}
export function setMidiOutput(next: MIDIOutput | null) {
  if (next === output) return;
  releaseMidiOutputNotes();
  output = next;
  for (const listener of listeners) listener();
}
export function selectMidiOutput(access: MIDIAccess, input: MIDIInput): MIDIOutput | null {
  const outputs = [...access.outputs.values()].filter(port => port.state !== "disconnected");
  return outputs.find(port => port.name === input.name) ?? (outputs.length === 1 ? outputs[0] : null);
}
export function enableKeyboardPlayback(value: boolean) {
  if (!value) releaseMidiOutputNotes();
  enabled = value;
}
export function startKeyboardNote(note: number, velocity = 100): (() => void) | null {
  const port = output;
  if (!enabled || !port || port.state === "disconnected" || !Number.isInteger(note) || note < 0 || note > 127) return null;
  try { port.send([0x90, note, velocity]); }
  catch { return null; }
  const notes = counts.get(port) ?? new Map<number, number>();
  counts.set(port, notes);
  notes.set(note, (notes.get(note) ?? 0) + 1);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    active.delete(release);
    const remaining = (notes.get(note) ?? 1) - 1;
    if (remaining > 0) { notes.set(note, remaining); return; }
    notes.delete(note);
    if (notes.size === 0) counts.delete(port);
    try { port.send([0x80, note, 0]); } catch { /* Port was unplugged. */ }
  };
  active.add(release);
  return release;
}
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", releaseMidiOutputNotes);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) releaseMidiOutputNotes();
  });
}
