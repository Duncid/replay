import i18n from "@/lib/i18n";
import { orderTunesByPosition } from "@/utils/tuneLibrary";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface TuneBuild {
  id: string; title: string | null; composer: string | null; tune_key: string; status: string; error: string | null;
  progress: { key: string; label: string; state: string }[] | null;
  updated_at?: string;
}
/** Uploads still sending the score, before the server has a build job for them. */
type Pending = TuneBuild & { retryUpload: () => void };
let pending: Pending[] = [];
const listeners = new Set<() => void>();
const setPending = (next: Pending[]) => { pending = next; listeners.forEach(l => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

export function startTuneUpload(qc: QueryClient, input: { file: File; tuneKey: string; title: string; composer: string }) {
  const id = `pending-${crypto.randomUUID()}`;
  const base: Pending = { id, title: input.title, composer: input.composer, tune_key: input.tuneKey, status: "running", error: null,
    progress: [{ key: "upload", label: "Uploading the score", state: "running" }], retryUpload: () => { remove(); startTuneUpload(qc, input); } };
  const remove = () => setPending(pending.filter(p => p.id !== id));
  const fail = (error: string) => setPending(pending.map(p => p.id === id ? { ...p, status: "failed", error } : p));
  setPending([...pending, base]);
  void (async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail(i18n.t("upload.signIn"));
    // A new tune takes the last place in this account's list; an update keeps its place.
    // Save the order currently on screen first, so tunes that never got a saved place cannot jump behind the new one.
    const { data: saved } = await supabase.from("tune_list_positions").select("tune_key, position");
    const shown = (qc.getQueryData<{ list: { tune_key: string }[] }>(["published-tune-keys", "previews"])?.list ?? []).filter(t => t.tune_key !== input.tuneKey);
    const { missing } = orderTunesByPosition(shown, new Map((saved ?? []).map(p => [p.tune_key, p.position])));
    const last = Math.max(0, ...(saved ?? []).filter(p => p.tune_key !== input.tuneKey).map(p => p.position), ...missing.map(m => m.position));
    const rows = [...missing, { tune_key: input.tuneKey, position: last + 1 }];
    await supabase.from("tune_list_positions").upsert(rows, { onConflict: "auth_user_id,tune_key", ignoreDuplicates: true });
    const path = `${user.id}/${crypto.randomUUID()}/${input.file.name.replace(/[^\w.-]/g, "_")}`;
    const up = await supabase.storage.from("tune-sources").upload(path, input.file);
    if (up.error) return fail(up.error.message);
    const { data, error } = await supabase.functions.invoke("tune-build", { body: { action: "start", sourcePath: path, filename: input.file.name, tuneKey: input.tuneKey, title: input.title, composer: input.composer } });
    if (error || data?.error) return fail(data?.error ?? error?.message ?? i18n.t("upload.startFailed"));
    await qc.invalidateQueries({ queryKey: ["tune-build-jobs"] });
    remove();
  })();
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
        .select("id, title, composer, tune_key, status, error, progress, updated_at")
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
  const dismiss = (id: string) => {
    if (pending.some(p => p.id === id)) return setPending(pending.filter(p => p.id !== id)); const next = [...dismissed, id]; setDismissed(next); localStorage.setItem(DISMISSED, JSON.stringify(next.slice(-50))); };
  const retry = async (id: string) => {
    const p = pending.find(x => x.id === id);
    if (p) return p.retryUpload();
    await supabase.functions.invoke("tune-build", { body: { action: "retry", jobId: id } });
    q.refetch();
  };
  const local = useSyncExternalStore(subscribe, () => pending);
  const builds = [...(q.data ?? []).filter(j => (j.status !== "succeeded" || Date.now() - Date.parse(j.updated_at ?? "") < 120_000) && !dismissed.includes(j.id)), ...local];
  return { builds, dismiss, retry, refetch: q.refetch };
}
