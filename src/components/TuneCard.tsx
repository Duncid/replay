import { ArrowRight, LockKeyhole, Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface TuneCardProps {
  title: string;
  unlocked: boolean;
  prerequisites?: string[];
  onSelect: () => void;
}

/** Presentational tune entry, shared by the library and its component stories. */
export function TuneCard({ title, unlocked, prerequisites = [], onSelect }: TuneCardProps) {
  return <div className="min-w-0 border border-border rounded-lg bg-card text-card-foreground">
    <Button variant="ghost"
      className="h-auto min-h-32 w-full rounded-lg p-5 flex items-center justify-between gap-4 whitespace-normal text-left"
      disabled={!unlocked} onClick={onSelect} aria-label={`${unlocked ? "Practice" : "Locked"}: ${title}`}>
      <span className="flex min-w-0 items-center gap-4">
        {unlocked ? <Music2 className="size-6 shrink-0 text-primary" /> : <LockKeyhole className="size-6 shrink-0 text-muted-foreground" />}
        <span className="min-w-0 space-y-2">
          <span className="block text-lg font-semibold break-words">{title}</span>
          <span className="block text-sm font-normal text-muted-foreground break-words">
            {unlocked ? "Unlocked" : `Locked · Complete ${prerequisites.join(", ")}`}
          </span>
        </span>
      </span>
      {unlocked && <ArrowRight className="size-5 shrink-0 text-muted-foreground" />}
    </Button>
  </div>;
}
