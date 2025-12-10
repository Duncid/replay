import { useCallback } from "react";
import { useTonePiano } from "./useTonePiano";

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

export function usePianoAudio() {
  const tonePiano = useTonePiano();

  const ensureAudioReady = useCallback(async () => {
    await tonePiano.ensureAudioReady();
  }, [tonePiano]);

  const playNote = useCallback(async (frequency: number, duration: number = 0.3) => {
    const noteKey = frequencyToNote(frequency);
    await tonePiano.playNote(noteKey, duration);
  }, [tonePiano]);

  const startNote = useCallback((noteKey: string, _frequency: number) => {
    // noteKey is already in format like "C4", so use it directly
    tonePiano.startNote(noteKey);
  }, [tonePiano]);

  const stopNote = useCallback((noteKey: string) => {
    tonePiano.stopNote(noteKey);
  }, [tonePiano]);

  return {
    isLoaded: tonePiano.isLoaded,
    ensureAudioReady,
    playNote,
    startNote,
    stopNote,
  };
}
