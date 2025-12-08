import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { PianoKey } from "./PianoKey";
import { usePianoAudio } from "@/hooks/usePianoAudio";

interface PianoNote {
  note: string;
  octave: number;
  frequency: number;
  isBlack: boolean;
}

interface PianoProps {
  activeKeys: Set<string>;
  allowInput: boolean;
  onNoteStart?: (noteKey: string, frequency: number, velocity: number) => void;
  onNoteEnd?: (noteKey: string, frequency: number) => void;
}

export interface PianoHandle {
  playNote: (frequency: number, duration?: number) => void;
  ensureAudioReady: () => Promise<void>;
  handleKeyPress: (noteKey: string, frequency: number, velocity?: number) => void;
  handleKeyRelease: (noteKey: string, frequency: number) => void;
}

const Piano = forwardRef<PianoHandle, PianoProps>(
  ({ activeKeys, allowInput, onNoteStart, onNoteEnd }, ref) => {
    const [userPressedKeys, setUserPressedKeys] = useState<Set<string>>(new Set());
    const pressedKeysRef = useRef<Set<string>>(new Set());
    const audio = usePianoAudio();

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
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("keyup", handleKeyUp);
      };
    }, [allowInput]);

    const handleKeyPress = (noteKey: string, frequency: number, velocity: number = 0.8) => {
      if (!allowInput) return;

      audio.startNote(noteKey, frequency);
      setUserPressedKeys(prev => new Set([...prev, noteKey]));
      
      onNoteStart?.(noteKey, frequency, velocity);
    };

    const handleKeyRelease = (noteKey: string, frequency: number) => {
      if (!allowInput) return;

      audio.stopNote(noteKey);
      setUserPressedKeys(prev => {
        const newSet = new Set(prev);
        newSet.delete(noteKey);
        return newSet;
      });
      
      onNoteEnd?.(noteKey, frequency);
    };

    useImperativeHandle(ref, () => ({
      playNote: audio.playNote,
      ensureAudioReady: audio.ensureAudioReady,
      handleKeyPress,
      handleKeyRelease,
    }));

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
      </div>
    );
  },
);

Piano.displayName = "Piano";

export default Piano;
