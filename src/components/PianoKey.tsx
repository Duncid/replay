import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { NoteActivity } from "./pianoLayout";

interface PianoKeyProps {
  note: string;
  displayLabel?: string;
  isBlack: boolean;
  activity?: NoteActivity;
  isPlayable: boolean;
  onPress: () => void;
  onRelease: () => void;
  disabled?: boolean;
  style?: CSSProperties;
}

export const PianoKey = ({ note, displayLabel, isBlack, activity, isPlayable, onPress, onRelease, disabled, style }: PianoKeyProps) => (
  <button type="button" aria-label={displayLabel ?? note} title={displayLabel ?? note}
    data-note={note} data-activity={activity} data-playable={isPlayable}
    onMouseDown={onPress} onMouseUp={onRelease} onMouseLeave={onRelease}
    onTouchStart={event => { event.preventDefault(); onPress(); }}
    onTouchEnd={event => { event.preventDefault(); onRelease(); }}
    onTouchCancel={event => { event.preventDefault(); onRelease(); }}
    disabled={disabled}
    className={cn("piano-key relative select-none touch-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-[-3px]",
      isBlack ? "piano-key--black h-[56%] rounded-b-md pointer-events-auto" : "h-full rounded-b-lg",
      (!isPlayable || disabled) && "cursor-not-allowed")}
    style={{ ...style, WebkitTapHighlightColor: "transparent" }}
  />
);
