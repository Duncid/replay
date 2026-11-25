import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getTunePlayback, getTunePreview } from "@/utils/tunePreview";
import { getTuneAvailability, orderTunesByPosition, publishedTunesInListOrder, type TuneLibrarySnapshot } from "@/utils/tuneLibrary";

export function useTuneLibrary(localUserId?: string | null) {
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
      const mine = (data ?? []).filter(tune => tune.is_global || tune.owner_user_id === user?.id);
      const { data: saved } = user ? await supabase.from("tune_list_positions").select("tune_key, position") : { data: [] };
      const { ordered, missing } = orderTunesByPosition(publishedTunesInListOrder(mine), new Map((saved ?? []).map(p => [p.tune_key, p.position])));
      // Remember where new tunes landed, so rebuilding or republishing never moves them.
      if (user && missing.length) void supabase.from("tune_list_positions").upsert(missing, { onConflict: "auth_user_id,tune_key", ignoreDuplicates: true });
      return ordered.map(tune => ({ tune_key: tune.tune_key,
        title: (tune.briefing as { title?: string } | null)?.title,
        composer: tune.composer,
        playback: getTunePlayback(tune.note_sequence),
        preview: getTunePreview(tune.note_sequence) }));
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

  return {
    tunes: (tunes.data ?? []).map(tune => ({
      ...tune,
      ...getTuneAvailability(tune.tune_key, progress.data?.snapshot ?? null, progress.data?.acquired ?? new Set()),
    })),
    isLoading: tunes.isPending || progress.isPending,
    error: tunes.error ?? progress.error,
    refetch: () => Promise.all([tunes.refetch(), progress.refetch()]),
  };
}
