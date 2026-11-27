interface Nugget {
  id: string;
  sameAs?: string;
  dependsOn?: string[];
  location?: { startMeasure?: number; startBeat?: number };
}
interface Assembly { id: string; tier: number; nuggetIds: string[] }
interface State { nugget_id: string; attempt_count: number; current_streak: number; last_practiced_at: string | null }
export interface PlanItem {
  itemId: string;
  itemType: "nugget" | "assembly" | "full_tune";
  instruction: string;
  motifs: string[];
}
export interface PracticePlan { practicePlan: PlanItem[]; encouragement: string }
interface PlanContext {
  nuggets: Nugget[];
  assemblies: Assembly[];
  teachingOrder?: string[];
  assemblyOrder?: string[];
  states: State[];
  hasFullTune: boolean;
  language?: string;
}

export function parsePracticePlan(value: unknown, context: Pick<PlanContext, "nuggets" | "assemblies" | "hasFullTune">): PracticePlan {
  const plan = value as PracticePlan | null;
  if (!plan || typeof plan.encouragement !== "string" || !Array.isArray(plan.practicePlan) || !plan.practicePlan.length || plan.practicePlan.length > 16) {
    throw new Error("Invalid practice plan");
  }
  for (const item of plan.practicePlan) {
    const exists = item && (item.itemType === "nugget" ? context.nuggets.some(n => n.id === item.itemId)
      : item.itemType === "assembly" ? context.assemblies.some(a => a.id === item.itemId)
      : item.itemType === "full_tune" && item.itemId === "FULL_TUNE" && context.hasFullTune);
    if (!exists || typeof item.instruction !== "string" || !Array.isArray(item.motifs) || !item.motifs.every(m => typeof m === "string")) {
      throw new Error("Practice plan references an invalid item");
    }
  }
  return plan;
}

/** Review → learn → connect → play. Scheduling never assumes future successes. */
export function buildFallbackPlan(context: PlanContext): PracticePlan {
  const { nuggets, assemblies, hasFullTune } = context;
  const fr = context.language?.startsWith("fr");
  const states = new Map(context.states.map(s => [s.nugget_id, s]));
  const byId = new Map(nuggets.map(n => [n.id, n]));
  // Only explicit sameAs links share readiness; motif references are not prerequisites.
  const canonical = (id: string) => {
    const visited = new Set<string>();
    while (byId.get(id)?.sameAs && byId.has(byId.get(id)!.sameAs!)) {
      if (visited.has(id)) return [...visited].sort()[0];
      visited.add(id);
      id = byId.get(id)!.sameAs!;
    }
    return id;
  };
  const stable = (id: string) => (states.get(canonical(id))?.current_streak ?? 0) >= 2;
  const rank = (order: string[] | undefined, id: string) => {
    const index = order?.indexOf(id) ?? -1;
    return index < 0 ? Infinity : index;
  };
  const ordered = [...nuggets].sort((a, b) =>
    rank(context.teachingOrder, a.id) - rank(context.teachingOrder, b.id) ||
    (a.location?.startMeasure ?? Infinity) - (b.location?.startMeasure ?? Infinity) ||
    (a.location?.startBeat ?? 1) - (b.location?.startBeat ?? 1) || a.id.localeCompare(b.id, undefined, { numeric: true }));
  const unique = ordered.filter(n => canonical(n.id) === n.id);
  const practicePlan: PlanItem[] = [];
  const add = (id: string, type: PlanItem["itemType"], instruction: string) => {
    if (!practicePlan.some(p => p.itemId === id)) practicePlan.push({ itemId: id, itemType: type, instruction, motifs: [] });
  };
  const review = unique.find(n => (states.get(n.id)?.attempt_count ?? 0) > 0 && !stable(n.id));
  if (review) add(review.id, "nugget", fr ? "Reprends ce passage pour retrouver des notes régulières." : "Review this passage with steady, accurate notes.");

  const next = unique.filter(n => !stable(n.id) && n.id !== review?.id);
  // Prefer satisfied nugget dependencies, but malformed/cyclic metadata must not stall practice.
  const ready = next.filter(n => (n.dependsOn ?? []).filter(id => byId.has(id) && id !== n.id).every(stable));
  for (const n of (ready.length ? ready : next).slice(0, 2)) {
    add(n.id, "nugget", fr ? "Travaille cette phrase lentement, puis garde une pulsation régulière." : "Learn this phrase slowly, then keep a steady pulse.");
  }

  const validAssemblies = assemblies.filter(a => a.nuggetIds.length >= 2 && a.nuggetIds.every(id => byId.has(id)));
  const readyAssemblies = validAssemblies.filter(a => a.nuggetIds.every(stable));
  const orderedAssemblies = [...readyAssemblies].sort((a, b) => a.tier - b.tier ||
    rank(context.assemblyOrder, a.id) - rank(context.assemblyOrder, b.id) || a.id.localeCompare(b.id, undefined, { numeric: true }));
  const unfinishedAssemblies = orderedAssemblies.filter(a => !stable(a.id));
  const nextTier = unfinishedAssemblies[0]?.tier;
  for (const a of unfinishedAssemblies.filter(a => a.tier === nextTier).slice(0, 2)) {
    add(a.id, "assembly", fr ? "Relie les phrases en gardant la pulsation entre les passages." : "Connect these phrases, keeping the pulse through each transition.");
  }

  const allNuggetsReady = unique.every(n => stable(n.id));
  const largestTier = Math.max(0, ...validAssemblies.map(a => a.tier));
  const largerSectionReady = !validAssemblies.length || readyAssemblies.some(a => a.tier === largestTier && stable(a.id));
  if (hasFullTune && allNuggetsReady && largerSectionReady) {
    // Near completion, avoid scheduling every remaining overlapping assembly.
    practicePlan.splice(0, practicePlan.length);
    add("FULL_TUNE", "full_tune", fr ? "Joue le morceau entier en gardant une pulsation régulière." : "Play the whole tune with a steady pulse.");
  }

  if (!practicePlan.length && unique.length) {
    const oldest = [...unique].sort((a, b) => (states.get(a.id)?.last_practiced_at ?? "").localeCompare(states.get(b.id)?.last_practiced_at ?? ""))[0];
    add(oldest.id, "nugget", fr ? "Revois cette phrase pour la garder en mémoire." : "Review this phrase to keep it familiar.");
  }
  if (!practicePlan.length) throw new Error("Tune has no playable practice items");
  return { practicePlan, encouragement: fr ? "Avance phrase par phrase, à ton rythme." : "Build the tune one phrase at a time, at your own pace." };
}
