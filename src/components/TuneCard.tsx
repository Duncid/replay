import { ArrowRight, LockKeyhole, Music2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TuneCardProps {
  title: string;
  unlocked: boolean;
  prerequisites?: string[];
  onSelect: () => void;
}

/** Presentational tune entry, shared by the library and its component stories. */
export function TuneCard({ title, unlocked, prerequisites = [], onSelect }: TuneCardProps) {
  return <button type="button" disabled={!unlocked} onClick={onSelect}
    aria-label={`${unlocked ? "Practice" : "Locked"}: ${title}`}
    className={cn("group min-h-64 w-full min-w-0 rounded-lg border border-border bg-card p-5 text-left text-card-foreground transition-[border-color,box-shadow] duration-150 flex flex-col items-start justify-between gap-4 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
      unlocked ? "hover:border-primary hover:shadow-[var(--glow-user)]" : "cursor-not-allowed")}>
    <span className="flex min-w-0 flex-col items-start gap-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
        {unlocked ? <Music2 className="size-5 text-primary" /> : <LockKeyhole className="size-5 text-muted-foreground" />}
      </span>
      <span className="min-w-0 space-y-2">
        <span className="block font-display text-lg leading-6 font-semibold break-words">{title}</span>
        <span className={cn("inline-block rounded-sm border px-1.5 py-0.5 font-mono text-[11px] leading-[14px] font-semibold tracking-[.12em] uppercase",
          unlocked ? "border-primary text-primary" : "border-input text-muted-foreground")}>{unlocked ? "Unlocked" : "Locked"}</span>
        {!unlocked && prerequisites.length > 0 && <span className="block text-[13px] leading-[18px] text-muted-foreground break-words">Complete {prerequisites.join(", ")}</span>}
      </span>
    </span>
    <ArrowRight aria-hidden className={cn("size-5 shrink-0 self-end text-muted-foreground", unlocked && "group-hover:text-primary")} />
  </button>;
}
