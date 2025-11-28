import { cn } from "@/lib/utils";

interface PianoKeyProps {
  note: string;
  frequency: number;
  isBlack: boolean;
  isActive: boolean;
  isAiActive: boolean;
  onPress: () => void;
  disabled?: boolean;
}

export const PianoKey = ({
  note,
  isBlack,
  isActive,
  isAiActive,
  onPress,
  disabled,
}: PianoKeyProps) => {
  return (
    <button
      onClick={onPress}
      disabled={disabled}
      className={cn(
        "relative transition-all duration-150 ease-out",
        isBlack
          ? "w-12 h-40 -mx-6 z-10 rounded-b-md shadow-lg"
          : "w-16 h-full rounded-b-lg border-2 border-border shadow-md",
        isBlack
          ? isActive
            ? isAiActive
              ? "bg-key-active-ai shadow-[var(--glow-ai)]"
              : "bg-key-active-user shadow-[var(--glow-user)]"
            : "bg-key-black hover:bg-key-black/80"
          : isActive
          ? isAiActive
            ? "bg-key-active-ai/20 border-key-active-ai shadow-[var(--glow-ai)]"
            : "bg-key-active-user/20 border-key-active-user shadow-[var(--glow-user)]"
          : "bg-key-white hover:bg-key-white-shadow",
        disabled && "cursor-not-allowed opacity-50",
        isActive && "scale-95",
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
