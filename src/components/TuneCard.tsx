import { ArrowUpRight, LockKeyhole } from "lucide-react";
import { cn } from "@/lib/utils";
import { TuneThumbnail } from "@/components/TuneThumbnail";
import type { TunePreview } from "@/utils/tunePreview";

export interface TuneCardProps {
  title: string;
  composer?: string | null;
  unlocked: boolean;
  preview?: TunePreview;
  prerequisites?: string[];
  onSelect: () => void;
}

/** The same visual hierarchy as Replay Nat, using the web theme's tokens. */
export function TuneCard({ title, composer, unlocked, preview, prerequisites = [], onSelect }: TuneCardProps) {
  const StatusIcon = unlocked ? ArrowUpRight : LockKeyhole;
  return <button type="button" disabled={!unlocked} onClick={onSelect}
    aria-label={`${unlocked ? "Practice" : "Locked"}: ${title}`}
    className={cn("group flex h-full min-h-[280px] w-full min-w-0 flex-col overflow-hidden rounded-[22px] border border-border bg-card text-left text-card-foreground transition-[border-color,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 motion-reduce:transition-none",
      unlocked ? "border-primary/50 hover:border-primary hover:shadow-[var(--glow-user)] focus-visible:border-primary focus-visible:shadow-[var(--glow-user)]" : "cursor-not-allowed")}>
    <span className={cn("block w-full shrink-0", !unlocked && "opacity-45")}><TuneThumbnail preview={preview} /></span>
    <span className="flex w-full flex-1 flex-col gap-3 p-5">
      <span className="flex items-center justify-between gap-3 font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-muted-foreground">
        <span>{unlocked ? "Ready to play" : "Locked"}</span>
        <StatusIcon aria-hidden="true" className="size-4 shrink-0" />
      </span>
      <span className="block space-y-1">
        <span className="block font-display text-[21px] font-semibold leading-7 break-words">{title}</span>
        {composer?.trim() && <span className="block text-[13px] leading-[18px] text-muted-foreground break-words">{composer}</span>}
      </span>
      {!unlocked && prerequisites.length > 0 && <span className="block text-[13px] leading-[18px] text-muted-foreground break-words">Complete {prerequisites.join(", ")} first</span>}
      {preview && <span className="mt-auto block text-[13px] leading-[18px] text-muted-foreground">{preview.noteCount} {preview.noteCount === 1 ? "note" : "notes"} · {Math.round(preview.duration)} sec</span>}
    </span>
  </button>;
}
