import { cn } from "@/lib/utils";

interface PianoKeyProps {
  note: string;
  frequency: number;
  isBlack: boolean;
  isActive: boolean;
  isSustained: boolean;
  isPlayable: boolean;
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

  // Determine colors based on state
  const getKeyColor = () => {
    if (!isActive) {
      // Released state
      return isBlack
        ? "bg-key-black hover:bg-key-black-light"
        : "bg-key-white hover:bg-key-white-shadow";
    }

    if (isSustained) {
      // Sustained state - BLUE for testing
      return isBlack
        ? "bg-blue-500 shadow-lg shadow-blue-500/50"
        : "bg-blue-500/30";
    } else {
      // Fresh press - RED for testing
      return isBlack
        ? "bg-red-500 shadow-lg shadow-red-500/50"
        : "bg-red-500/30";
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
      }}
    >
      <span
        className={cn(
          "absolute bottom-2 left-1/2 -translate-x-1/2 text-xs font-medium opacity-30 pointer-events-none select-none",
          isBlack ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {note}
      </span>
    </button>
  );
};
