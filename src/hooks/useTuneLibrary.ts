import { useTranslation } from "react-i18next";
import { useLanguage } from "@/contexts/LanguageContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getTunePlayback, getTunePreview, tuneDisplayTitle } from "@/utils/tunePreview";
import { getTuneAvailability, orderTunesByPosition, publishedTunesInListOrder, type TuneLibrarySnapshot } from "@/utils/tuneLibrary";

export function useTuneLibrary(localUserId?: string | null) {
  const { t } = useTranslation();
  const { systemTitle } = useLanguage();
  const tunes = useQuery({
    queryKey: ["published-tune-keys", "previews"],
    queryFn: async () => {
      // Fetch previews together; keep the admin's lightweight key query separate.
      const { data, error } = await supabase.from("tune_assets")
        .select("tune_key, briefing, composer, note_sequence, is_global, owner_user_id, curriculum_versions!inner(status, published_at)")
        .eq("curriculum_versions.status", "published")
        // Oldest published tune first: a newly uploaded tune joins the end of the list.
        .order("curriculum_versions(published_at)", { ascending: true });
      if (error) throw new Error(error.message);
      // Admins can read every tune; the list only shows global tunes and this account's own.
      const { data: { user } } = await supabase.auth.getUser();
      const visible = (data ?? []).filter(tune => tune.is_global || tune.owner_user_id === user?.id);
      // Noodlyn tunes an account removed are only hidden for it, and can be added back.
      const { data: hiddenRows } = user ? await supabase.from("hidden_system_tunes").select("tune_key") : { data: [] };
      const hiddenKeys = new Set((hiddenRows ?? []).map(h => h.tune_key));
      const mine = visible.filter(tune => !(tune.is_global && hiddenKeys.has(tune.tune_key)));
      const hidden = publishedTunesInListOrder(visible.filter(tune => tune.is_global && hiddenKeys.has(tune.tune_key)))
        .map(tune => ({ tune_key: tune.tune_key, title: (tune.briefing as { title?: string } | null)?.title, composer: tune.composer }));
      const { data: saved } = user ? await supabase.from("tune_list_positions").select("tune_key, position") : { data: [] };
      const { ordered, missing } = orderTunesByPosition(publishedTunesInListOrder(mine), new Map((saved ?? []).map(p => [p.tune_key, p.position])));
      // Remember where new tunes landed, so rebuilding or republishing never moves them.
      if (user && missing.length) void supabase.from("tune_list_positions").upsert(missing, { onConflict: "auth_user_id,tune_key", ignoreDuplicates: true });
      const maxPosition = Math.max(0, ...(saved ?? []).map(p => p.position), ...missing.map(m => m.position));
      return { maxPosition, hidden, list: ordered.map(tune => ({ tune_key: tune.tune_key,
        isSystem: tune.is_global,
        isOwn: !tune.is_global && tune.owner_user_id === user?.id,
        title: (tune.briefing as { title?: string } | null)?.title,
        composer: tune.composer,
        playback: getTunePlayback(tune.note_sequence),
        preview: getTunePreview(tune.note_sequence) })) };
    },
  });
  const progress = useQuery({
    queryKey: ["tune-library-progress", localUserId ?? null],
    queryFn: async () => {
      const [curriculum, acquisition] = await Promise.all([
        supabase.from("curriculum_exports")
          .select("snapshot, curriculum_versions!inner(status, published_at)")
          .eq("curriculum_versions.status", "published")
          .order("created_at", { ascending: false }).limit(1).maybeSingle(),
        localUserId
          ? supabase.from("user_tune_acquisition").select("tune_key").eq("local_user_id", localUserId)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (curriculum.error) throw new Error(curriculum.error.message);
      if (acquisition.error) throw new Error(acquisition.error.message);
      return {
        snapshot: (curriculum.data?.snapshot ?? null) as TuneLibrarySnapshot | null,
        acquired: new Set((acquisition.data ?? []).map(item => item.tune_key)),
      };
    },
    staleTime: 0,
  });

  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["published-tune-keys"] });
  const hideTune = async (tuneKey: string) => {
    const { error } = await supabase.from("hidden_system_tunes").insert({ tune_key: tuneKey });
    if (error) throw new Error(error.message);
    await refresh();
  };
  const showTune = async (tuneKey: string) => {
    const { error } = await supabase.from("hidden_system_tunes").delete().eq("tune_key", tuneKey);
    if (error) throw new Error(error.message);
    // An added-back tune joins the end of the list.
    await supabase.from("tune_list_positions").upsert({ tune_key: tuneKey, position: (tunes.data?.maxPosition ?? 0) + 1 }, { onConflict: "auth_user_id,tune_key" });
    await refresh();
  };
  const deleteTune = async (tuneKey: string) => {
    const { data, error } = await supabase.functions.invoke("tune-manage", { body: { action: "delete", tuneKey } });
    if (error || !data?.success) throw new Error(data?.error ?? error?.message ?? t("library.deleteFailed"));
    await refresh();
  };
  return {
    hiddenTunes: (tunes.data?.hidden ?? []).map(tune => ({ ...tune, title: systemTitle(tune.tune_key, tune.title || tuneDisplayTitle(tune.tune_key)) })),
    hideTune, showTune, deleteTune,
    tunes: (tunes.data?.list ?? []).map(tune => ({
      ...tune,
      title: tune.isSystem ? systemTitle(tune.tune_key, tune.title || tuneDisplayTitle(tune.tune_key)) : tune.title,
      ...getTuneAvailability(tune.tune_key, progress.data?.snapshot ?? null, progress.data?.acquired ?? new Set()),
    })),
    isLoading: tunes.isPending || progress.isPending,
    error: tunes.error ?? progress.error,
    refetch: () => Promise.all([tunes.refetch(), progress.refetch()]),
  };
}
