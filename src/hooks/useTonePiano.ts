import { useRef, useEffect, useCallback, useState } from "react";
import * as Tone from "tone";
import { 
  PianoSoundType, 
  SAMPLED_INSTRUMENTS, 
  getSamplerUrls, 
  getSamplerBaseUrl 
} from "./usePianoSound";

type AudioEngine = {
  type: "classic" | "fm-synth" | "sampler";
  startNote: (noteKey: string) => void;
  stopNote: (noteKey: string) => void;
  playNote: (noteKey: string, duration: number) => void;
  dispose: () => void;
};

// Classic oscillator-based engine (original sound)
function createClassicEngine(): AudioEngine {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const activeOscillators = new Map<string, { oscillator: OscillatorNode; gain: GainNode }>();
  
  const noteToFrequency = (noteKey: string): number => {
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const match = noteKey.match(/^([A-G]#?)(\d+)$/);
    if (!match) return 440;
    const [, note, octaveStr] = match;
    const octave = parseInt(octaveStr);
    const noteIndex = noteNames.indexOf(note);
    const semitonesFromA4 = (octave - 4) * 12 + (noteIndex - 9);
    return 440 * Math.pow(2, semitonesFromA4 / 12);
  };

  return {
    type: "classic",
    startNote: (noteKey: string) => {
      if (activeOscillators.has(noteKey)) return;
      
      const frequency = noteToFrequency(noteKey);
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
      
      gain.gain.setValueAtTime(0, audioContext.currentTime);
      gain.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01);
      
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      
      activeOscillators.set(noteKey, { oscillator, gain });
    },
    stopNote: (noteKey: string) => {
      const active = activeOscillators.get(noteKey);
      if (active) {
        const { oscillator, gain } = active;
        gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.1);
        setTimeout(() => {
          oscillator.stop();
          oscillator.disconnect();
          gain.disconnect();
        }, 150);
        activeOscillators.delete(noteKey);
      }
    },
    playNote: (noteKey: string, duration: number) => {
      const frequency = noteToFrequency(noteKey);
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
      
      gain.gain.setValueAtTime(0, audioContext.currentTime);
      gain.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01);
      gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + duration);
      
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration + 0.1);
    },
    dispose: () => {
      activeOscillators.forEach(({ oscillator, gain }) => {
        oscillator.stop();
        oscillator.disconnect();
        gain.disconnect();
      });
      activeOscillators.clear();
    },
  };
}

// FM Synth engine using Tone.js
function createFMSynthEngine(): { engine: AudioEngine; loadPromise: Promise<void> } {
  const synth = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 3,
    modulationIndex: 10,
    detune: 0,
    oscillator: { type: "sine" },
    envelope: {
      attack: 0.01,
      decay: 0.2,
      sustain: 0.3,
      release: 1.2
    },
    modulation: { type: "square" },
    modulationEnvelope: {
      attack: 0.5,
      decay: 0,
      sustain: 1,
      release: 0.5
    }
  });

  const reverb = new Tone.Reverb({
    decay: 1.5,
    preDelay: 0.01,
    wet: 0.3
  });

  synth.connect(reverb);
  reverb.toDestination();

  const loadPromise = reverb.generate().then(() => {});

  return {
    engine: {
      type: "fm-synth",
      startNote: (noteKey: string) => {
        synth.triggerAttack(noteKey, Tone.now());
      },
      stopNote: (noteKey: string) => {
        synth.triggerRelease(noteKey, Tone.now());
      },
      playNote: (noteKey: string, duration: number) => {
        synth.triggerAttackRelease(noteKey, duration, Tone.now());
      },
      dispose: () => {
        synth.dispose();
        reverb.dispose();
      },
    },
    loadPromise,
  };
}

// Sampler engine using Tone.js Sampler with tonejs-instruments
function createSamplerEngine(instrument: PianoSoundType): { engine: AudioEngine; loadPromise: Promise<void> } {
  const urls = getSamplerUrls(instrument);
  const baseUrl = getSamplerBaseUrl(instrument);
  
  let resolveLoad: () => void;
  const loadPromise = new Promise<void>((resolve) => {
    resolveLoad = resolve;
  });

  const sampler = new Tone.Sampler({
    urls,
    baseUrl,
    onload: () => {
      resolveLoad();
    },
    onerror: (err) => {
      console.error("Sampler load error:", err);
      resolveLoad(); // Resolve anyway to not block
    }
  }).toDestination();

  return {
    engine: {
      type: "sampler",
      startNote: (noteKey: string) => {
        sampler.triggerAttack(noteKey, Tone.now());
      },
      stopNote: (noteKey: string) => {
        sampler.triggerRelease(noteKey, Tone.now());
      },
      playNote: (noteKey: string, duration: number) => {
        sampler.triggerAttackRelease(noteKey, duration, Tone.now());
      },
      dispose: () => {
        sampler.dispose();
      },
    },
    loadPromise,
  };
}

export function useTonePiano(soundType: PianoSoundType = "classic") {
  const [isLoaded, setIsLoaded] = useState(false);
  const engineRef = useRef<AudioEngine | null>(null);
  const soundTypeRef = useRef<PianoSoundType>(soundType);

  useEffect(() => {
    // Clean up previous engine
    if (engineRef.current) {
      engineRef.current.dispose();
      engineRef.current = null;
    }
    
    setIsLoaded(false);
    soundTypeRef.current = soundType;

    if (soundType === "classic") {
      engineRef.current = createClassicEngine();
      setIsLoaded(true);
    } else if (soundType === "fm-synth") {
      const { engine, loadPromise } = createFMSynthEngine();
      engineRef.current = engine;
      loadPromise.then(() => {
        if (soundTypeRef.current === soundType) {
          setIsLoaded(true);
        }
      });
    } else if (SAMPLED_INSTRUMENTS.includes(soundType)) {
      const { engine, loadPromise } = createSamplerEngine(soundType);
      engineRef.current = engine;
      loadPromise.then(() => {
        if (soundTypeRef.current === soundType) {
          setIsLoaded(true);
        }
      });
    }

    return () => {
      if (engineRef.current) {
        engineRef.current.dispose();
        engineRef.current = null;
      }
    };
  }, [soundType]);

  const ensureAudioReady = useCallback(async () => {
    await Tone.start();
  }, []);

  const startNote = useCallback((noteKey: string) => {
    if (!engineRef.current || !isLoaded) return;
    engineRef.current.startNote(noteKey);
  }, [isLoaded]);

  const stopNote = useCallback((noteKey: string) => {
    if (!engineRef.current || !isLoaded) return;
    engineRef.current.stopNote(noteKey);
  }, [isLoaded]);

  const playNote = useCallback(async (noteKey: string, duration: number = 0.3) => {
    if (!engineRef.current || !isLoaded) return;
    engineRef.current.playNote(noteKey, duration);
  }, [isLoaded]);

  return {
    isLoaded,
    ensureAudioReady,
    startNote,
    stopNote,
    playNote,
  };
}
