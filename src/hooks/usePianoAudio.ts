import { useRef, useEffect, useCallback } from "react";

interface ActiveOscillator {
  oscillator: OscillatorNode;
  gainNode: GainNode;
}

export function usePianoAudio() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeOscillatorsRef = useRef<Map<string, ActiveOscillator>>(new Map());

  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const ensureAudioReady = useCallback(async () => {
    if (audioContextRef.current?.state === "suspended") {
      await audioContextRef.current.resume();
    }
  }, []);

  const playNote = useCallback(async (frequency: number, duration: number = 0.3) => {
    if (!audioContextRef.current) return;
    
    const audioContext = audioContextRef.current;
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.frequency.value = frequency;
    oscillator.type = "sine";

    const now = audioContext.currentTime;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.3, now + 0.01);
    gainNode.gain.linearRampToValueAtTime(0.2, now + 0.05);
    gainNode.gain.setValueAtTime(0.2, now + duration - 0.1);
    gainNode.gain.linearRampToValueAtTime(0, now + duration);

    oscillator.start(now);
    oscillator.stop(now + duration);
  }, []);

  const startNote = useCallback((noteKey: string, frequency: number) => {
    if (!audioContextRef.current || activeOscillatorsRef.current.has(noteKey)) return;

    const audioContext = audioContextRef.current;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.frequency.value = frequency;
    oscillator.type = "sine";

    const now = audioContext.currentTime;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.3, now + 0.01);
    gainNode.gain.linearRampToValueAtTime(0.2, now + 0.05);

    oscillator.start(now);
    activeOscillatorsRef.current.set(noteKey, { oscillator, gainNode });
  }, []);

  const stopNote = useCallback((noteKey: string) => {
    const nodes = activeOscillatorsRef.current.get(noteKey);
    if (!nodes || !audioContextRef.current) return;

    const { oscillator, gainNode } = nodes;
    const now = audioContextRef.current.currentTime;
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.linearRampToValueAtTime(0, now + 0.1);
    oscillator.stop(now + 0.1);
    activeOscillatorsRef.current.delete(noteKey);
  }, []);

  return {
    ensureAudioReady,
    playNote,
    startNote,
    stopNote,
  };
}
