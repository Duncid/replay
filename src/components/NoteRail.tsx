import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { NoteActivity, PianoLayout, PianoNote } from "./pianoLayout";

export interface RailNoteState {
  label: string;
  playable: boolean;
  activity: NoteActivity;
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
      data-note={key} data-activity={state.activity} data-playable={state.playable}
      title={state.label}
      style={{ "--nc": `hsl(var(--note-${letter}))`, "--sharp-label": `hsl(var(--note-${letter}-sharp-label))`,
        gridColumnStart: note.gridColumn } as CSSProperties}>
      <span data-length={state.label.replace(/\d+$/, "").length}>{fullKeyboard ? state.label.replace(/\d+$/, "") : state.label}</span>
    </div>;
  };
  return <div className="note-rail" data-full={fullKeyboard} aria-hidden="true">
    <div className={cn("absolute inset-x-0 top-0 grid gap-2", layout.blackGrid)}>{layout.blackKeys.map(cell)}</div>
    <div className={cn("absolute inset-x-0 bottom-0 grid gap-px", layout.whiteGrid)}>{layout.whiteKeys.map(cell)}</div>
  </div>;
}
