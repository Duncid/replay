import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface TrackLoadingItemProps {
  label?: string;
  message?: string;
}

export function TrackLoadingItem({
  label = "Loading...",
  message = "This may take a moment.",
}: TrackLoadingItemProps) {
  return (
    <div
      className={cn(
        "flex flex-col w-72 shrink-0 transition-all duration-300 rounded-md h-full",
        "border border-dashed border-border bg-card/50"
      )}
    >
      <div className="flex items-center gap-2 px-2 h-9 shrink-0 rounded-t-md border-b border-border bg-muted/50 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>{label}</span>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 py-6 text-xs text-muted-foreground">
        {message}
      </div>
    </div>
  );
}
