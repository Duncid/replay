import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getTunePreview } from "@/utils/tunePreview";
import { getTuneAvailability, type TuneLibrarySnapshot } from "@/utils/tuneLibrary";

export function useTuneLibrary(localUserId?: string | null) {
  const tunes = useQuery({
    queryKey: ["published-tune-keys", "previews"],
    queryFn: async () => {
      // Fetch previews together; keep the admin's lightweight key query separate.
      const { data, error } = await supabase.from("tune_assets")
        .select("tune_key, note_sequence, is_global, owner_user_id, curriculum_versions!inner(status, published_at)")
        .eq("curriculum_versions.status", "published")
        .order("curriculum_versions(published_at)", { ascending: false });
      if (error) throw new Error(error.message);
      // Admins can read every tune; the list only shows global tunes and this account's own.
      const { data: { user } } = await supabase.auth.getUser();
      const seen = new Set<string>();
      return (data ?? []).filter(tune => tune.is_global || tune.owner_user_id === user?.id).filter(tune => {
        if (seen.has(tune.tune_key)) return false;
        seen.add(tune.tune_key);
        return true;
      }).map(tune => ({ tune_key: tune.tune_key, preview: getTunePreview(tune.note_sequence) }));
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
