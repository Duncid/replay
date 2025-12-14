import { useCallback, useRef } from "react";
import { useTonePiano } from "./useTonePiano";
import { PianoSoundType } from "./usePianoSound";

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

export function usePianoAudio(soundType: PianoSoundType | null = "classic") {
  const tonePiano = useTonePiano(soundType);
  
  // Store tonePiano in ref for stable callbacks
  const tonePianoRef = useRef(tonePiano);
  tonePianoRef.current = tonePiano;

  // Stable callbacks using refs - no dependencies means reference never changes
  const ensureAudioReady = useCallback(async () => {
    if (tonePianoRef.current) await tonePianoRef.current.ensureAudioReady();
  }, []);

  const playNote = useCallback(async (frequency: number, duration: number = 0.3) => {
    if (!tonePianoRef.current) return;
    const noteKey = frequencyToNote(frequency);
    await tonePianoRef.current.playNote(noteKey, duration);
  }, []);

  const startNote = useCallback((noteKey: string, _frequency: number) => {
    if (!tonePianoRef.current) return;
    // noteKey is already in format like "C4", so use it directly
    tonePianoRef.current.startNote(noteKey);
  }, []);

  const stopNote = useCallback((noteKey: string) => {
    if (!tonePianoRef.current) return;
    tonePianoRef.current.stopNote(noteKey);
  }, []);

  return {
    isLoaded: tonePiano?.isLoaded ?? false,
    ensureAudioReady,
    playNote,
    startNote,
    stopNote,
  };
}
