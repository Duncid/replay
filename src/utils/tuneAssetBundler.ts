// Centralized Vite glob imports for tune assets
// Vite packages assets locally; load only the selected tune at runtime.

import type { TuneBriefing } from "@/types/tuneAssets";

// Auto-discover all teacher.json files at build time
const teacherModules = import.meta.glob<{ default: Record<string, unknown> }>(
  "/src/music/*/teacher.json",
  {},
);

// Discover all tune note sequences at build time
const tuneNsModules = import.meta.glob<{ default: object }>(
  "/src/music/*/output/tune.ns.json",
  {},
);

const tuneInstModules = import.meta.glob<{ default: object }>(
  "/src/music/*/output/tune.inst*.ns.json",
  {},
);

const tuneLhModules = import.meta.glob<{ default: object }>(
  "/src/music/*/output/tune.lh.ns.json",
  {},
);

const tuneRhModules = import.meta.glob<{ default: object }>(
  "/src/music/*/output/tune.rh.ns.json",
  {},
);

// Discover all nugget note sequences
const nuggetNsModules = import.meta.glob<{ default: object }>(
  "/src/music/*/output/nuggets/*.ns.json",
  {},
);

const nuggetInstModules = import.meta.glob<{ default: object }>(
  "/src/music/*/output/nuggets/*.inst*.ns.json",
  {},
);

const nuggetLhModules = import.meta.glob<{ default: object }>(
  "/src/music/*/output/nuggets/*.lh.ns.json",
  {},
);

const nuggetRhModules = import.meta.glob<{ default: object }>(
  "/src/music/*/output/nuggets/*.rh.ns.json",
  {},
);

// Discover all assembly note sequences
const assemblyNsModules = import.meta.glob<{ default: object }>(
  "/src/music/*/output/assemblies/*.ns.json",
  {},
);

const assemblyInstModules = import.meta.glob<{ default: object }>(
  "/src/music/*/output/assemblies/*.inst*.ns.json",
  {},
);

const assemblyLhModules = import.meta.glob<{ default: object }>(
  "/src/music/*/output/assemblies/*.lh.ns.json",
  {},
);

const assemblyRhModules = import.meta.glob<{ default: object }>(
  "/src/music/*/output/assemblies/*.rh.ns.json",
  {},
);

// Discover all XML files at build time (for sheet music rendering)
const tuneXmlModules = import.meta.glob<string>(
  "/src/music/*/output/tune.xml",
  { query: "?raw", import: "default" },
);

const tuneLhXmlModules = import.meta.glob<string>(
  "/src/music/*/output/tune.lh.xml",
  { query: "?raw", import: "default" },
);

const tuneRhXmlModules = import.meta.glob<string>(
  "/src/music/*/output/tune.rh.xml",
  { query: "?raw", import: "default" },
);

const nuggetXmlModules = import.meta.glob<string>(
  "/src/music/*/output/nuggets/*.xml",
  { query: "?raw", import: "default" },
);

const assemblyXmlModules = import.meta.glob<string>(
  "/src/music/*/output/assemblies/*.xml",
  { query: "?raw", import: "default" },
);

// Discover all DSP XML files at build time (display-optimized MusicXML)
const tuneDspXmlModules = import.meta.glob<string>(
  "/src/music/*/output/tune.dsp.xml",
  { query: "?raw", import: "default" },
);

// Match all *.dsp.xml files in nuggets (includes N1.dsp.xml, N1.lh.dsp.xml, N1.rh.dsp.xml)
const nuggetDspXmlModules = import.meta.glob<string>(
  "/src/music/*/output/nuggets/*.dsp.xml",
  { query: "?raw", import: "default" },
);

// Match all *.dsp.xml files in assemblies
const assemblyDspXmlModules = import.meta.glob<string>(
  "/src/music/*/output/assemblies/*.dsp.xml",
  { query: "?raw", import: "default" },
);

// Cache each tune as a group so a selection needs one loading transition.
type AssetLoader = () => Promise<unknown>;
const assetLoaders: Record<string, AssetLoader> = {
  ...teacherModules,
  ...tuneNsModules,
  ...tuneInstModules,
  ...tuneLhModules,
  ...tuneRhModules,
  ...nuggetNsModules,
  ...nuggetInstModules,
  ...nuggetLhModules,
  ...nuggetRhModules,
  ...assemblyNsModules,
  ...assemblyInstModules,
  ...assemblyLhModules,
  ...assemblyRhModules,
  ...tuneXmlModules,
  ...tuneLhXmlModules,
  ...tuneRhXmlModules,
  ...nuggetXmlModules,
  ...assemblyXmlModules,
  ...tuneDspXmlModules,
  ...nuggetDspXmlModules,
  ...assemblyDspXmlModules,
};
const loadedAssets = new Map<string, unknown>();
const tuneLoads = new Map<string, Promise<void>>();
const tuneErrors = new Map<string, unknown>();

const readAsset = (path: string): unknown => {
  if (!assetLoaders[path]) return null;
  if (loadedAssets.has(path)) return loadedAssets.get(path);
  const musicRef = path.split("/")[3];
  if (tuneErrors.has(musicRef)) throw tuneErrors.get(musicRef);
  let pending = tuneLoads.get(musicRef);
  if (!pending) {
    pending = Promise.all(
      Object.entries(assetLoaders)
        .filter(([assetPath]) => assetPath.startsWith(`/src/music/${musicRef}/`))
        .map(async ([assetPath, load]) => {
          const module = await load();
          loadedAssets.set(assetPath, typeof module === "string" ? module : (module as { default: unknown }).default);
        }),
    ).then(() => undefined).catch(error => {
      tuneErrors.set(musicRef, error);
      throw error;
    });
    tuneLoads.set(musicRef, pending);
  }
  // React Suspense keeps synchronous selection helpers simple while assets load.
  throw pending;
};

const getGlobModule = (
  _modules: Record<string, AssetLoader>,
  path: string,
): object | null => readAsset(path) as object | null;

// Export local tune keys discovered from file system
// Only returns folders that have an output/tune.ns.json file (required for publishing)
export const getLocalTuneKeys = (): string[] => {
  const keys = new Set<string>();
  const paths = [...Object.keys(tuneNsModules), ...Object.keys(tuneInstModules)];
  paths.forEach((path) => {
    const match = path.match(
      /\/music\/([^/]+)\/output\/tune(?:\.inst\d+)?\.ns\.json$/,
    );
    if (match?.[1]) keys.add(match[1]);
  });
  return Array.from(keys);
};

// Validation result for pre-publish checks
export interface TuneValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Validate a tune has all required files before publishing
export const validateTuneForPublishing = (
  musicRef: string,
): TuneValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required: tune.ns.json
  const tuneNs = getTuneNs(musicRef) as { notes?: unknown[] } | null;
  if (!tuneNs) {
    errors.push("Missing output/tune.ns.json (required)");
  } else {
    const notes = tuneNs?.notes;
    if (!notes || !Array.isArray(notes) || notes.length === 0) {
      errors.push("tune.ns.json has no notes");
    }
  }

  // Optional but recommended
  const teacher = getTeacher(musicRef);
  if (!teacher) {
    warnings.push("Missing teacher.json (needed for nuggets/assemblies)");
  }

  const tuneXml = getTuneXml(musicRef);
  if (!tuneXml) {
    warnings.push("Missing output/tune.xml");
  }

  const tuneDspXml = getTuneDspXml(musicRef);
  if (!tuneDspXml) {
    warnings.push("Missing output/tune.dsp.xml");
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
};

export const getTeacher = (musicRef: string): Record<string, unknown> | null =>
  getGlobModule(
    teacherModules,
    `/src/music/${musicRef}/teacher.json`,
  ) as Record<string, unknown> | null;

export const getTuneNs = (musicRef: string): object | null =>
  getGlobModule(tuneNsModules, `/src/music/${musicRef}/output/tune.ns.json`);

export const getTuneInst = (musicRef: string, instId: string): object | null =>
  getGlobModule(
    tuneInstModules,
    `/src/music/${musicRef}/output/tune.${instId}.ns.json`,
  );

export const getTuneInst1 = (musicRef: string): object | null =>
  getTuneInst(musicRef, "inst1");

export const getTuneInst2 = (musicRef: string): object | null =>
  getTuneInst(musicRef, "inst2");

export const getTuneLh = (musicRef: string): object | null =>
  getGlobModule(tuneLhModules, `/src/music/${musicRef}/output/tune.lh.ns.json`);

export const getTuneRh = (musicRef: string): object | null =>
  getGlobModule(tuneRhModules, `/src/music/${musicRef}/output/tune.rh.ns.json`);

export const getNuggetNs = (
  musicRef: string,
  nuggetId: string,
): object | null =>
  getGlobModule(
    nuggetNsModules,
    `/src/music/${musicRef}/output/nuggets/${nuggetId}.ns.json`,
  );

export const getNuggetInst = (
  musicRef: string,
  nuggetId: string,
  instId: string,
): object | null =>
  getGlobModule(
    nuggetInstModules,
    `/src/music/${musicRef}/output/nuggets/${nuggetId}.${instId}.ns.json`,
  );

export const getNuggetLh = (
  musicRef: string,
  nuggetId: string,
): object | null =>
  getGlobModule(
    nuggetLhModules,
    `/src/music/${musicRef}/output/nuggets/${nuggetId}.lh.ns.json`,
  );

export const getNuggetRh = (
  musicRef: string,
  nuggetId: string,
): object | null =>
  getGlobModule(
    nuggetRhModules,
    `/src/music/${musicRef}/output/nuggets/${nuggetId}.rh.ns.json`,
  );

export const getAssemblyNs = (
  musicRef: string,
  assemblyId: string,
): object | null =>
  getGlobModule(
    assemblyNsModules,
    `/src/music/${musicRef}/output/assemblies/${assemblyId}.ns.json`,
  );

export const getAssemblyInst = (
  musicRef: string,
  assemblyId: string,
  instId: string,
): object | null =>
  getGlobModule(
    assemblyInstModules,
    `/src/music/${musicRef}/output/assemblies/${assemblyId}.${instId}.ns.json`,
  );

export const getAssemblyLh = (
  musicRef: string,
  assemblyId: string,
): object | null =>
  getGlobModule(
    assemblyLhModules,
    `/src/music/${musicRef}/output/assemblies/${assemblyId}.lh.ns.json`,
  );

export const getAssemblyRh = (
  musicRef: string,
  assemblyId: string,
): object | null =>
  getGlobModule(
    assemblyRhModules,
    `/src/music/${musicRef}/output/assemblies/${assemblyId}.rh.ns.json`,
  );

// XML helper functions
export const getTuneXml = (musicRef: string): string | null => {
  const path = `/src/music/${musicRef}/output/tune.xml`;
  return readAsset(path) as string | null;
};

export const getTuneLhXml = (musicRef: string): string | null => {
  const path = `/src/music/${musicRef}/output/tune.lh.xml`;
  return readAsset(path) as string | null;
};

export const getTuneRhXml = (musicRef: string): string | null => {
  const path = `/src/music/${musicRef}/output/tune.rh.xml`;
  return readAsset(path) as string | null;
};

export const getNuggetXml = (
  musicRef: string,
  nuggetId: string,
): string | null => {
  const path = `/src/music/${musicRef}/output/nuggets/${nuggetId}.xml`;
  return readAsset(path) as string | null;
};

export const getAssemblyXml = (
  musicRef: string,
  assemblyId: string,
): string | null => {
  const path = `/src/music/${musicRef}/output/assemblies/${assemblyId}.xml`;
  return readAsset(path) as string | null;
};

// DSP XML helper functions (display-optimized MusicXML)
export const getTuneDspXml = (musicRef: string): string | null => {
  const path = `/src/music/${musicRef}/output/tune.dsp.xml`;
  return readAsset(path) as string | null;
};

export const getNuggetDspXml = (
  musicRef: string,
  nuggetId: string,
): string | null => {
  const path = `/src/music/${musicRef}/output/nuggets/${nuggetId}.dsp.xml`;
  return readAsset(path) as string | null;
};

export const getAssemblyDspXml = (
  musicRef: string,
  assemblyId: string,
): string | null => {
  const path = `/src/music/${musicRef}/output/assemblies/${assemblyId}.dsp.xml`;
  return readAsset(path) as string | null;
};

// Get local tune briefing (teachingOrder, assemblyOrder, etc.)
export const getLocalBriefing = (musicRef: string): TuneBriefing | null => {
  const teacher = getTeacher(musicRef);
  if (!teacher) return null;
  return {
    title: teacher.title as string | undefined,
    teachingOrder: teacher.teachingOrder as string[] | undefined,
    assemblyOrder: teacher.assemblyOrder as string[] | undefined,
  };
};

// Get local nuggets data (for dropdown population)
export const getLocalNuggetIds = (musicRef: string): string[] => {
  return getLocalNuggetMenuItems(musicRef).map((item) => item.id);
};

export interface TuneMenuNuggetItem {
  id: string;
  label: string;
  subtitle?: string;
}

export function formatNuggetLocationSubtitle(
  location?: Record<string, unknown> | null,
): string | undefined {
  if (!location || typeof location.startMeasure !== "number") return undefined;
  const sm = location.startMeasure as number;
  const em = location.endMeasure;
  if (typeof em === "number" && em !== sm) return `m. ${sm}–${em}`;
  return `m. ${sm}`;
}

/** Ordered nugget rows for Lab UI (labels from teacher.json). */
export const getLocalNuggetMenuItems = (musicRef: string): TuneMenuNuggetItem[] => {
  const teacher = getTeacher(musicRef);
  if (!teacher) return [];
  const teachingOrder = teacher.teachingOrder as string[] | undefined;
  const nuggets = teacher.nuggets as
    | Array<{ id: string; label?: string; location?: Record<string, unknown> }>
    | undefined;
  const byId = new Map((nuggets ?? []).map((n) => [n.id, n]));
  const order =
    teachingOrder && teachingOrder.length > 0
      ? teachingOrder
      : (nuggets ?? []).map((n) => n.id);
  return order.map((id) => {
    const n = byId.get(id);
    return {
      id,
      label: (n?.label as string | undefined) || id,
      subtitle: formatNuggetLocationSubtitle(n?.location ?? null),
    };
  });
};

export interface TuneMenuAssemblyItem {
  id: string;
  label: string;
  tier?: number;
  subtitle?: string;
}

// Get local assembly IDs (for dropdown population)
export const getLocalAssemblyIds = (musicRef: string): string[] => {
  return getLocalAssemblyMenuItems(musicRef).map((item) => item.id);
};

/** Ordered assembly rows for Lab UI (tiers / labels from teacher.json). */
export const getLocalAssemblyMenuItems = (
  musicRef: string,
): TuneMenuAssemblyItem[] => {
  const teacher = getTeacher(musicRef);
  if (!teacher) return [];
  const assemblyOrder = teacher.assemblyOrder as string[] | undefined;
  const assemblies = teacher.assemblies as
    | Array<{ id: string; label?: string; tier?: number }>
    | undefined;
  const byId = new Map((assemblies ?? []).map((a) => [a.id, a]));
  const order =
    assemblyOrder && assemblyOrder.length > 0
      ? assemblyOrder
      : (assemblies ?? []).map((a) => a.id);
  return order.map((id) => {
    const a = byId.get(id);
    const tier = a?.tier;
    return {
      id,
      label: (a?.label as string | undefined) || id,
      tier,
      subtitle: tier != null ? `Tier ${tier}` : undefined,
    };
  });
};

// Type for bundled tune assets matching the edge function interface
export interface TuneAssetBundle {
  briefing?: {
    schemaVersion?: string;
    title?: string;
    pipelineSettings?: Record<string, unknown>;
    motifs?: unknown;
    motifOccurrences?: Array<Record<string, unknown>>;
    tuneHints?: unknown;
    teachingOrder?: string[];
    assemblyOrder?: string[];
  };
  nuggets?: Array<{
    id: string;
    label?: string;
    location?: Record<string, unknown>;
    dependsOn?: string[];
    modes?: string[];
    noteSequence?: object;
    leftHandSequence?: object;
    rightHandSequence?: object;
  }>;
  assemblies?: Array<{
    id: string;
    tier?: number;
    label?: string;
    nuggetIds?: string[];
    difficulty?: { level: number };
    modes?: string[];
    noteSequence?: object;
    leftHandSequence?: object;
    rightHandSequence?: object;
  }>;
  noteSequence: Record<string, unknown>;
  leftHandSequence?: Record<string, unknown>;
  rightHandSequence?: Record<string, unknown>;
  tuneXml?: string;
  nuggetXmls?: Record<string, string>;
  assemblyXmls?: Record<string, string>;
  tuneDspXml?: string;
  nuggetDspXmls?: Record<string, string>;
  assemblyDspXmls?: Record<string, string>;
}

// Bundle a single tune's assets for publishing
export const bundleSingleTuneAssets = (
  musicRef: string,
): TuneAssetBundle | null => {
  try {
    const teacher = getTeacher(musicRef);
    const noteSequence = getTuneNs(musicRef) as {
      notes?: unknown[];
    } | null;
    const leftHand = getTuneLh(musicRef);
    const rightHand = getTuneRh(musicRef);

    // VALIDATION: Check that noteSequence was loaded
    if (!noteSequence) {
      console.error(
        `[tuneAssetBundler] Failed to load note sequence for musicRef: ${musicRef}`,
      );
      return null;
    }

    // VALIDATION: Check that noteSequence has notes
    if (
      !noteSequence.notes ||
      !Array.isArray(noteSequence.notes) ||
      noteSequence.notes.length === 0
    ) {
      console.error(
        `[tuneAssetBundler] Note sequence for ${musicRef} has no notes`,
      );
      return null;
    }

    // Load nugget note sequences
    let enrichedNuggets: TuneAssetBundle["nuggets"] = undefined;
    const teacherNuggets = teacher?.nuggets as
      | Array<{
          id: string;
          label: string;
          location?: Record<string, unknown>;
          dependsOn?: string[];
          modes?: string[];
        }>
      | undefined;
    if (teacherNuggets && Array.isArray(teacherNuggets)) {
      enrichedNuggets = teacherNuggets.map((nugget) => ({
        id: nugget.id,
        label: nugget.label,
        location: nugget.location,
        dependsOn: nugget.dependsOn,
        modes: nugget.modes,
        noteSequence: getNuggetNs(musicRef, nugget.id),
        leftHandSequence: getNuggetLh(musicRef, nugget.id),
        rightHandSequence: getNuggetRh(musicRef, nugget.id),
      }));
    }

    // Load assembly note sequences
    let enrichedAssemblies: TuneAssetBundle["assemblies"] = undefined;
    const teacherAssemblies = teacher?.assemblies as
      | Array<{
          id: string;
          tier: number;
          label: string;
          nuggetIds: string[];
          difficulty?: { level: number };
          modes?: string[];
        }>
      | undefined;
    if (teacherAssemblies && Array.isArray(teacherAssemblies)) {
      enrichedAssemblies = teacherAssemblies.map((assembly) => ({
        id: assembly.id,
        tier: assembly.tier,
        label: assembly.label,
        nuggetIds: assembly.nuggetIds,
        difficulty: assembly.difficulty,
        modes: assembly.modes,
        noteSequence: getAssemblyNs(musicRef, assembly.id),
        leftHandSequence: getAssemblyLh(musicRef, assembly.id),
        rightHandSequence: getAssemblyRh(musicRef, assembly.id),
      }));
    }

    // Collect XML content
    const tuneXml = getTuneXml(musicRef);

    // Build nugget XMLs map
    const nuggetXmls: Record<string, string> = {};
    if (teacherNuggets) {
      for (const nugget of teacherNuggets) {
        const xml = getNuggetXml(musicRef, nugget.id);
        if (xml) nuggetXmls[nugget.id] = xml;
      }
    }

    // Build assembly XMLs map
    const assemblyXmls: Record<string, string> = {};
    if (teacherAssemblies) {
      for (const assembly of teacherAssemblies) {
        const xml = getAssemblyXml(musicRef, assembly.id);
        if (xml) assemblyXmls[assembly.id] = xml;
      }
    }

    // Collect DSP XML content
    const tuneDspXml = getTuneDspXml(musicRef);

    // Build nugget DSP XMLs map (includes .lh and .rh variants)
    const nuggetDspXmls: Record<string, string> = {};
    if (teacherNuggets) {
      for (const nugget of teacherNuggets) {
        const dspXml = getNuggetDspXml(musicRef, nugget.id);
        if (dspXml) nuggetDspXmls[nugget.id] = dspXml;
        const lhDspXml = getNuggetDspXml(musicRef, `${nugget.id}.lh`);
        if (lhDspXml) nuggetDspXmls[`${nugget.id}.lh`] = lhDspXml;
        const rhDspXml = getNuggetDspXml(musicRef, `${nugget.id}.rh`);
        if (rhDspXml) nuggetDspXmls[`${nugget.id}.rh`] = rhDspXml;
      }
    }

    // Build assembly DSP XMLs map (includes .lh and .rh variants)
    const assemblyDspXmls: Record<string, string> = {};
    if (teacherAssemblies) {
      for (const assembly of teacherAssemblies) {
        const dspXml = getAssemblyDspXml(musicRef, assembly.id);
        if (dspXml) assemblyDspXmls[assembly.id] = dspXml;
        const lhDspXml = getAssemblyDspXml(musicRef, `${assembly.id}.lh`);
        if (lhDspXml) assemblyDspXmls[`${assembly.id}.lh`] = lhDspXml;
        const rhDspXml = getAssemblyDspXml(musicRef, `${assembly.id}.rh`);
        if (rhDspXml) assemblyDspXmls[`${assembly.id}.rh`] = rhDspXml;
      }
    }

    return {
      briefing: teacher
        ? {
            schemaVersion: teacher.schemaVersion as string | undefined,
            title: teacher.title as string | undefined,
            pipelineSettings: teacher.pipelineSettings as
              | Record<string, unknown>
              | undefined,
            motifs: teacher.motifs,
            motifOccurrences: teacher.motifOccurrences as
              | Array<Record<string, unknown>>
              | undefined,
            tuneHints: teacher.tuneHints,
            teachingOrder: teacher.teachingOrder as string[] | undefined,
            assemblyOrder: teacher.assemblyOrder as string[] | undefined,
          }
        : undefined,
      nuggets: enrichedNuggets,
      assemblies: enrichedAssemblies,
      noteSequence,
      leftHandSequence: leftHand as Record<string, unknown> | undefined,
      rightHandSequence: rightHand as Record<string, unknown> | undefined,
      tuneXml: tuneXml || undefined,
      nuggetXmls: Object.keys(nuggetXmls).length > 0 ? nuggetXmls : undefined,
      assemblyXmls:
        Object.keys(assemblyXmls).length > 0 ? assemblyXmls : undefined,
      tuneDspXml: tuneDspXml || undefined,
      nuggetDspXmls:
        Object.keys(nuggetDspXmls).length > 0 ? nuggetDspXmls : undefined,
      assemblyDspXmls:
        Object.keys(assemblyDspXmls).length > 0 ? assemblyDspXmls : undefined,
    };
  } catch (error) {
    console.error(
      `[tuneAssetBundler] Failed to bundle assets for ${musicRef}:`,
      error,
    );
    return null;
  }
};
