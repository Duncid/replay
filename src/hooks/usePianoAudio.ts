import { useCallback, useEffect, useRef } from "react";
import { useTonePiano } from "./useTonePiano";
import { PianoSoundType } from "./usePianoSound";

import { startKeyboardNote } from "@/lib/midiOutput";

// Helper to convert frequency to note name
function frequencyToNote(frequency: number): string {
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const A4 = 440;
  const semitonesFromA4 = Math.round(12 * Math.log2(frequency / A4));
  const midiNumber = 69 + semitonesFromA4;
  const octave = Math.floor(midiNumber / 12) - 1;
  const noteIndex = midiNumber % 12;
  return `${noteNames[noteIndex]}${octave}`;
}

export function usePianoAudio(soundType: PianoSoundType | null = "acoustic-piano") {
  const tonePiano = useTonePiano(soundType);
  const heldNotes = useRef(new Map<string, () => void>());
  const playingNotes = useRef(new Set<() => void>());
  useEffect(() => () => {
    for (const release of heldNotes.current.values()) release();
    for (const release of playingNotes.current) release();
    heldNotes.current.clear();
    playingNotes.current.clear();
  }, []);
  
  // Store tonePiano in ref for stable callbacks
  const tonePianoRef = useRef(tonePiano);
  tonePianoRef.current = tonePiano;

  // Stable callbacks using refs - no dependencies means reference never changes
  const ensureAudioReady = useCallback(async () => {
    if (tonePianoRef.current) await tonePianoRef.current.ensureAudioReady();
  }, []);

  const preload = useCallback(async () => {
    if (tonePianoRef.current) await tonePianoRef.current.preload();
  }, []);

  const playNote = useCallback(async (frequency: number, duration: number = 0.3) => {
    if (soundType === null) return;
    const release = startKeyboardNote(Math.round(69 + 12 * Math.log2(frequency / 440)));
    if (release) {
      playingNotes.current.add(release);
      setTimeout(() => { release(); playingNotes.current.delete(release); }, Math.max(0, duration) * 1000);
      return;
    }
    if (!tonePianoRef.current) return;
    const noteKey = frequencyToNote(frequency);
    await tonePianoRef.current.playNote(noteKey, duration);
  }, [soundType]);

  const startNote = useCallback((noteKey: string, frequency: number, options?: { localOnly?: boolean }) => {
    heldNotes.current.get(noteKey)?.();
    if (soundType === null) return;
    const release = !options?.localOnly
      ? startKeyboardNote(Math.round(69 + 12 * Math.log2(frequency / 440))) : null;
    if (release) {
      heldNotes.current.set(noteKey, release);
      return;
    }
    // Resume in this gesture and schedule the voice immediately. Waiting for
    // resume can swallow a quick first tap when touchend arrives first.
    void ensureAudioReady().catch(error => console.warn("Audio resume failed:", error));
    tonePianoRef.current.startNote(noteKey);
    heldNotes.current.set(noteKey, () => tonePianoRef.current.stopNote(noteKey));
  }, [ensureAudioReady, soundType]);

  const stopNote = useCallback((noteKey: string) => {
    heldNotes.current.get(noteKey)?.();
    heldNotes.current.delete(noteKey);
  }, []);

  return {
    isLoaded: tonePiano?.isLoaded ?? false,
    ensureAudioReady,
    preload,
    playNote,
    startNote,
    stopNote,
  };
}
