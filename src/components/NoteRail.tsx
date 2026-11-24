import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { pianoKeyStyle, type NoteActivity, type PianoLayout, type PianoNote } from "./pianoLayout";

export interface RailNoteState {
  label: string;
  playable: boolean;
  activity: NoteActivity;
  armed?: boolean;
  inRange?: boolean;
}
export interface NoteRailProps {
  layout: PianoLayout;
  states: Record<string, RailNoteState>;
  fullKeyboard?: boolean;
}

/** Shares its tracks, gaps and columns with Piano; never measures or schedules audio. */
export function NoteRail({ layout, states, fullKeyboard = false }: NoteRailProps) {
  const cell = (note: PianoNote) => {
    const key = `${note.note}${note.octave}`, state = states[key];
    const letter = note.note[0].toLowerCase();
    return <div key={key} className={cn("note-rail__cell", note.isBlack && "note-rail__cell--black")}
      data-armed={state.armed} data-in-range={state.inRange} data-note={key} data-activity={state.activity} data-playable={state.playable}
      title={state.label}
      style={{ "--nc": `hsl(var(--note-${letter}))`, "--sharp-label": `hsl(var(--note-${letter}-sharp-label))`,
        ...pianoKeyStyle(layout, note) } as CSSProperties}>
      <span data-length={state.label.replace(/\d+$/, "").length}>{state.label.replace(/\d+$/, "")}</span>
    </div>;
  };
  return <div className="note-rail" data-full={fullKeyboard} aria-hidden="true">
    {layout.whiteKeys.filter(note => note.note === "C" && note.whiteIndex > 0).map(note =>
      <span key={note.midi} className="note-rail__octave" style={{
        left: `calc(${pianoKeyStyle(layout, note).left} - .5px)`,
      }}>{note.octave}</span>
    )}
    <div className="absolute inset-x-0 top-0 h-6">{layout.blackKeys.map(cell)}</div>
    <div className="absolute inset-x-0 bottom-[2px] h-6">{layout.whiteKeys.map(cell)}</div>
  </div>;
}
