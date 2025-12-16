import { useRef, useEffect, useCallback, useState } from "react";
import * as Tone from "tone";

export type MetronomeSoundType = "classic" | "woodblock" | "digital" | "hihat" | "clave";

interface SoundNodes {
  cleanup: () => void;
  triggerClick: (time: number, isAccent: boolean) => void;
}

function createClassicSound(): SoundNodes {
  const osc = new Tone.Oscillator({ frequency: 1000, type: "square" });
  const amp = new Tone.Gain(0).toDestination();
  osc.connect(amp).start();

  const accentOsc = new Tone.Oscillator({ frequency: 2000, type: "square" });
  const accentAmp = new Tone.Gain(0).toDestination();
  accentOsc.connect(accentAmp).start();

  return {
    cleanup: () => {
      osc.stop();
      osc.dispose();
      amp.dispose();
      accentOsc.stop();
      accentOsc.dispose();
      accentAmp.dispose();
    },
    triggerClick: (time: number, isAccent: boolean) => {
      if (isAccent) {
        accentAmp.gain.setValueAtTime(0.7, time);
        accentAmp.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);
      } else {
        amp.gain.setValueAtTime(0.4, time);
        amp.gain.exponentialRampToValueAtTime(0.0001, time + 0.02);
      }
    },
  };
}

function createWoodblockSound(): SoundNodes {
  const noise = new Tone.Noise("white");
  const bandpass = new Tone.Filter(1500, "bandpass");
  const amp = new Tone.Gain(0).toDestination();
  noise.connect(bandpass).connect(amp);
  noise.start();

  const accentNoise = new Tone.Noise("white");
  const accentBandpass = new Tone.Filter(1800, "bandpass");
  const accentAmp = new Tone.Gain(0).toDestination();
  accentNoise.connect(accentBandpass).connect(accentAmp);
  accentNoise.start();

  return {
    cleanup: () => {
      noise.stop();
      noise.dispose();
      bandpass.dispose();
      amp.dispose();
      accentNoise.stop();
      accentNoise.dispose();
      accentBandpass.dispose();
      accentAmp.dispose();
    },
    triggerClick: (time: number, isAccent: boolean) => {
      if (isAccent) {
        accentAmp.gain.setValueAtTime(0.8, time);
        accentAmp.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
      } else {
        amp.gain.setValueAtTime(0.6, time);
        amp.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
      }
    },
  };
}

function createDigitalSound(): SoundNodes {
  const osc = new Tone.Oscillator({ frequency: 4000, type: "triangle" });
  const amp = new Tone.Gain(0).toDestination();
  osc.connect(amp).start();

  const accentOsc = new Tone.Oscillator({ frequency: 5000, type: "triangle" });
  const accentAmp = new Tone.Gain(0).toDestination();
  accentOsc.connect(accentAmp).start();

  return {
    cleanup: () => {
      osc.stop();
      osc.dispose();
      amp.dispose();
      accentOsc.stop();
      accentOsc.dispose();
      accentAmp.dispose();
    },
    triggerClick: (time: number, isAccent: boolean) => {
      if (isAccent) {
        accentAmp.gain.setValueAtTime(0.35, time);
        accentAmp.gain.exponentialRampToValueAtTime(0.0001, time + 0.015);
      } else {
        amp.gain.setValueAtTime(0.25, time);
        amp.gain.exponentialRampToValueAtTime(0.0001, time + 0.01);
      }
    },
  };
}

function createHihatSound(): SoundNodes {
  const noise = new Tone.Noise("white");
  const hp = new Tone.Filter(8000, "highpass");
  const amp = new Tone.Gain(0).toDestination();
  noise.connect(hp).connect(amp);
  noise.start();

  const accentNoise = new Tone.Noise("white");
  const accentHp = new Tone.Filter(7000, "highpass");
  const accentAmp = new Tone.Gain(0).toDestination();
  accentNoise.connect(accentHp).connect(accentAmp);
  accentNoise.start();

  return {
    cleanup: () => {
      noise.stop();
      noise.dispose();
      hp.dispose();
      amp.dispose();
      accentNoise.stop();
      accentNoise.dispose();
      accentHp.dispose();
      accentAmp.dispose();
    },
    triggerClick: (time: number, isAccent: boolean) => {
      if (isAccent) {
        accentAmp.gain.setValueAtTime(0.45, time);
        accentAmp.gain.exponentialRampToValueAtTime(0.0001, time + 0.025);
      } else {
        amp.gain.setValueAtTime(0.3, time);
        amp.gain.exponentialRampToValueAtTime(0.0001, time + 0.015);
      }
    },
  };
}

function createClaveSound(): SoundNodes {
  const synth = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.15, release: 0.02 },
    harmonicity: 5.1,
    resonance: 6000,
  }).toDestination();

  const accentSynth = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.18, release: 0.03 },
    harmonicity: 5.4,
    resonance: 6500,
  }).toDestination();

  return {
    cleanup: () => {
      synth.dispose();
      accentSynth.dispose();
    },
    triggerClick: (time: number, isAccent: boolean) => {
      if (isAccent) {
        accentSynth.triggerAttackRelease("16n", time, 0.8);
      } else {
        synth.triggerAttackRelease("16n", time, 0.6);
      }
    },
  };
}

export function useToneMetronome(initialSoundType: MetronomeSoundType = "classic") {
  const [soundType, setSoundType] = useState<MetronomeSoundType>(initialSoundType);
  const soundNodesRef = useRef<SoundNodes | null>(null);
  const isInitializedRef = useRef(false);

  const createSoundForType = useCallback((type: MetronomeSoundType): SoundNodes => {
    switch (type) {
      case "woodblock":
        return createWoodblockSound();
      case "digital":
        return createDigitalSound();
      case "hihat":
        return createHihatSound();
      case "clave":
        return createClaveSound();
      case "classic":
      default:
        return createClassicSound();
    }
  }, []);

  useEffect(() => {
    if (isInitializedRef.current && soundNodesRef.current) {
      soundNodesRef.current.cleanup();
    }
    
    soundNodesRef.current = createSoundForType(soundType);
    isInitializedRef.current = true;

    return () => {
      if (soundNodesRef.current) {
        soundNodesRef.current.cleanup();
        soundNodesRef.current = null;
      }
    };
  }, [soundType, createSoundForType]);

  const ensureAudioReady = useCallback(async () => {
    await Tone.start();
  }, []);

  const playClick = useCallback((isAccent: boolean, time?: number) => {
    if (!soundNodesRef.current) return;
    const audioTime = time ?? Tone.now();
    soundNodesRef.current.triggerClick(audioTime, isAccent);
  }, []);

  return {
    soundType,
    setSoundType,
    playClick,
    ensureAudioReady,
  };
}
