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
}

export const PianoKey = ({ note, isBlack, isActive, isAiActive, onPress, onRelease, disabled }: PianoKeyProps) => {
  return (
    <button
      onMouseDown={onPress}
      onMouseUp={onRelease}
      onMouseLeave={onRelease}
      onTouchStart={onPress}
      onTouchEnd={onRelease}
      disabled={disabled}
      className={cn(
        "relative transition-all duration-150 ease-out",
        isBlack
          ? "w-12 h-40 -mx-4 z-10 rounded-b-md shadow-lg"
          : "w-16 h-full rounded-b-lg border-2 border-border shadow-md",
        isBlack
          ? isActive
            ? isAiActive
              ? "bg-key-active-ai shadow-[var(--glow-ai)]"
              : "bg-key-active-user shadow-[var(--glow-user)]"
            : "bg-key-black hover:bg-key-black/80"
          : isActive
            ? isAiActive
              ? "bg-key-active-ai/20"
              : "bg-key-active-user/20"
            : "bg-key-white hover:bg-key-white-shadow",
        disabled && "cursor-not-allowed",
      )}
      style={{
        transition: "var(--transition-smooth)",
      }}
    >
      <span
        className={cn(
          "absolute bottom-2 left-1/2 -translate-x-1/2 text-xs font-medium opacity-30",
          isBlack ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {note}
      </span>
    </button>
  );
};
