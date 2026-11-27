import { LockKeyhole, Play, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { TuneThumbnail } from "@/components/TuneThumbnail";
import { Button } from "@/components/ui/button";
import type { TunePreview } from "@/utils/tunePreview";

export interface TuneCardProps {
  title: string;
  composer?: string | null;
  unlocked: boolean;
  preview?: TunePreview;
  prerequisites?: string[];
  onSelect: () => void;
  onSignUp?: () => void;
  onPreview?: () => void;
  isPreviewPlaying?: boolean;
}

/** The same visual hierarchy as Noodlyn Learn, using the web theme's tokens. */
export function TuneCard({ title, composer, unlocked, preview, prerequisites = [], onSelect, onSignUp, onPreview, isPreviewPlaying = false }: TuneCardProps) {
  return <div className={cn("group relative flex h-full min-h-[280px] w-full min-w-0 flex-col overflow-hidden rounded-[22px] border border-border bg-card text-left text-card-foreground transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none",
      unlocked && "border-primary/50 hover:border-primary hover:shadow-[var(--glow-user)] focus-within:border-primary focus-within:shadow-[var(--glow-user)]")}>
    <button type="button" disabled={!unlocked} onClick={onSelect}
      aria-label={`${unlocked ? "Practice" : "Locked"}: ${title}`}
      className="absolute inset-0 rounded-[22px] focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-[-3px] disabled:cursor-not-allowed" />
    <span className={cn("pointer-events-none block w-full shrink-0", !unlocked && "opacity-45")}><TuneThumbnail preview={preview} /></span>
    <span className="pointer-events-none flex w-full flex-1 flex-col gap-3 p-5">
      {!unlocked && <span className="flex items-center justify-between gap-3 font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-muted-foreground">
        <span>Locked</span>
        <LockKeyhole aria-hidden="true" className="size-4 shrink-0" />
      </span>}
      <span className="block space-y-1">
        <span className="block font-display text-[21px] font-semibold leading-7 break-words">{title}</span>
        {composer?.trim() && <span className="block text-[13px] leading-[18px] text-muted-foreground break-words">{composer}</span>}
      </span>
      <button type="button" onClick={onPreview} disabled={!onPreview}
        aria-label={`${isPreviewPlaying ? "Stop preview" : "Preview"}: ${title}`}
        aria-pressed={isPreviewPlaying}
        className="pointer-events-auto relative flex min-h-9 w-fit items-center gap-1.5 rounded-md px-1 text-[13px] font-medium text-muted-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:opacity-45 disabled:cursor-not-allowed">
        {isPreviewPlaying ? <Square aria-hidden="true" className="size-3.5" fill="currentColor" /> : <Play aria-hidden="true" className="size-3.5" fill="currentColor" />}
        {isPreviewPlaying ? "Stop" : "Preview"}
      </button>
      {!unlocked && prerequisites.length > 0 && <span className="block text-[13px] leading-[18px] text-muted-foreground break-words">Complete {prerequisites.join(", ")} first</span>}
      {preview && <span className="mt-auto block text-[13px] leading-[18px] text-muted-foreground">{preview.noteCount} {preview.noteCount === 1 ? "note" : "notes"} · {Math.round(preview.duration)} sec</span>}
    </span>
    {!unlocked && onSignUp && <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-card/60">
      <Button type="button" onClick={event => { event.currentTarget.focus(); onSignUp(); }} className="pointer-events-auto shadow-lg">Sign-up for free</Button>
    </div>}
  </div>;
}
