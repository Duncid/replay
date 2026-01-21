import { cn } from "@/lib/utils";
import { getNoteColorForNoteName } from "@/constants/noteColors";

interface PianoKeyProps {
  note: string;
  frequency: number;
  isBlack: boolean;
  isActive: boolean;
  isSustained: boolean;
  isPlayable: boolean;
  hasColor?: boolean;
  onPress: () => void;
  onRelease: () => void;
  disabled?: boolean;
  gridColumn?: number;
}

export const PianoKey = ({
  note,
  isBlack,
  isActive,
  isSustained,
  isPlayable,
  hasColor = false,
  onPress,
  onRelease,
  disabled,
  gridColumn,
}: PianoKeyProps) => {
  // Debug logging
  if (isActive) {
    console.log(`PianoKey ${note}: isActive=${isActive}, isSustained=${isSustained}`);
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault(); // Prevent ghost clicks and scrolling
    onPress();
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    onRelease();
  };

  // Determine transition duration based on state
  const getTransitionDuration = () => {
    if (isActive && !isSustained) {
      // Fresh press - instant transition
      return '0ms';
    } else if (isActive && isSustained) {
      // Transitioning to sustained - slow fade
      return '400ms';
    } else {
      // Release - fast transition
      return '50ms';
    }
  };

  const noteColor = hasColor ? getNoteColorForNoteName(note) : undefined;

  const getActiveColorStyle = () => {
    if (!isActive || !noteColor) return undefined;
    const baseColor = isBlack ? "hsl(var(--key-black))" : "hsl(var(--key-white))";
    const hotColor = noteColor;
    const coldColor = `color-mix(in srgb, ${hotColor} 50%, ${baseColor} 50%)`;
    return {
      backgroundColor: isSustained ? coldColor : hotColor,
      boxShadow: `0 0 20px ${hotColor}80`,
    };
  };

  // Determine colors based on state
  const getKeyColor = () => {
    if (!isActive) {
      // Released state
      return isBlack
        ? "bg-key-black hover:bg-key-black-light"
        : "bg-key-white hover:bg-key-white-shadow";
    }

    if (noteColor) {
      return "shadow-lg";
    }

    if (isSustained) {
      // Sustained state - BLUE for testing
      return isBlack
        ? "bg-blue-500 shadow-lg shadow-blue-500/50"
        : "bg-blue-500 shadow-lg shadow-blue-500/50";
    } else {
      // Fresh press - RED for testing
      return isBlack
        ? "bg-red-500 shadow-lg shadow-red-500/50"
        : "bg-red-500 shadow-lg shadow-red-500/50";
    }
  };

  const activeColorStyle = getActiveColorStyle();

  return (
    <button
      onMouseDown={onPress}
      onMouseUp={onRelease}
      onMouseLeave={onRelease}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      disabled={disabled}
      className={cn(
        "relative ease-out select-none touch-none",
        isBlack
          ? "h-[60%] rounded-b-md shadow-lg z-20 pointer-events-auto col-span-2"
          : "h-full rounded-b-lg shadow-md",
        getKeyColor(),
        (!isPlayable || disabled) && "cursor-not-allowed",
        !isPlayable && (isBlack ? "bg-key-black-disabled" : "bg-key-white-disabled"),
      )}
      style={{
        transition: `background-color ${getTransitionDuration()} ease-out, box-shadow ${getTransitionDuration()} ease-out`,
        WebkitTapHighlightColor: "transparent",
        ...(isBlack && gridColumn !== undefined
          ? {
              gridColumnStart: gridColumn * 2,
            }
          : {}),
        ...(activeColorStyle ?? {}),
      }}
    >
      <span
        className={cn(
          "absolute bottom-2 left-1/2 -translate-x-1/2 text-xs font-medium pointer-events-none select-none",
          hasColor
            ? "px-2 py-0.5 rounded-full text-white"
            : "opacity-30",
          hasColor && (isActive ? "opacity-0" : "opacity-100"),
          !hasColor && (isBlack ? "text-foreground" : "text-muted-foreground"),
        )}
        style={hasColor ? { backgroundColor: getNoteColorForNoteName(note) } : undefined}
      >
        {note}
      </span>
    </button>
  );
};
