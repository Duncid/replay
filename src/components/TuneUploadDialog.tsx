import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePublishedTuneKeys } from "@/hooks/useTuneQueries";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Circle, Loader2, RotateCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Step = { key: string; label: string; state: "running" | "done" | "failed"; detail?: string; startedAt: string; endedAt?: string };
type Job = {
  id: string; filename: string; tune_key: string; title: string | null; status: string; error: string | null;
  created_at: string; progress: Step[] | null; result: { nuggets?: unknown[]; assemblies?: unknown[] } | null;
};

export const toTuneKey = (title: string) =>
  title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

/** Steps the builder always goes through, shown greyed out until reached. */
const PLANNED = [
  { key: "upload", label: "Uploading the score" },
  { key: "read", label: "Reading the score" },
  { key: "plan", label: "TuneMaster is planning nuggets & assemblies" },
  { key: "cut", label: "Cutting notes, sheets and hand parts" },
  { key: "publish", label: "Adding to your tunes" },
];

const elapsed = (s: Step, now: number) => Math.max(0, Math.round(((s.endedAt ? Date.parse(s.endedAt) : now) - Date.parse(s.startedAt)) / 1000));

/** Opened from the menu after a file was picked: name the tune, then follow the build. */
export function TuneUploadDialog({ open, onOpenChange, file }: { open: boolean; onOpenChange: (o: boolean) => void; file: File | null }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState<Step | null>(null);
  const [activeJob, setActiveJob] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const { data: published = [] } = usePublishedTuneKeys();
  const key = toTuneKey(title);
  const exists = published.some((t) => t.tune_key === key);

  useEffect(() => {
    if (open && file) { setTitle(file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ")); setActiveJob(null); setUploading(null); }
  }, [open, file]);

  const jobs = useQuery({
    queryKey: ["tune-build-jobs", activeJob],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("tune_build_jobs")
        .select("id, filename, tune_key, title, status, error, created_at, progress, result").or(activeJob ? `status.neq.failed,id.eq.${activeJob}` : "status.neq.failed").order("created_at", { ascending: false }).limit(8);
      if (error) throw error;
      return (data ?? []) as unknown as Job[];
    },
    refetchInterval: (q) => ((q.state.data as Job[] | undefined)?.some((j) => j.status === "running") || (activeJob && !(q.state.data as Job[] | undefined)?.some((j) => j.id === activeJob)) ? 2000 : false),
  });
  const current = jobs.data?.find((j) => j.id === activeJob);
  useEffect(() => {
    if (current?.status !== "succeeded") return;
    qc.invalidateQueries({ queryKey: ["published-tune-keys"] });
    qc.invalidateQueries({ queryKey: ["tune-assets"] });
  }, [current?.status, qc]);
  const running = !!uploading || current?.status === "running";

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const startBuild = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("tune-build", { body });
    await qc.invalidateQueries({ queryKey: ["tune-build-jobs"] });
    if (error || data?.error) { toast.error(data?.error ?? error?.message ?? "Build failed"); return false; }
    setActiveJob(data.jobId);
    return true;
  };

  const handleBuild = async () => {
    if (!file || !key) return;
    const step: Step = { key: "upload", label: "Uploading the score", state: "running", startedAt: new Date().toISOString() };
    setUploading(step);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setUploading({ ...step, state: "failed", detail: "Please sign in again", endedAt: new Date().toISOString() }); return; }
    // Sources live in the uploader's own folder (storage policies check it).
    const path = `${user.id}/${crypto.randomUUID()}/${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error } = await supabase.storage.from("tune-sources").upload(path, file);
    if (error) { setUploading({ ...step, state: "failed", detail: error.message, endedAt: new Date().toISOString() }); return; }
    const done: Step = { ...step, state: "done", detail: `${Math.round(file.size / 1024)} KB`, endedAt: new Date().toISOString() };
    setUploading(done);
    if (await startBuild({ action: "start", sourcePath: path, filename: file.name, tuneKey: key, title })) setUploading(null);
    else setUploading({ ...done, state: "failed", detail: "Could not start the build" });
  };


  const showProgress = !!uploading || !!current;
  const serverSteps = current?.progress ?? [];
  const uploadStep: Step | undefined = uploading ?? (current ? { key: "upload", label: "Uploading the score", state: "done", startedAt: current.created_at, endedAt: current.created_at } : undefined);
  const shown: (Step | { key: string; label: string; state: "pending" })[] = [];
  if (uploadStep) shown.push(uploadStep);
  shown.push(...serverSteps);
  const failed = current?.status === "failed" || uploading?.state === "failed";
  if (!failed && current?.status !== "succeeded") {
    for (const p of PLANNED.slice(1)) if (!serverSteps.some((s) => s.key === p.key)) shown.push({ ...p, state: "pending" });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{showProgress ? `Building “${current?.title ?? title}”` : "Name your tune"}</DialogTitle>
          <DialogDescription>{showProgress ? current?.filename ?? file?.name : file?.name}</DialogDescription>
        </DialogHeader>

        {!showProgress ? (
          <div className="space-y-1">
            <Label htmlFor="tune-title">Name</Label>
            <Input id="tune-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && key) handleBuild(); }} />
            {exists && <p className="text-xs text-muted-foreground">A published tune already uses this name — it will be updated.</p>}
          </div>
        ) : (
          <ol className="space-y-3" aria-label="Build progress">
            {shown.map((s, i) => (
              <li key={`${s.key}-${i}`} className="flex gap-3">
                <span className="mt-0.5">
                  {s.state === "done" ? <Check className="h-4 w-4 text-primary" />
                    : s.state === "running" ? <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    : s.state === "failed" ? <X className="h-4 w-4 text-destructive" />
                    : <Circle className="h-4 w-4 text-muted-foreground/40" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className={`flex justify-between gap-2 text-sm ${s.state === "pending" ? "text-muted-foreground" : ""}`}>
                    <span>{s.label}</span>
                    {"startedAt" in s && s.key !== "upload" && <span className="tabular-nums text-xs text-muted-foreground">{elapsed(s, now)}s</span>}
                  </div>
                  {"detail" in s && s.detail && <p className={`text-xs ${s.state === "failed" ? "text-destructive" : "text-muted-foreground"}`}>{s.detail}</p>}
                  {s.key === "plan" && s.state === "running" && <p className="text-xs text-muted-foreground">Usually 1–3 minutes</p>}
                </div>
              </li>
            ))}
            {current?.status === "failed" && !serverSteps.some((s) => s.state === "failed") && current.error && (
              <li className="text-xs text-destructive">{current.error}</li>
            )}
            {current?.status === "succeeded" && (
              <li className="rounded-md border border-border p-3 text-sm">
                Added to your tunes: {current.result?.nuggets?.length ?? 0} nuggets, {current.result?.assemblies?.length ?? 0} assemblies.
              </li>
            )}
          </ol>
        )}

        <DialogFooter className="gap-2">
          {!showProgress && <Button disabled={!file || !key} onClick={handleBuild}>Build</Button>}
          {current?.status === "failed" && (
            <Button variant="outline" onClick={() => startBuild({ action: "retry", jobId: current.id })}><RotateCw className="h-4 w-4" />Retry</Button>
          )}
          {current?.status === "succeeded" && <Button onClick={() => onOpenChange(false)}>Done</Button>}
        </DialogFooter>

        {!showProgress && !!jobs.data?.length && (
          <div className="space-y-1 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">Recent uploads</p>
            {jobs.data.map((j) => (
              <button key={j.id} className="flex w-full justify-between gap-2 text-left text-xs hover:underline" onClick={() => setActiveJob(j.id)}>
                <span className="truncate">{j.title ?? j.tune_key} · {new Date(j.created_at).toLocaleString()}</span>
                <span className={j.status === "failed" ? "text-destructive" : "text-muted-foreground"}>{j.status}</span>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
