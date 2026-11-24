import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePublishedTuneKeys } from "@/hooks/useTuneQueries";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Job = {
  id: string; filename: string; tune_key: string; title: string | null; status: string; error: string | null;
  created_at: string; result: { nuggets?: unknown[]; assemblies?: unknown[] } | null;
};

export const toTuneKey = (title: string) =>
  title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

export function TuneUploadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [step, setStep] = useState<"idle" | "uploading" | "building" | "publishing">("idle");
  const [activeJob, setActiveJob] = useState<string | null>(null);
  const { data: published = [] } = usePublishedTuneKeys();
  const publishedKeys = published.map((t) => t.tune_key);

  const jobs = useQuery({
    queryKey: ["tune-build-jobs"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("tune_build_jobs")
        .select("id, filename, tune_key, title, status, error, created_at, result").order("created_at", { ascending: false }).limit(10);
      if (error) throw error;
      return (data ?? []) as Job[];
    },
  });

  const runBuild = async (body: Record<string, unknown>) => {
    setStep("building");
    const { data, error } = await supabase.functions.invoke("tune-build", { body });
    setStep("idle");
    await qc.invalidateQueries({ queryKey: ["tune-build-jobs"] });
    if (error || data?.error) { toast.error(data?.error ?? error?.message ?? "Build failed"); return; }
    setActiveJob(data.jobId);
    toast.success("Nuggets built — review and publish");
  };

  const handleBuild = async () => {
    if (!file || !key) return;
    setStep("uploading");
    const path = `${crypto.randomUUID()}/${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error } = await supabase.storage.from("tune-sources").upload(path, file);
    if (error) { setStep("idle"); toast.error(error.message); return; }
    await runBuild({ action: "start", sourcePath: path, filename: file.name, tuneKey: key, title: title || undefined });
  };

  const publish = async (job: Job) => {
    setStep("publishing");
    const exists = publishedKeys.includes(job.tune_key);
    const { data: full } = await supabase.from("tune_build_jobs").select("result").eq("id", job.id).single();
    const { data, error } = await supabase.functions.invoke("tune-publish", {
      body: { tuneKey: job.tune_key, title: job.title ?? job.tune_key, tuneAssets: full?.result, mode: exists ? "update" : "create", existingTuneKey: exists ? job.tune_key : undefined },
    });
    setStep("idle");
    if (error || !data?.success) { toast.error(data?.error ?? error?.message ?? "Publish failed"); return; }
    toast.success(`"${job.tune_key}" published`);
    qc.invalidateQueries({ queryKey: ["published-tune-keys"] });
    qc.invalidateQueries({ queryKey: ["tune-assets"] });
  };

  const busy = step !== "idle";
  const current = jobs.data?.find((j) => j.id === activeJob);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload new tune</DialogTitle>
          <DialogDescription>Upload a MusicXML score (.mxl or .xml). Nuggets and assemblies are built for you.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="tune-file">Score file</Label>
            <Input id="tune-file" type="file" accept=".mxl,.xml,.musicxml" onChange={(e) => {
              const f = e.target.files?.[0] ?? null; setFile(f);
              if (f && !title) { const t = f.name.replace(/\.[^.]+$/, ""); setTitle(t); if (!keyTouched) setKey(toTuneKey(t)); }
            }} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tune-title">Title</Label>
            <Input id="tune-title" value={title} onChange={(e) => { setTitle(e.target.value); if (!keyTouched) setKey(toTuneKey(e.target.value)); }} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tune-key">Tune key</Label>
            <Input id="tune-key" value={key} onChange={(e) => { setKeyTouched(true); setKey(toTuneKey(e.target.value)); }} />
            {publishedKeys.includes(key) && <p className="text-xs text-muted-foreground">Publishing will update the existing tune "{key}".</p>}
          </div>
          {current?.status === "succeeded" && (
            <div className="rounded-md border border-border p-3 text-sm">
              Ready: {current.result?.nuggets?.length ?? 0} nuggets, {current.result?.assemblies?.length ?? 0} assemblies.
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          {current?.status === "succeeded" && (
            <Button variant="outline" disabled={busy} onClick={() => publish(current)}>
              {step === "publishing" && <Loader2 className="h-4 w-4 animate-spin" />}Publish
            </Button>
          )}
          <Button disabled={!file || !key || busy} onClick={handleBuild}>
            {(step === "uploading" || step === "building") && <Loader2 className="h-4 w-4 animate-spin" />}
            {step === "uploading" ? "Uploading…" : step === "building" ? "Building nuggets…" : "Build"}
          </Button>
        </DialogFooter>
        {!!jobs.data?.length && (
          <div className="space-y-1 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">Recent uploads</p>
            {jobs.data.map((j) => (
              <div key={j.id} className="flex items-center justify-between gap-2 text-xs">
                <button className="truncate text-left hover:underline" onClick={() => setActiveJob(j.id)}>
                  {new Date(j.created_at).toLocaleString()} · {j.filename} → {j.tune_key}
                </button>
                <span className={j.status === "failed" ? "text-destructive" : "text-muted-foreground"} title={j.error ?? undefined}>
                  {j.status}{j.error ? `: ${j.error.slice(0, 40)}` : ""}
                </span>
                {j.status === "failed" && (
                  <Button size="icon" variant="ghost" className="h-6 w-6" disabled={busy} aria-label="Retry" onClick={() => runBuild({ action: "retry", jobId: j.id })}>
                    <RotateCw className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
