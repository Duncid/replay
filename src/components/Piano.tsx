import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { PianoKey } from "./PianoKey";
import { NoteSequence, Note, DEFAULT_QPM } from "@/types/noteSequence";
import { noteNameToMidi, midiToFrequency, createEmptyNoteSequence } from "@/utils/noteSequenceUtils";

interface PianoNote {
  note: string;
  octave: number;
  frequency: number;
  isBlack: boolean;
}

interface PianoProps {
  onUserPlayStart: () => void;
  onUserPlay: (sequence: NoteSequence) => void;
  activeKeys: Set<string>;
  isAiEnabled: boolean;
  isRecording?: boolean;
  allowInput: boolean;
  bpm?: number;
  timeSignature?: string;
}

export interface PianoHandle {
  playNote: (frequency: number, duration?: number) => void;
  hideProgress: () => void;
  ensureAudioReady: () => Promise<void>;
  handleKeyPress: (noteKey: string, frequency: number, velocity?: number) => void;
  handleKeyRelease: (noteKey: string, frequency: number) => void;
  restoreLastRecording: () => void;
}

const Piano = forwardRef<PianoHandle, PianoProps>(
  ({ onUserPlayStart, onUserPlay, activeKeys, isAiEnabled, isRecording = true, allowInput, bpm = 120, timeSignature = "4/4" }, ref) => {
    const [userPressedKeys, setUserPressedKeys] = useState<Set<string>>(new Set());
    const [showProgress, setShowProgress] = useState(false);
    const [progress, setProgress] = useState(100);
    const audioContextRef = useRef<AudioContext | null>(null);
    const recordingRef = useRef<NoteSequence>(createEmptyNoteSequence(bpm, timeSignature));
    const lastRecordingRef = useRef<{ sequence: NoteSequence; startTime: number } | null>(null);
    const notePressDataRef = useRef<Map<string, { startTime: number; velocity: number }>>(new Map());
    const activeOscillatorsRef = useRef<Map<string, { oscillator: OscillatorNode; gainNode: GainNode }>>(new Map());
    const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const pressedKeysRef = useRef<Set<string>>(new Set());
    const hasNotifiedPlayStartRef = useRef(false);
    const recordingStartTimeRef = useRef<number | null>(null);
    const heldKeysCountRef = useRef(0);

    // AZERTY keyboard mapping - C4 centered on 'e'
    const keyboardMap: { [key: string]: string } = {
      a: "A3", z: "B3", e: "C4", r: "D4", t: "E4", y: "F4", u: "G4",
      i: "A4", o: "B4", p: "C5", q: "D5", s: "E5", d: "F5", f: "G5",
      g: "A5", h: "B5", j: "C6",
      "&": "A#3", "1": "A#3", "'": "C#4", "4": "C#4", "(": "D#4", "5": "D#4",
      è: "F#4", "7": "F#4", "!": "G#4", _: "G#4", "8": "G#4",
      ç: "A#4", "9": "A#4", à: "C#5", "0": "C#5", '"': "D#5", "2": "D#5",
      "°": "F#5", ")": "F#5",
    };

    // 37 keys: C3 to C6
    const notes: PianoNote[] = [];
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

    for (let i = 0; i < 37; i++) {
      const octave = Math.floor(i / 12) + 3;
      const noteIndex = i % 12;
      const noteName = noteNames[noteIndex];
      const isBlack = noteName.includes("#");
      const semitonesFromA4 = (octave - 4) * 12 + (noteIndex - 9);
      const frequency = 440 * Math.pow(2, semitonesFromA4 / 12);

      notes.push({ note: noteName, octave, frequency, isBlack });
    }

    useEffect(() => {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();

      const handleKeyDown = (e: KeyboardEvent) => {
        if (!allowInput) return;
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

        const key = e.key.toLowerCase();
        const noteKey = keyboardMap[key];

        if (noteKey && !pressedKeysRef.current.has(key)) {
          pressedKeysRef.current.add(key);
          const note = notes.find((n) => `${n.note}${n.octave}` === noteKey);
          if (note) {
            handleKeyPress(`${note.note}${note.octave}`, note.frequency, 0.8);
          }
        }
      };

      const handleKeyUp = (e: KeyboardEvent) => {
        if (!allowInput) return;
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

        const key = e.key.toLowerCase();
        const noteKey = keyboardMap[key];

        if (noteKey && pressedKeysRef.current.has(key)) {
          pressedKeysRef.current.delete(key);
          const note = notes.find((n) => `${n.note}${n.octave}` === noteKey);
          if (note) {
            handleKeyRelease(`${note.note}${note.octave}`, note.frequency);
          }
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);

      return () => {
        if (audioContextRef.current) audioContextRef.current.close();
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("keyup", handleKeyUp);
      };
    }, [allowInput]);

    useImperativeHandle(ref, () => ({
      playNote,
      hideProgress: () => {
        setShowProgress(false);
        setProgress(100);
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      },
      ensureAudioReady: async () => {
        if (audioContextRef.current?.state === 'suspended') {
          await audioContextRef.current.resume();
        }
      },
      handleKeyPress,
      handleKeyRelease,
      restoreLastRecording: () => {
        if (lastRecordingRef.current) {
          recordingRef.current = { ...lastRecordingRef.current.sequence, notes: [...lastRecordingRef.current.sequence.notes] };
          recordingStartTimeRef.current = lastRecordingRef.current.startTime;
          hasNotifiedPlayStartRef.current = true;
          console.log("[Piano] Restored last recording with", recordingRef.current.notes.length, "notes");
        }
      },
    }));

    const playNote = async (frequency: number, duration: number = 0.3) => {
      if (!audioContextRef.current) return;
      const audioContext = audioContextRef.current;
      if (audioContext.state === 'suspended') await audioContext.resume();

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

      const now = audioContext.currentTime;
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.3, now + 0.01);
      gainNode.gain.linearRampToValueAtTime(0.2, now + 0.05);

      oscillator.start(now);
      activeOscillatorsRef.current.set(noteKey, { oscillator, gainNode });
    };

    const stopNote = (noteKey: string) => {
      const nodes = activeOscillatorsRef.current.get(noteKey);
      if (!nodes || !audioContextRef.current) return;

      const { oscillator, gainNode } = nodes;
      const now = audioContextRef.current.currentTime;
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(0, now + 0.1);
      oscillator.stop(now + 0.1);
      activeOscillatorsRef.current.delete(noteKey);
    };

    const handleKeyPress = (noteKey: string, frequency: number, velocity: number = 0.8) => {
      if (!allowInput) return;

      // Track held keys
      heldKeysCountRef.current++;

      if (!hasNotifiedPlayStartRef.current) {
        onUserPlayStart();
        hasNotifiedPlayStartRef.current = true;
        recordingStartTimeRef.current = Date.now();
        // Reset recording with current tempo
        recordingRef.current = createEmptyNoteSequence(bpm, timeSignature);
      }

      startNote(noteKey, frequency);

      // Record press data in seconds from recording start
      const now = Date.now();
      const startTimeSeconds = (now - recordingStartTimeRef.current!) / 1000;
      notePressDataRef.current.set(noteKey, { startTime: startTimeSeconds, velocity });

      setUserPressedKeys(prev => new Set([...prev, noteKey]));

      // Clear any pending recording timeout when new key is pressed
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      setShowProgress(false);
      setProgress(100);
    };

    const handleKeyRelease = (noteKey: string, frequency: number) => {
      if (!allowInput || recordingStartTimeRef.current === null) return;

      stopNote(noteKey);

      // Track held keys
      heldKeysCountRef.current = Math.max(0, heldKeysCountRef.current - 1);

      const pressData = notePressDataRef.current.get(noteKey);
      if (!pressData) return;

      const now = Date.now();
      const endTimeSeconds = (now - recordingStartTimeRef.current) / 1000;
      
      // Create note in NoteSequence format
      const pitch = noteNameToMidi(noteKey);
      const note: Note = {
        pitch,
        startTime: pressData.startTime,
        endTime: endTimeSeconds,
        velocity: pressData.velocity,
      };

      console.log(`[Recording] Note ${noteKey}: start=${pressData.startTime.toFixed(3)}s, end=${endTimeSeconds.toFixed(3)}s, duration=${(endTimeSeconds - pressData.startTime).toFixed(3)}s`);

      if (!isAiEnabled) {
        // Only record if recording is enabled (for Compose mode)
        if (isRecording) {
          // Send single note immediately, normalized to start at 0
          const singleNoteSequence = createEmptyNoteSequence(bpm, timeSignature);
          const normalizedNote = {
            ...note,
            startTime: 0,
            endTime: note.endTime - note.startTime,
          };
          singleNoteSequence.notes.push(normalizedNote);
          singleNoteSequence.totalTime = normalizedNote.endTime;
          onUserPlay(singleNoteSequence);
        }
        // If not recording, just play sound (already done via stopNote above)
      } else {
        // Accumulate notes
        recordingRef.current.notes.push(note);
        recordingRef.current.totalTime = Math.max(recordingRef.current.totalTime, endTimeSeconds);
      }

      notePressDataRef.current.delete(noteKey);
      setUserPressedKeys(prev => {
        const newSet = new Set(prev);
        newSet.delete(noteKey);
        return newSet;
      });

      // Only set recording timeout when all keys are released
      if (isAiEnabled && heldKeysCountRef.current === 0 && recordingRef.current.notes.length > 0) {
        recordingTimeoutRef.current = setTimeout(() => {
          if (recordingRef.current.notes.length > 0) {
            // Normalize recording so first note starts at 0
            const minTime = Math.min(...recordingRef.current.notes.map(n => n.startTime));
            const normalizedNotes = recordingRef.current.notes.map(n => ({
              ...n,
              startTime: n.startTime - minTime,
              endTime: n.endTime - minTime,
            }));
            const normalizedRecording: NoteSequence = {
              ...recordingRef.current,
              notes: normalizedNotes,
              totalTime: recordingRef.current.totalTime - minTime,
            };

            // Save recording before sending
            lastRecordingRef.current = {
              sequence: { ...normalizedRecording, notes: [...normalizedRecording.notes] },
              startTime: recordingStartTimeRef.current!,
            };

            console.log(`[Recording Complete] Total notes: ${normalizedRecording.notes.length}, totalTime: ${normalizedRecording.totalTime.toFixed(3)}s`);
            normalizedRecording.notes.forEach((n, i) => {
              console.log(`  Note ${i}: start=${n.startTime.toFixed(3)}s, end=${n.endTime.toFixed(3)}s, duration=${(n.endTime - n.startTime).toFixed(3)}s`);
            });

            setShowProgress(true);
            setProgress(100);

            onUserPlay(normalizedRecording);
            recordingRef.current = createEmptyNoteSequence(bpm, timeSignature);
            hasNotifiedPlayStartRef.current = false;
            recordingStartTimeRef.current = null;

            const startTime = Date.now();
            progressIntervalRef.current = setInterval(() => {
              const elapsed = Date.now() - startTime;
              const newProgress = Math.max(0, 100 - (elapsed / 1000) * 100);
              setProgress(newProgress);
              if (newProgress === 0 && progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
              }
            }, 16);
          }
        }, 1000);
      }
    };

    const whiteKeys = notes.filter((n) => !n.isBlack);
    const blackKeys = notes.filter((n) => n.isBlack);

    const getBlackKeyColumn = (blackNote: PianoNote) => {
      const noteIndex = notes.findIndex((n) => `${n.note}${n.octave}` === `${blackNote.note}${blackNote.octave}`);
      return notes.slice(0, noteIndex).filter((n) => !n.isBlack).length;
    };

    return (
      <div className="relative w-full select-none">
        <div className="relative h-[25vw] min-h-64 max-h-[350px] bg-card shadow-2xl">
          <div className="absolute inset-0 grid grid-cols-22 gap-px">
            {whiteKeys.map((note) => {
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
