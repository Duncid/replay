import { usePianoAudio } from "@/hooks/usePianoAudio";
import {
  INSTRUMENT_NOTE_RANGES,
  PianoSoundType,
} from "@/hooks/usePianoSound";
import { cn } from "@/lib/utils";
import { noteNameToSolfege } from "@/utils/noteSequenceUtils";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { PianoKey } from "./PianoKey";
import { NoteRail, type RailNoteState } from "./NoteRail";
import { createPianoLayout, type PianoNote } from "./pianoLayout";

interface PianoProps {
  activeKeys: Set<string>;
  allowInput: boolean;
  soundType?: PianoSoundType;
  onNoteStart?: (noteKey: string, frequency: number, velocity: number) => void;
  onNoteEnd?: (noteKey: string, frequency: number) => void;
  language: string;
  notationPreference: "auto" | "abc" | "solfege";
  className?: string;
  /** When true, render 88 keys (A0–C8) with horizontal scroll on narrow viewports */
  fullKeyboard?: boolean;
}

export interface PianoHandle {
  playNote: (frequency: number, duration?: number) => void;
  ensureAudioReady: () => Promise<void>;
  preload: () => Promise<void>;
  handleKeyPress: (
    noteKey: string,
    frequency: number,
    velocity?: number,
    options?: { muteAudio?: boolean; localOnly?: boolean },
  ) => void;
  handleKeyRelease: (
    noteKey: string,
    frequency: number,
    options?: { muteAudio?: boolean; localOnly?: boolean },
  ) => void;
}

const Piano = forwardRef<PianoHandle, PianoProps>(
  (
    {
      activeKeys,
      allowInput,
      soundType = "acoustic-piano",
      onNoteStart,
      onNoteEnd,
      language,
      notationPreference,
      className,
      fullKeyboard = false,
    },
    ref,
  ) => {
    const [userPressedKeys, setUserPressedKeys] = useState<Set<string>>(
      new Set(),
    );
    const pressedKeysRef = useRef<Set<string>>(new Set());
    const hasUserInteractedRef = useRef(false);
    const audio = usePianoAudio(soundType);
    const audioRef = useRef(audio);
    audioRef.current = audio;
    const heldNotesRef = useRef(new Map<string, number>());
    const noteEndRef = useRef(onNoteEnd);
    noteEndRef.current = onNoteEnd;
    const releaseHeldNotes = useCallback(() => {
      for (const [key, frequency] of heldNotesRef.current) {
        audioRef.current.stopNote(key);
        noteEndRef.current?.(key, frequency);
      }
      heldNotesRef.current.clear();
    }, []);
    useEffect(() => releaseHeldNotes, [releaseHeldNotes]);

    const runFirstInteraction = useCallback(() => {
      if (hasUserInteractedRef.current) return;
      hasUserInteractedRef.current = true;
      void audioRef.current.preload();
    }, []);

    // Piano owns preloading: on first user interaction, resume context and load current instrument
    useEffect(() => {
      const handleFirstInteraction = () => {
        runFirstInteraction();
        document.removeEventListener("pointerdown", handleFirstInteraction);
        document.removeEventListener("touchstart", handleFirstInteraction);
        document.removeEventListener("keydown", handleFirstInteraction);
      };
      document.addEventListener("pointerdown", handleFirstInteraction, {
        once: true,
      });
      document.addEventListener("touchstart", handleFirstInteraction, {
        once: true,
      });
      document.addEventListener("keydown", handleFirstInteraction, {
        once: true,
      });
      return () => {
        document.removeEventListener("pointerdown", handleFirstInteraction);
        document.removeEventListener("touchstart", handleFirstInteraction);
        document.removeEventListener("keydown", handleFirstInteraction);
      };
    }, [runFirstInteraction]);

    // When sound type changes, preload the new instrument if user has already interacted
    useEffect(() => {
      if (hasUserInteractedRef.current && soundType) {
        void audioRef.current.preload();
      }
    }, [soundType]);

    const noteToMidi = useCallback((noteKey: string) => {
      const noteNames = [
        "C",
        "C#",
        "D",
        "D#",
        "E",
        "F",
        "F#",
        "G",
        "G#",
        "A",
        "A#",
        "B",
      ];
      const match = noteKey.match(/^([A-G]#?)(\d+)$/);
      if (!match) return 0;
      const [, note, octaveStr] = match;
      const octave = parseInt(octaveStr, 10);
      const noteIndex = noteNames.indexOf(note);
      return octave * 12 + noteIndex;
    }, []);

    const isNotePlayable = useCallback(
      (noteKey: string) => {
        const range = INSTRUMENT_NOTE_RANGES[soundType];
        if (!range) return true;
        const midi = noteToMidi(noteKey);
        return midi >= noteToMidi(range.min) && midi <= noteToMidi(range.max);
      },
      [noteToMidi, soundType],
    );

    // AZERTY keyboard mapping - C4 centered on 'e'
    const keyboardMap = useMemo<Record<string, string>>(() => ({
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
      "&": "A#3",
      "1": "A#3",
      "'": "C#4",
      "4": "C#4",
      "(": "D#4",
      "5": "D#4",
      è: "F#4",
      "7": "F#4",
      "!": "G#4",
      _: "G#4",
      "8": "G#4",
      ç: "A#4",
      "9": "A#4",
      à: "C#5",
      "0": "C#5",
      '"': "D#5",
      "2": "D#5",
      "°": "F#5",
      ")": "F#5",
    }), []);

    const layout = useMemo(() => createPianoLayout(fullKeyboard), [fullKeyboard]);
    const { notes, whiteKeys, blackKeys } = layout;

    const handleKeyPress = useCallback(
      (
        noteKey: string,
        frequency: number,
        velocity: number = 0.8,
        options?: { muteAudio?: boolean; localOnly?: boolean },
      ) => {
        if (!allowInput || !isNotePlayable(noteKey)) return;
        runFirstInteraction();

        heldNotesRef.current.set(noteKey, frequency);
        // Notify first so interrupting autoplay doesn't release the new note.
        onNoteStart?.(noteKey, frequency, velocity);
        if (!options?.muteAudio) {
          audio.startNote(noteKey, frequency, options);
        }
        setUserPressedKeys((prev) => new Set([...prev, noteKey]));
      },
      [allowInput, audio, isNotePlayable, onNoteStart, runFirstInteraction],
    );

    const handleKeyRelease = useCallback(
      (
        noteKey: string,
        frequency: number,
        options?: { muteAudio?: boolean; localOnly?: boolean },
      ) => {
        if (!options?.muteAudio) {
          audio.stopNote(noteKey);
        }
        heldNotesRef.current.delete(noteKey);
        setUserPressedKeys((prev) => {
          const newSet = new Set(prev);
          newSet.delete(noteKey);
          return newSet;
        });

        onNoteEnd?.(noteKey, frequency);
      },
      [audio, onNoteEnd],
    );

    // Clear pressed keys when sound type or keyboard layout changes to avoid stuck notes
    useEffect(() => {
      releaseHeldNotes();
      pressedKeysRef.current.clear();
      setUserPressedKeys(new Set());
    }, [soundType, fullKeyboard, allowInput, releaseHeldNotes]);

    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (!allowInput) return;
        const target = e.target as HTMLElement;
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable
        )
          return;

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
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable
        )
          return;

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
    }, [allowInput, handleKeyPress, handleKeyRelease, notes, keyboardMap]);

    useImperativeHandle(ref, () => ({
      playNote: audio.playNote,
      ensureAudioReady: audio.ensureAudioReady,
      preload: audio.preload,
      handleKeyPress,
      handleKeyRelease,
    }));


    const resolvedNotation =
      notationPreference === "auto"
        ? language === "fr"
          ? "solfege"
          : "abc"
        : notationPreference;

    const getDisplayLabel = (note: PianoNote) => {
      const baseNote = note.note;
      const octave = note.octave;
      if (resolvedNotation === "solfege") {
        return `${noteNameToSolfege(baseNote)}${octave}`;
      }
      return `${baseNote}${octave}`;
    };

    const states: Record<string, RailNoteState> = Object.fromEntries(notes.map(note => {
      const key = `${note.note}${note.octave}`, playable = isNotePlayable(key);
      return [key, { label: getDisplayLabel(note), playable,
        activity: !playable ? undefined : userPressedKeys.has(key) ? "user" : activeKeys.has(key) ? "ai" : undefined }];
    }));
    const renderKey = (note: PianoNote) => {
      const key = `${note.note}${note.octave}`, state = states[key];
      return <PianoKey key={key} note={key} displayLabel={state.label}
        isBlack={note.isBlack} activity={state.activity} isPlayable={state.playable}
        onPress={() => handleKeyPress(key, note.frequency)} onRelease={() => handleKeyRelease(key, note.frequency)}
        disabled={!allowInput || !state.playable} gridColumn={note.gridColumn} />;
    };

    return <div className={cn("relative w-full h-full select-none flex flex-col px-1 mb-1 overflow-hidden bg-background", className)}>
      <div className={cn("relative h-full rounded-t-lg border-t", fullKeyboard ? "overflow-x-auto overflow-y-hidden" : "overflow-hidden")}>
        <div className={cn("relative h-full flex flex-col", fullKeyboard && "min-w-[1040px]")}>
          <NoteRail layout={layout} states={states} fullKeyboard={fullKeyboard} />
          <div className="relative flex-1 min-h-0">
            <div className={cn("absolute inset-0 grid gap-px z-0", layout.whiteGrid)}>{whiteKeys.map(renderKey)}</div>
            <div className={cn("absolute inset-0 grid gap-2 pointer-events-none z-10", layout.blackGrid)}>{blackKeys.map(renderKey)}</div>
          </div>
        </div>
      </div>
    </div>;
  },
);

Piano.displayName = "Piano";

export default Piano;
