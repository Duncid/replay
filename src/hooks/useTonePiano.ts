import { useRef, useEffect, useCallback, useState } from "react";
import * as Tone from "tone";
import { Piano } from "@tonejs/piano";

export function useTonePiano() {
  const [isLoaded, setIsLoaded] = useState(false);
  const pianoRef = useRef<Piano | null>(null);
  const initStartedRef = useRef(false);

  useEffect(() => {
    if (initStartedRef.current) return;
    initStartedRef.current = true;

    const piano = new Piano({
      velocities: 5,
    });

    piano.toDestination();
    piano.load().then(() => {
      setIsLoaded(true);
    });

    pianoRef.current = piano;

    return () => {
      piano.disconnect();
    };
  }, []);

  const ensureAudioReady = useCallback(async () => {
    await Tone.start();
  }, []);

  const startNote = useCallback((noteKey: string) => {
    if (!pianoRef.current || !isLoaded) return;
    pianoRef.current.keyDown({ note: noteKey });
  }, [isLoaded]);

  const stopNote = useCallback((noteKey: string) => {
    if (!pianoRef.current || !isLoaded) return;
    pianoRef.current.keyUp({ note: noteKey });
  }, [isLoaded]);

  const playNote = useCallback(async (noteKey: string, duration: number = 0.3) => {
    if (!pianoRef.current || !isLoaded) return;
    pianoRef.current.keyDown({ note: noteKey });
    setTimeout(() => {
      pianoRef.current?.keyUp({ note: noteKey });
    }, duration * 1000);
  }, [isLoaded]);

  const pedalDown = useCallback(() => {
    if (!pianoRef.current || !isLoaded) return;
    pianoRef.current.pedalDown();
  }, [isLoaded]);

  const pedalUp = useCallback(() => {
    if (!pianoRef.current || !isLoaded) return;
    pianoRef.current.pedalUp();
  }, [isLoaded]);

  return {
    isLoaded,
    ensureAudioReady,
    startNote,
    stopNote,
    playNote,
    pedalDown,
    pedalUp,
  };
}
