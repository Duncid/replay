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
    sharedAudioContext = new AudioContext({
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
  const nowMs = () => performance.now();
  
  let resolveLoad: () => void;
  let rejectLoad: (reason: unknown) => void;
  const loadPromise = new Promise<void>((resolve, reject) => {
    resolveLoad = resolve;
    rejectLoad = reject;
  });

  const sampler = new Tone.Sampler({
    urls,
    baseUrl,
    onload: () => {
      resolveLoad();
    },
    onerror: (err) => {
      console.error("Sampler load error:", err);
      rejectLoad(err); // Keep using the basic tone if any required sample fails.
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

export function useTonePiano(soundType: PianoSoundType | null = "acoustic-piano") {
  const [isLoaded, setIsLoaded] = useState(false);
  const engineRef = useRef<AudioEngine | null>(null);
  const fallbackEngineRef = useRef<AudioEngine | null>(null);
  const activeNotesRef = useRef(new Map<string, AudioEngine>());
  const soundTypeRef = useRef<PianoSoundType | null>(soundType);
  const loadPromiseRef = useRef<Promise<void> | null>(null);
  // Use ref to track isLoaded for stable callbacks
  const isLoadedRef = useRef(false);

  // Keep isLoadedRef in sync with isLoaded state
  useEffect(() => {
    isLoadedRef.current = isLoaded;
  }, [isLoaded]);

  useEffect(() => {
    const activeNotes = activeNotesRef.current;
    activeNotes.forEach((engine, note) => engine.stopNote(note));
    activeNotesRef.current.clear();
    fallbackEngineRef.current?.dispose();
    fallbackEngineRef.current = null;
    // Clean up previous engine before creating a new one
    if (engineRef.current) {
      console.log(`[AudioEngine] Disposing previous engine (type: ${engineRef.current.type})`);
      engineRef.current.dispose();
      engineRef.current = null;
    }
    
    setIsLoaded(false);
    isLoadedRef.current = false;
    soundTypeRef.current = soundType;
    loadPromiseRef.current = null;

    // Skip engine creation if soundType is null
    if (soundType === null) {
      return;
    }

    if (soundType === "classic") {
      console.log("[AudioEngine] Creating classic engine");
      engineRef.current = createClassicEngine();
      setIsLoaded(true);
      isLoadedRef.current = true;
      loadPromiseRef.current = Promise.resolve();
    } else if (SAMPLED_INSTRUMENTS.includes(soundType)) {
      console.log(`[AudioEngine] Creating sampler engine for: ${soundType}`);
      // Keys remain playable during a cold/failed sample download.
      fallbackEngineRef.current = createClassicEngine();
      const { engine, loadPromise } = createSamplerEngine(soundType);
      engineRef.current = engine;
      loadPromiseRef.current = loadPromise.then(() => {
        if (soundTypeRef.current === soundType && engineRef.current === engine) {
          setIsLoaded(true);
          isLoadedRef.current = true;
          console.log(`[AudioEngine] Sampler engine loaded: ${soundType}`);
        } else {
          console.log(`[AudioEngine] Sampler engine load completed but soundType changed or engine replaced`);
        }
      }).catch(error => {
        console.warn("[AudioEngine] Samples unavailable; using basic piano tone:", error);
      });
    }

    return () => {
      activeNotes.forEach((engine, note) => engine.stopNote(note));
      activeNotes.clear();
      fallbackEngineRef.current?.dispose();
      fallbackEngineRef.current = null;
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
    const toneContext = Tone.getContext();
    toneContext.lookAhead = Math.min(toneContext.lookAhead, 0.01);
    // Start every resume synchronously inside the key/touch gesture. Awaiting
    // one context first can lose WebKit's user activation for the next one.
    const resumes: Promise<unknown>[] = [];
    // WebKit may report an interruption after returning from the background.
    if (audioContext.state !== "running" && audioContext.state !== "closed") resumes.push(audioContext.resume());
    resumes.push(Tone.start());
    await Promise.all(resumes);
  }, []);

  const preload = useCallback(async () => {
    if (soundTypeRef.current === null) return;
    try {
      await ensureAudioReady();
      await loadPromiseRef.current;
    } catch (error) {
      console.warn("[AudioEngine] Preload skipped:", error);
    }
  }, [ensureAudioReady]);

  const startNote = useCallback((noteKey: string) => {
    const engine = isLoadedRef.current ? engineRef.current : fallbackEngineRef.current;
    if (!engine) return;
    activeNotesRef.current.get(noteKey)?.stopNote(noteKey);
    activeNotesRef.current.set(noteKey, engine);
    engine.startNote(noteKey);
  }, []);

  const stopNote = useCallback((noteKey: string) => {
    activeNotesRef.current.get(noteKey)?.stopNote(noteKey);
    activeNotesRef.current.delete(noteKey);
  }, []);

  const playNote = useCallback(async (noteKey: string, duration: number = 0.3) => {
    const engine = isLoadedRef.current ? engineRef.current : fallbackEngineRef.current;
    engine?.playNote(noteKey, duration);
  }, []);

  return {
    isLoaded,
    ensureAudioReady,
    preload,
    startNote,
    stopNote,
    playNote,
  };
}
