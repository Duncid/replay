import { cn } from "@/lib/utils";

interface PianoKeyProps {
  note: string;
  frequency: number;
  isBlack: boolean;
  isActive: boolean;
  isAiActive: boolean;
  onPress: () => void;
  onRelease: () => void;
  disabled?: boolean;
  gridColumn?: number;
}

export const PianoKey = ({
  note,
  isBlack,
  isActive,
  isAiActive,
  onPress,
  onRelease,
  disabled,
  gridColumn,
}: PianoKeyProps) => {
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault(); // Prevent ghost clicks and scrolling
    onPress();
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    onRelease();
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
        "relative transition-all duration-150 ease-out select-none touch-none",
        isBlack
          ? "h-[60%] rounded-b-md shadow-lg z-20 pointer-events-auto col-span-2"
          : "h-full rounded-b-lg shadow-md",
        isBlack
          ? isActive
            ? isAiActive
              ? "bg-key-active-ai shadow-[var(--glow-ai)]"
              : "bg-key-active-user shadow-[var(--glow-user)]"
            : "bg-key-black hover:bg-key-black-light"
          : isActive
            ? isAiActive
              ? "bg-key-active-ai/20"
              : "bg-key-active-user/20"
            : "bg-key-white hover:bg-key-white-shadow",
        disabled && "cursor-not-allowed",
      )}
      style={{
        transition: "var(--transition-smooth)",
        WebkitTapHighlightColor: "transparent",
        ...(isBlack && gridColumn !== undefined
          ? {
              gridColumnStart: gridColumn * 2 + 2, // Convert to half-column grid position
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
