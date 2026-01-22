import { useRef, useEffect, useCallback, useState } from "react";
import * as Tone from "tone";
import {
  PianoSoundType,
  SAMPLED_INSTRUMENTS,
  getSamplerUrls,
  getSamplerBaseUrl
} from "./usePianoSound";

let sharedAudioContext: AudioContext | null = null;

function getSharedAudioContext() {
  if (!sharedAudioContext) {
    const AudioContextClass =
      window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) {
      throw new Error("No AudioContext available in this environment");
    }

    sharedAudioContext = new AudioContextClass({
      latencyHint: "interactive",
    });
  }
  return sharedAudioContext;
}

type AudioEngine = {
  type: "classic" | "fm-synth" | "sampler";
  startNote: (noteKey: string) => void;
  stopNote: (noteKey: string) => void;
  playNote: (noteKey: string, duration: number) => void;
  dispose: () => void;
};

// Classic oscillator-based engine (original sound)
function createClassicEngine(): AudioEngine {
  const audioContext = getSharedAudioContext();
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
        try {
          oscillator.stop();
          oscillator.disconnect();
          gain.disconnect();
        } catch (e) {
          // Ignore errors from already stopped oscillators
        }
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
      attack: 0.002,
      decay: 0.2,
      sustain: 0.3,
      release: 1.2
    },
    modulation: { type: "square" },
    modulationEnvelope: {
      attack: 0.01,
      decay: 0.05,
      sustain: 0.9,
      release: 0.3
    }
  });

  const reverb = new Tone.Reverb({
    decay: 1.5,
    preDelay: 0,
    wet: 0.2
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
  const enableShallowRelease = instrument === "acoustic-piano";
  const shallowReleaseGapMs = 35;
  const shallowReleaseHoldMs = 120;
  const shallowReleaseOverlapMs = 10;
  const pendingReleases = new Map<
    string,
    { time: number; sources: Tone.ToneBufferSource[]; timeoutId: ReturnType<typeof setTimeout> }
  >();
  const nowMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  
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

  const samplerWithSources = sampler as unknown as {
    _activeSources?: Map<number, Tone.ToneBufferSource[]>;
  };
  const getActiveSources = (noteKey: string) => {
    const midi = Tone.Frequency(noteKey).toMidi();
    const sources = samplerWithSources._activeSources?.get(midi);
    return sources && sources.length > 0 ? [...sources] : [];
  };
  const stopSources = (sources: Tone.ToneBufferSource[], delayMs = 0) => {
    const stopTime = Tone.now() + delayMs / 1000;
    sources.forEach((source) => {
      source.stop(stopTime);
    });
  };

  return {
    engine: {
      type: "sampler",
      startNote: (noteKey: string) => {
        if (enableShallowRelease) {
          const pending = pendingReleases.get(noteKey);
          if (pending) {
            const gap = nowMs() - pending.time;
            clearTimeout(pending.timeoutId);
            pendingReleases.delete(noteKey);
            if (gap <= shallowReleaseGapMs) {
              stopSources(pending.sources, shallowReleaseOverlapMs);
            } else {
              stopSources(pending.sources);
            }
          }
        }
        sampler.triggerAttack(noteKey, Tone.now());
      },
      stopNote: (noteKey: string) => {
        if (!enableShallowRelease) {
          sampler.triggerRelease(noteKey, Tone.now());
          return;
        }

        const sources = getActiveSources(noteKey);
        if (sources.length === 0) return;

        const existing = pendingReleases.get(noteKey);
        if (existing) {
          clearTimeout(existing.timeoutId);
        }

        const releaseTimeout = setTimeout(() => {
          stopSources(sources);
          pendingReleases.delete(noteKey);
        }, shallowReleaseHoldMs);
        pendingReleases.set(noteKey, { time: nowMs(), sources, timeoutId: releaseTimeout });
      },
      playNote: (noteKey: string, duration: number) => {
        sampler.triggerAttackRelease(noteKey, duration, Tone.now());
      },
      dispose: () => {
        pendingReleases.forEach(({ timeoutId }) => clearTimeout(timeoutId));
        pendingReleases.clear();
        sampler.dispose();
      },
    },
    loadPromise,
  };
}

export function useTonePiano(soundType: PianoSoundType | null = "classic") {
  const [isLoaded, setIsLoaded] = useState(false);
  const engineRef = useRef<AudioEngine | null>(null);
  const soundTypeRef = useRef<PianoSoundType | null>(soundType);
  // Use ref to track isLoaded for stable callbacks
  const isLoadedRef = useRef(false);

  // Keep isLoadedRef in sync with isLoaded state
  useEffect(() => {
    isLoadedRef.current = isLoaded;
  }, [isLoaded]);

  useEffect(() => {
    // Clean up previous engine before creating a new one
    if (engineRef.current) {
      console.log(`[AudioEngine] Disposing previous engine (type: ${engineRef.current.type})`);
      engineRef.current.dispose();
      engineRef.current = null;
    }
    
    setIsLoaded(false);
    isLoadedRef.current = false;
    soundTypeRef.current = soundType;

    // Skip engine creation if soundType is null
    if (soundType === null) {
      return;
    }

    if (soundType === "classic") {
      console.log("[AudioEngine] Creating classic engine");
      engineRef.current = createClassicEngine();
      setIsLoaded(true);
      isLoadedRef.current = true;
    } else if (SAMPLED_INSTRUMENTS.includes(soundType)) {
      console.log(`[AudioEngine] Creating sampler engine for: ${soundType}`);
      const { engine, loadPromise } = createSamplerEngine(soundType);
      engineRef.current = engine;
      loadPromise.then(() => {
        if (soundTypeRef.current === soundType && engineRef.current === engine) {
          setIsLoaded(true);
          isLoadedRef.current = true;
          console.log(`[AudioEngine] Sampler engine loaded: ${soundType}`);
        } else {
          console.log(`[AudioEngine] Sampler engine load completed but soundType changed or engine replaced`);
        }
      });
    }

    return () => {
      if (engineRef.current) {
        console.log(`[AudioEngine] Cleanup: Disposing engine (type: ${engineRef.current.type})`);
        engineRef.current.dispose();
        engineRef.current = null;
      }
    };
  }, [soundType]);

  // Stable callbacks using refs - no dependencies means reference never changes
  const ensureAudioReady = useCallback(async () => {
    const audioContext = getSharedAudioContext();
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    const toneContext = Tone.getContext();
    toneContext.lookAhead = Math.min(toneContext.lookAhead, 0.01);
    // Note: latencyHint is read-only and can only be set during context creation

    if (toneContext.state === "suspended") {
      await toneContext.resume();
    }

    await Tone.start();
  }, []);

  const startNote = useCallback((noteKey: string) => {
    if (!engineRef.current || !isLoadedRef.current) return;
    engineRef.current.startNote(noteKey);
  }, []);

  const stopNote = useCallback((noteKey: string) => {
    if (!engineRef.current || !isLoadedRef.current) return;
    engineRef.current.stopNote(noteKey);
  }, []);

  const playNote = useCallback(async (noteKey: string, duration: number = 0.3) => {
    if (!engineRef.current || !isLoadedRef.current) return;
    engineRef.current.playNote(noteKey, duration);
  }, []);

  return {
    isLoaded,
    ensureAudioReady,
    startNote,
    stopNote,
    playNote,
  };
}
