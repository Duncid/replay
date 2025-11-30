import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { PianoKey } from "./PianoKey";

interface Note {
  note: string;
  octave: number;
  frequency: number;
  isBlack: boolean;
}

export interface NoteWithDuration {
  note: string;
  duration: number; // in beats: 0.25 = quarter, 0.5 = half, 1.0 = full
}

interface PianoProps {
  onUserPlayStart: () => void;
  onUserPlay: (notes: NoteWithDuration[]) => void;
  activeKeys: Set<string>;
  isAiEnabled: boolean;
  allowInput: boolean;
}

export interface PianoHandle {
  playNote: (frequency: number, duration?: number) => void;
  hideProgress: () => void;
  ensureAudioReady: () => Promise<void>;
}

const Piano = forwardRef<PianoHandle, PianoProps>(
  ({ onUserPlayStart, onUserPlay, activeKeys, isAiEnabled, allowInput }, ref) => {
    const [userPressedKeys, setUserPressedKeys] = useState<Set<string>>(new Set());
    const [showProgress, setShowProgress] = useState(false);
    const [progress, setProgress] = useState(100);
    const audioContextRef = useRef<AudioContext | null>(null);
    const recordingRef = useRef<NoteWithDuration[]>([]);
    const notePressTimesRef = useRef<Map<string, number>>(new Map());
    const activeOscillatorsRef = useRef<Map<string, { oscillator: OscillatorNode; gainNode: GainNode }>>(new Map());
    const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const pressedKeysRef = useRef<Set<string>>(new Set());
    const hasNotifiedPlayStartRef = useRef(false);

    // AZERTY keyboard mapping - C4 centered on 'e'
    const keyboardMap: { [key: string]: string } = {
      // White keys (main row)
      a: "A3",
      z: "B3",
      e: "C4",
      r: "D4",
      t: "E4",
      y: "F4",
      u: "G4",
      i: "A4",
      o: "B4",
      p: "C5",
      q: "D5",
      s: "E5",
      d: "F5",
      f: "G5",
      g: "A5",
      h: "B5",
      j: "C6",

      // Black keys (number row) - positioned above the gaps between white keys
      "&": "A#3",
      "1": "A#3", // Between A3-B3 (above 'a'/'z' gap)
      "'": "C#4",
      "4": "C#4", // Between C4-D4 (above 'e'/'r' gap)
      "(": "D#4",
      "5": "D#4", // Between D4-E4 (above 'r'/'t' gap)
      è: "F#4",
      "7": "F#4", // Between F4-G4 (above 'y'/'u' gap)
      "!": "G#4",
      _: "G#4",
      "8": "G#4", // Between G4-A4 (above 'u'/'i' gap)
      ç: "A#4",
      "9": "A#4", // Between A4-B4 (above 'i'/'o' gap)
      à: "C#5",
      "0": "C#5", // Between C5-D5 (above 'p'/'q' gap)
      '"': "D#5",
      "2": "D#5", // Between D5-E5
      "°": "F#5",
      ")": "F#5", // Between F5-G5
    };

    // 37 keys: C3 to C6 (3 octaves + 1 key)
    const notes: Note[] = [];
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

    // Generate 37 keys starting from C3
    for (let i = 0; i < 37; i++) {
      const octave = Math.floor(i / 12) + 3;
      const noteIndex = i % 12;
      const noteName = noteNames[noteIndex];
      const isBlack = noteName.includes("#");

      // Calculate frequency: f = 440 * 2^((n-49)/12) where A4 = 440Hz
      const semitonesFromA4 = (octave - 4) * 12 + (noteIndex - 9);
      const frequency = 440 * Math.pow(2, semitonesFromA4 / 12);

      notes.push({
        note: noteName,
        octave,
        frequency,
        isBlack,
      });
    }

    useEffect(() => {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();

      // Keyboard event handlers
      const handleKeyDown = (e: KeyboardEvent) => {
        if (!allowInput) return;

        const key = e.key.toLowerCase();
        const noteKey = keyboardMap[key];

        if (noteKey && !pressedKeysRef.current.has(key)) {
          pressedKeysRef.current.add(key);

          // Find the note in our notes array
          const note = notes.find((n) => `${n.note}${n.octave}` === noteKey);
          if (note) {
            const fullNoteKey = `${note.note}${note.octave}`;
            handleKeyPress(fullNoteKey, note.frequency);
          }
        }
      };

      const handleKeyUp = (e: KeyboardEvent) => {
        if (!allowInput) return;

        const key = e.key.toLowerCase();
        const noteKey = keyboardMap[key];

        if (noteKey && pressedKeysRef.current.has(key)) {
          pressedKeysRef.current.delete(key);

          // Find the note in our notes array
          const note = notes.find((n) => `${n.note}${n.octave}` === noteKey);
          if (note) {
            const fullNoteKey = `${note.note}${note.octave}`;
            handleKeyRelease(fullNoteKey, note.frequency);
          }
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);

      return () => {
        if (audioContextRef.current) {
          audioContextRef.current.close();
        }
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("keyup", handleKeyUp);
      };
    }, [allowInput]);

    useImperativeHandle(ref, () => ({
      playNote,
      hideProgress: () => {
        setShowProgress(false);
        setProgress(100);
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
        }
      },
      ensureAudioReady: async () => {
        if (audioContextRef.current?.state === 'suspended') {
          await audioContextRef.current.resume();
        }
      },
    }));

    const playNote = async (frequency: number, duration: number = 0.3) => {
      if (!audioContextRef.current) return;

      const audioContext = audioContextRef.current;
      
      // Ensure context is running
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = frequency;
      oscillator.type = "sine";

      // ADSR envelope for more realistic piano sound
      const now = audioContext.currentTime;
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.3, now + 0.01); // Attack
      gainNode.gain.linearRampToValueAtTime(0.2, now + 0.05); // Decay
      gainNode.gain.setValueAtTime(0.2, now + duration - 0.1); // Sustain
      gainNode.gain.linearRampToValueAtTime(0, now + duration); // Release

      oscillator.start(now);
      oscillator.stop(now + duration);
    };

    const startNote = (noteKey: string, frequency: number) => {
      if (!audioContextRef.current || activeOscillatorsRef.current.has(noteKey)) return;

      const audioContext = audioContextRef.current;
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = frequency;
      oscillator.type = "sine";

      // Quick attack envelope
      const now = audioContext.currentTime;
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.3, now + 0.01); // Attack
      gainNode.gain.linearRampToValueAtTime(0.2, now + 0.05); // Decay to sustain

      oscillator.start(now);

      // Store the oscillator and gain node
      activeOscillatorsRef.current.set(noteKey, { oscillator, gainNode });
    };

    const stopNote = (noteKey: string) => {
      const nodes = activeOscillatorsRef.current.get(noteKey);
      if (!nodes || !audioContextRef.current) return;

      const { oscillator, gainNode } = nodes;
      const now = audioContextRef.current.currentTime;

      // Release envelope
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(0, now + 0.1);

      oscillator.stop(now + 0.1);
      activeOscillatorsRef.current.delete(noteKey);
    };

    const handleKeyPress = (noteKey: string, frequency: number) => {
      if (!allowInput) return;

      // Notify parent that user started playing (only once per recording session)
      if (!hasNotifiedPlayStartRef.current) {
        onUserPlayStart();
        hasNotifiedPlayStartRef.current = true;
      }

      // Start playing the note immediately
      startNote(noteKey, frequency);

      // Record press time
      notePressTimesRef.current.set(noteKey, Date.now());

      const newKeys = new Set(userPressedKeys);
      newKeys.add(noteKey);
      setUserPressedKeys(newKeys);

      // Clear existing timeouts and intervals
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }

      // Hide progress bar
      setShowProgress(false);
      setProgress(100);

      // After 1 second of silence, trigger AI with progress bar
      recordingTimeoutRef.current = setTimeout(() => {
        if (recordingRef.current.length > 0 && isAiEnabled) {
          setShowProgress(true);
          setProgress(100);

          // Trigger AI
          onUserPlay([...recordingRef.current]);
          recordingRef.current = [];
          hasNotifiedPlayStartRef.current = false;

          // Start countdown animation - fills as we wait for AI
          const startTime = Date.now();
          const duration = 1000; // 1 second countdown

          progressIntervalRef.current = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const newProgress = Math.max(0, 100 - (elapsed / duration) * 100);
            setProgress(newProgress);

            if (newProgress === 0) {
              if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
              }
            }
          }, 16); // ~60fps
        } else if (recordingRef.current.length > 0) {
          // Save recording even if AI is disabled
          onUserPlay([...recordingRef.current]);
          recordingRef.current = [];
          hasNotifiedPlayStartRef.current = false;
        }
      }, 1000);
    };

    const handleKeyRelease = (noteKey: string, frequency: number) => {
      if (!allowInput) return;

      // Stop the note
      stopNote(noteKey);

      const pressTime = notePressTimesRef.current.get(noteKey);
      if (!pressTime) return;

      const duration = Date.now() - pressTime;
      // Convert milliseconds to beats (quarter note = 500ms base)
      const durationInBeats = duration / 500;
      
      // Round to musical note durations without capping
      let roundedDuration: number;
      if (durationInBeats >= 3.0) {
        roundedDuration = 4.0;      // Whole note (1500ms+)
      } else if (durationInBeats >= 1.5) {
        roundedDuration = 2.0;      // Half note (750ms+)
      } else if (durationInBeats >= 0.75) {
        roundedDuration = 1.0;      // Quarter note (375ms+)
      } else if (durationInBeats >= 0.375) {
        roundedDuration = 0.5;      // Eighth note (187.5ms+)
      } else {
        roundedDuration = 0.25;     // Sixteenth note
      }

      recordingRef.current.push({ note: noteKey, duration: roundedDuration });
      notePressTimesRef.current.delete(noteKey);

      const newKeys = new Set(userPressedKeys);
      newKeys.delete(noteKey);
      setUserPressedKeys(newKeys);
    };

    // Separate white and black keys
    const whiteKeys = notes.filter((n) => !n.isBlack);
    const blackKeys = notes.filter((n) => n.isBlack);

    // Calculate grid column for each black key (positioned between white keys)
    const getBlackKeyColumn = (blackNote: Note) => {
      const noteIndex = notes.findIndex((n) => `${n.note}${n.octave}` === `${blackNote.note}${blackNote.octave}`);
      const whiteKeysBefore = notes.slice(0, noteIndex).filter((n) => !n.isBlack).length;
      return whiteKeysBefore; // Position between this white key and the next
    };

    return (
      <div className="relative w-full select-none">
        {/* Piano container */}
        <div className="relative h-[25vw] min-h-64 max-h-[350px] bg-card shadow-2xl">
          {/* White keys grid - 22 full columns */}
          <div className="absolute inset-0 grid grid-cols-22 gap-px">
            {whiteKeys.map((note, index) => {
              const noteKey = `${note.note}${note.octave}`;
              const isActive = activeKeys.has(noteKey) || userPressedKeys.has(noteKey);
              const isAiActive = activeKeys.has(noteKey) && !allowInput;

              return (
                <PianoKey
                  key={noteKey}
                  note={noteKey}
                  frequency={note.frequency}
                  isBlack={false}
                  isActive={isActive}
                  isAiActive={isAiActive}
                  onPress={() => handleKeyPress(noteKey, note.frequency)}
                  onRelease={() => handleKeyRelease(noteKey, note.frequency)}
                  disabled={!allowInput}
                />
              );
            })}
          </div>

          {/* Black keys layer - 44 half-columns (0.5fr each) for positioning */}
          <div className="absolute inset-0 grid grid-cols-44 gap-2 pointer-events-none">
            {blackKeys.map((note) => {
              const noteKey = `${note.note}${note.octave}`;
              const isActive = activeKeys.has(noteKey) || userPressedKeys.has(noteKey);
              const isAiActive = activeKeys.has(noteKey) && !allowInput;
              const column = getBlackKeyColumn(note);

              return (
                <PianoKey
                  key={noteKey}
                  note={noteKey}
                  frequency={note.frequency}
                  isBlack={true}
                  isActive={isActive}
                  isAiActive={isAiActive}
                  onPress={() => handleKeyPress(noteKey, note.frequency)}
                  onRelease={() => handleKeyRelease(noteKey, note.frequency)}
                  disabled={!allowInput}
                  gridColumn={column}
                />
              );
            })}
          </div>
        </div>

        {!allowInput && (
          <div className="absolute top-4 right-4 px-4 py-2 bg-secondary/80 backdrop-blur rounded-full text-sm font-medium animate-pulse">
            AI Playing...
          </div>
        )}

        {showProgress && allowInput && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
            <div className="bg-card border border-border shadow-lg rounded-lg p-4 min-w-[300px]">
              <div className="text-sm font-medium text-center text-foreground mb-3">AI preparing response...</div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-key-active-user to-accent transition-all duration-[16ms] ease-linear"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  },
);

Piano.displayName = "Piano";

export default Piano;
