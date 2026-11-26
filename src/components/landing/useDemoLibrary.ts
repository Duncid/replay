import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { publishedTunesInListOrder } from "@/utils/tuneLibrary";
import { tuneDisplayTitle } from "@/utils/tunePreview";
import { initialDemoTune, makeDemoTune, type DemoTune } from "./demoScore";

const sequences = import.meta.glob<{ default: { notes: unknown[]; totalTime?: number } }>([
  "/src/music/*/output/tune.ns.json", "/src/music/*/output/tune.inst*.ns.json",
]);
const bundledLabels: Record<string, [string, string]> = {
  "st-louis-blues": ["St Louis Blues", "W. C. Handy"],
  gymnopdie: ["Gymnopédie No. 1", "Erik Satie"],
  intro: ["Intro", ""],
  "st-louis-blues2": ["St Louis Blues · Piano arrangement", "W. C. Handy · arr. James T. Bartlett"],
};
async function bundledTunes() {
  const keys = [...new Set(Object.keys(sequences).map(path => path.split("/")[3]))];
  const tunes = await Promise.all(keys.map(async key => {
    const base = `/src/music/${key}/output/tune`;
    // Grouped exports remain authoritative; otherwise include every instrument track.
    const grouped = sequences[`${base}.ns.json`];
    const tracks = await Promise.all((grouped ? [grouped] : Object.entries(sequences)
      .filter(([path]) => path.startsWith(`${base}.inst`)).sort(([a], [b]) => a.localeCompare(b)).map(([, load]) => load)).map(load => load()));
    const notes = tracks.flatMap(track => track.default.notes);
    const sequence = { ...tracks[0]?.default, notes, totalTime: Math.max(0, ...tracks.map(track => track.default.totalTime ?? 0)) };
    const [title, composer] = bundledLabels[key] ?? [tuneDisplayTitle(key), ""];
    return makeDemoTune(key, title, composer, sequence);
  }));
  return tunes.filter((tune): tune is DemoTune => !!tune).sort((a, b) => a.key === initialDemoTune.key ? -1 : b.key === initialDemoTune.key ? 1 : a.title.localeCompare(b.title));
}

export function useDemoLibrary() {
  const [tunes, setTunes] = useState<DemoTune[]>([initialDemoTune]);
  useEffect(() => {
    let disposed = false, publicLoaded = false;
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 8000);
    void bundledTunes().then(local => { if (!disposed && !publicLoaded && local.length) setTunes(local); }).catch(() => {});
    // Only published global tunes belong on the pre-login page. No account or progress reads/writes.
    void (async () => {
      const { data, error } = await supabase.from("tune_assets")
        .select("tune_key, briefing, composer, note_sequence, is_global, curriculum_versions!inner(status, published_at)")
        .eq("is_global", true).eq("curriculum_versions.status", "published")
        .order("curriculum_versions(published_at)", { ascending: true }).abortSignal(abort.signal);
      if (error || disposed) return;
      const published = publishedTunesInListOrder((data ?? []).filter(row => row.is_global));
      const library = published.map(row => makeDemoTune(row.tune_key,
        (row.briefing as { title?: string } | null)?.title || tuneDisplayTitle(row.tune_key), row.composer ?? "", row.note_sequence))
        .filter((tune): tune is DemoTune => !!tune);
      if (library.length) { publicLoaded = true; setTunes(library); }
    })().catch(() => {}).finally(() => clearTimeout(timeout));
    return () => { disposed = true; abort.abort(); clearTimeout(timeout); };
  }, []);
  return tunes;
}
