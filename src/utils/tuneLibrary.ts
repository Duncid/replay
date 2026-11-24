export interface TuneLibrarySnapshot {
  tunes?: Array<{ tuneKey: string; musicRef: string }>;
  edges?: Array<{ source_key: string; target_key: string; edge_type: string }>;
}

/**
 * One entry per tune, the newest published version winning, listed with the
 * oldest publication first so a newly uploaded tune joins the end of the list.
 * Rows must arrive ordered by published_at ascending.
 */
export function publishedTunesInListOrder<T extends { tune_key: string }>(rows: T[]): T[] {
  const newest = new Map<string, T>();
  for (const row of rows) newest.set(row.tune_key, row);
  return [...newest.values()];
}

export function isTuneAcquired(musicRef: string, snapshot: TuneLibrarySnapshot | null, acquiredTuneKeys: Set<string>): boolean {
  return acquiredTuneKeys.has(musicRef) || (snapshot?.tunes ?? []).some(node =>
    node.musicRef === musicRef && acquiredTuneKeys.has(node.tuneKey));
}

/** Progression is between curriculum node keys; assets are addressed by musicRef. */
export function getTuneAvailability(
  musicRef: string,
  snapshot: TuneLibrarySnapshot | null,
  acquiredTuneKeys: Set<string>,
): { unlocked: boolean; prerequisites: string[] } {
  const nodes = snapshot?.tunes ?? [];
  const matchingNodes = nodes.filter(node => node.musicRef === musicRef);
  const completed = (key: string) => {
    const node = nodes.find(item => item.tuneKey === key);
    return acquiredTuneKeys.has(key) || (node ? acquiredTuneKeys.has(node.musicRef) : false);
  };
  if (acquiredTuneKeys.has(musicRef) || matchingNodes.some(node => completed(node.tuneKey))) {
    return { unlocked: true, prerequisites: [] };
  }
  const paths = matchingNodes.map(node => (snapshot?.edges ?? [])
    .filter(edge => edge.edge_type === "tune_next" && edge.target_key === node.tuneKey)
    .map(edge => edge.source_key)
    .filter(key => !completed(key)));
  // A published asset outside the quest graph is available directly. Multiple
  // references to one asset are alternative entry points, not combined locks.
  if (paths.length === 0 || paths.some(path => path.length === 0)) {
    return { unlocked: true, prerequisites: [] };
  }
  const shortestPath = paths.reduce((best, path) => path.length < best.length ? path : best);
  return {
    unlocked: false,
    prerequisites: shortestPath.map(key => nodes.find(node => node.tuneKey === key)?.musicRef ?? key),
  };
}
