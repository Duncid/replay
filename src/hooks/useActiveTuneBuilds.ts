import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface TuneBuild {
  id: string; title: string | null; composer: string | null; tune_key: string; status: string; error: string | null;
  progress: { key: string; label: string; state: string }[] | null;
}
const DISMISSED = "replay.dismissedTuneBuilds";
const readDismissed = (): string[] => { try { return JSON.parse(localStorage.getItem(DISMISSED) ?? "[]"); } catch { return []; } };

/** The signed-in user's own builds that are running or recently failed, shown as cards in the tune list. */
export function useActiveTuneBuilds() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const q = useQuery({
    queryKey: ["tune-build-jobs", "active", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { data, error } = await supabase.from("tune_build_jobs")
        .select("id, title, composer, tune_key, status, error, progress")
        .eq("created_by", user!.id).in("status", ["running", "failed", "succeeded"]).gte("updated_at", since)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as TuneBuild[];
    },
    refetchInterval: (s) => ((s.state.data as TuneBuild[] | undefined)?.some(j => j.status === "running") ? 2000 : 15000),
  });
  // When a build we watched finishes, refresh the tune list so the real card replaces it.
  const seenRunning = useRef(new Set<string>());
  useEffect(() => {
    let finished = false;
    for (const j of q.data ?? []) {
      if (j.status === "running") seenRunning.current.add(j.id);
      else if (seenRunning.current.delete(j.id) && j.status === "succeeded") finished = true;
    }
    if (finished) {
      qc.invalidateQueries({ queryKey: ["published-tune-keys"] });
      qc.invalidateQueries({ queryKey: ["tune-assets"] });
      qc.invalidateQueries({ queryKey: ["tune-library"] });
    }
  }, [q.data, qc]);
  const dismiss = (id: string) => { const next = [...dismissed, id]; setDismissed(next); localStorage.setItem(DISMISSED, JSON.stringify(next.slice(-50))); };
  const retry = async (id: string) => {
    await supabase.functions.invoke("tune-build", { body: { action: "retry", jobId: id } });
    q.refetch();
  };
  const builds = (q.data ?? []).filter(j => j.status !== "succeeded" && !dismissed.includes(j.id));
  return { builds, dismiss, retry, refetch: q.refetch };
}
