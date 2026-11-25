export type OverviewKind = "nugget" | "assembly" | "full";

export interface OverviewNote { pitch: number; startTime: number; endTime: number }

export interface OverviewSource {
  kind: OverviewKind;
  id: string;
  label: string;
  bars?: string;
  sameAs?: string;
  notes: OverviewNote[];
}

export interface OverviewItem extends OverviewSource {
  noteCount: number;
  duration: number;
  /** Id of an earlier item (in tune order) with exactly the same notes and rhythm. */
  duplicateOf?: string;
}

const KIND_ORDER: Record<OverviewKind, number> = { nugget: 0, assembly: 1, full: 2 };

/** Pitches and timing relative to the first note, so a passage repeated later in the tune matches. */
export function noteSignature(notes: OverviewNote[]): string {
  if (!notes.length) return "";
  const sorted = [...notes].sort((a, b) => a.startTime - b.startTime || a.pitch - b.pitch);
  const t0 = sorted[0].startTime;
  const r = (v: number) => Math.round(v * 20) / 20;
  return sorted.map((n) => `${n.pitch}@${r(n.startTime - t0)}:${r(n.endTime - n.startTime)}`).join("|");
}

/** Nuggets, then assemblies, then the full tune; each group sorted by number (N1, N2, … N10). */
export function buildTuneOverview(sources: OverviewSource[]): OverviewItem[] {
  const firstBySig = new Map<string, string>();
  const items = sources.map((s): OverviewItem => {
    const sig = noteSignature(s.notes);
    const prior = sig ? firstBySig.get(sig) : undefined;
    if (sig && !prior) firstBySig.set(sig, s.id);
    const start = s.notes.length ? Math.min(...s.notes.map((n) => n.startTime)) : 0;
    const end = s.notes.length ? Math.max(...s.notes.map((n) => n.endTime)) : 0;
    return { ...s, noteCount: s.notes.length, duration: end - start, duplicateOf: prior };
  });
  return items.sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      a.id.localeCompare(b.id, undefined, { numeric: true }),
  );
}
