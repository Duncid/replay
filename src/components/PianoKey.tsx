import { getBaseNoteLetter } from "@/constants/noteColors";
import { cn } from "@/lib/utils";

interface PianoKeyProps {
  note: string;
  displayLabel?: string;
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
  displayLabel,
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
    console.log(
      `PianoKey ${note}: isActive=${isActive}, isSustained=${isSustained}`,
    );
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
      return "0ms";
    } else if (isActive && isSustained) {
      // Transitioning to sustained - slow fade
      return "400ms";
    } else {
      // Release - fast transition
      return "50ms";
    }
  };

  const noteLetter = hasColor ? getBaseNoteLetter(note) : null;
  const noteColorClasses = noteLetter
    ? {
        C: {
          active: "bg-red-500 shadow-lg shadow-red-500/50",
          sustained: "bg-red-400 shadow-lg shadow-red-400/50",
          label: "bg-red-500",
        },
        D: {
          active: "bg-orange-500 shadow-lg shadow-orange-500/50",
          sustained: "bg-orange-400 shadow-lg shadow-orange-400/50",
          label: "bg-orange-500",
        },
        E: {
          active: "bg-yellow-500 shadow-lg shadow-yellow-500/50",
          sustained: "bg-yellow-400 shadow-lg shadow-yellow-400/50",
          label: "bg-yellow-500",
        },
        F: {
          active: "bg-green-500 shadow-lg shadow-green-500/50",
          sustained: "bg-green-400 shadow-lg shadow-green-400/50",
          label: "bg-green-500",
        },
        G: {
          active: "bg-teal-500 shadow-lg shadow-teal-500/50",
          sustained: "bg-teal-400 shadow-lg shadow-teal-400/50",
          label: "bg-teal-500",
        },
        A: {
          active: "bg-blue-500 shadow-lg shadow-blue-500/50",
          sustained: "bg-blue-400 shadow-lg shadow-blue-400/50",
          label: "bg-blue-500",
        },
        B: {
          active: "bg-violet-500 shadow-lg shadow-violet-500/50",
          sustained: "bg-violet-400 shadow-lg shadow-violet-400/50",
          label: "bg-violet-500",
        },
      }[noteLetter]
    : undefined;

  // Determine colors based on state
  const getKeyColor = () => {
    if (!isActive) {
      // Released state
      return isBlack
        ? "bg-key-black hover:bg-key-black-light"
        : "bg-key-white hover:bg-key-white-shadow";
    }

    if (noteColorClasses) {
      return isSustained ? noteColorClasses.sustained : noteColorClasses.active;
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
          ? "h-[66.6667%] rounded-b-md shadow-lg z-20 pointer-events-auto col-span-2"
          : "h-full rounded-b-lg shadow-md",
        getKeyColor(),
        (!isPlayable || disabled) && "cursor-not-allowed",
        !isPlayable &&
          (isBlack ? "bg-key-black-disabled" : "bg-key-white-disabled"),
      )}
      style={{
        transition: `background-color ${getTransitionDuration()} ease-out, box-shadow ${getTransitionDuration()} ease-out`,
        WebkitTapHighlightColor: "transparent",
        ...(isBlack && gridColumn !== undefined
          ? {
              gridColumnStart: gridColumn * 2,
            }
          : {}),
      }}
    >
      <span
        className={cn(
          "absolute bottom-4 left-1/2 -translate-x-1/2 text-xs font-medium pointer-events-none select-none",
          hasColor ? "px-2 py-0.5 rounded-full text-white" : "opacity-80",
          hasColor && (isActive ? "opacity-0" : "opacity-100"),
          !hasColor && (isBlack ? "text-foreground" : "text-muted-foreground"),
          hasColor && noteColorClasses?.label,
        )}
      >
        {displayLabel ?? note}
      </span>
    </button>
  );
};
