import { Loader2, RotateCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const STEPS = [
  { key: "upload", label: "Uploading" }, { key: "read", label: "Reading" }, { key: "plan", label: "Planning" },
  { key: "cut", label: "Cutting" }, { key: "publish", label: "Adding" },
];

export interface BuildingTuneCardProps {
  title: string; composer?: string | null; failed?: boolean; error?: string | null;
  progress?: { key: string; state: string }[] | null;
  onRetry?: () => void; onDismiss?: () => void;
}

/** Placeholder for a tune that is still being built; becomes a regular card once published. */
export function BuildingTuneCard({ title, composer, failed, error, progress, onRetry, onDismiss }: BuildingTuneCardProps) {
  const steps = progress ?? [];
  const last = steps[steps.length - 1];
  const idx = Math.max(0, STEPS.findIndex(s => s.key === last?.key));
  const index = last ? (last.state === "done" ? idx + 1 : idx) : 1;
  const label = failed ? "Failed" : STEPS[Math.min(index, STEPS.length - 1)].label;
  const pct = Math.round((Math.min(index, STEPS.length - 1) + 0.5) / STEPS.length * 100);
  return <div role="status" aria-label={`${failed ? "Build failed" : "Building"}: ${title}`}
    className="flex h-full min-h-[280px] w-full flex-col overflow-hidden rounded-[22px] border border-dashed border-border bg-card text-card-foreground">
    <div className="flex h-[120px] w-full shrink-0 items-center justify-center bg-muted/30">
      {failed ? <X aria-hidden="true" className="size-6 text-destructive" /> : <Loader2 aria-hidden="true" className="size-6 animate-spin text-primary motion-reduce:animate-none" />}
    </div>
    <div className="flex flex-1 flex-col gap-3 p-5">
      <div className="space-y-1">
        <p className="font-display text-[21px] font-semibold leading-7 break-words">{title}</p>
        {composer?.trim() && <p className="text-[13px] leading-[18px] text-muted-foreground break-words">{composer}</p>}
      </div>
      <div className="mt-auto space-y-2">
        <p className={`font-mono text-[11px] font-semibold uppercase tracking-[.1em] ${failed ? "text-destructive" : "text-muted-foreground"}`}>{label}</p>
        {failed ? <>
          {error && <p className="line-clamp-2 text-xs text-muted-foreground">{error}</p>}
          <div className="flex gap-2">
            {onRetry && <Button size="sm" variant="outline" onClick={onRetry}><RotateCw className="h-4 w-4" />Retry</Button>}
            {onDismiss && <Button size="sm" variant="ghost" aria-label="Dismiss" onClick={onDismiss}><X className="h-4 w-4" /></Button>}
          </div>
        </> : <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>}
      </div>
    </div>
  </div>;
}
