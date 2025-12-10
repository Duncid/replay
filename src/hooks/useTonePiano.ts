import { useRef, useEffect, useCallback, useState } from "react";
import * as Tone from "tone";

export function useTonePiano() {
  const [isLoaded, setIsLoaded] = useState(false);
  const synthRef = useRef<Tone.PolySynth | null>(null);
  const reverbRef = useRef<Tone.Reverb | null>(null);
  const initStartedRef = useRef(false);

  useEffect(() => {
    if (initStartedRef.current) return;
    initStartedRef.current = true;

    // Create a PolySynth with FMSynth for rich piano-like sound
    const synth = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 3,
      modulationIndex: 10,
      detune: 0,
      oscillator: {
        type: "sine"
      },
      envelope: {
        attack: 0.01,
        decay: 0.2,
        sustain: 0.3,
        release: 1.2
      },
      modulation: {
        type: "square"
      },
      modulationEnvelope: {
        attack: 0.5,
        decay: 0,
        sustain: 1,
        release: 0.5
      }
    });

    // Add reverb for richness
    const reverb = new Tone.Reverb({
      decay: 1.5,
      preDelay: 0.01,
      wet: 0.3
    });

    synth.connect(reverb);
    reverb.toDestination();

    synthRef.current = synth;
    reverbRef.current = reverb;

    // Reverb needs time to generate impulse response
    reverb.generate().then(() => {
      setIsLoaded(true);
    });

    return () => {
      synth.dispose();
      reverb.dispose();
    };
  }, []);

  const ensureAudioReady = useCallback(async () => {
    await Tone.start();
  }, []);

  const startNote = useCallback((noteKey: string) => {
    if (!synthRef.current || !isLoaded) return;
    synthRef.current.triggerAttack(noteKey, Tone.now());
  }, [isLoaded]);

  const stopNote = useCallback((noteKey: string) => {
    if (!synthRef.current || !isLoaded) return;
    synthRef.current.triggerRelease(noteKey, Tone.now());
  }, [isLoaded]);

  const playNote = useCallback(async (noteKey: string, duration: number = 0.3) => {
    if (!synthRef.current || !isLoaded) return;
    synthRef.current.triggerAttackRelease(noteKey, duration, Tone.now());
  }, [isLoaded]);

  const pedalDown = useCallback(() => {
    // Increase reverb wet for pedal effect
    if (reverbRef.current) {
      reverbRef.current.wet.value = 0.6;
    }
  }, []);

  const pedalUp = useCallback(() => {
    // Reset reverb wet
    if (reverbRef.current) {
      reverbRef.current.wet.value = 0.3;
    }
  }, []);

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
