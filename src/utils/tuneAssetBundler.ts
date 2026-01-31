// Centralized Vite glob imports for tune assets
// These are loaded at build time for local music files

import type { NoteSequence } from "@/types/noteSequence";
import type { TuneAssembly, TuneBriefing, TuneNugget } from "@/types/tuneAssets";

// Auto-discover all teacher.json files at build time
const teacherModules = import.meta.glob<{ default: Record<string, unknown> }>(
  "/src/music/*/teacher.json",
  { eager: true }
);

// Pre-load all tune note sequences at build time
const tuneNsModules = import.meta.glob<{ default: object }>(
  "/src/music/*/output/tune.ns.json",
  { eager: true }
);

const tuneLhModules = import.meta.glob<{ default: object }>(
  "/src/music/*/output/tune.lh.ns.json",
  { eager: true }
);

const tuneRhModules = import.meta.glob<{ default: object }>(
  "/src/music/*/output/tune.rh.ns.json",
  { eager: true }
);

// Pre-load all nugget note sequences
const nuggetNsModules = import.meta.glob<{ default: object }>(
  "/src/music/*/output/nuggets/*.ns.json",
  { eager: true }
);

const nuggetLhModules = import.meta.glob<{ default: object }>(
  "/src/music/*/output/nuggets/*.lh.ns.json",
  { eager: true }
);

const nuggetRhModules = import.meta.glob<{ default: object }>(
  "/src/music/*/output/nuggets/*.rh.ns.json",
  { eager: true }
);

// Pre-load all assembly note sequences
const assemblyNsModules = import.meta.glob<{ default: object }>(
  "/src/music/*/output/assemblies/*.ns.json",
  { eager: true }
);

const assemblyLhModules = import.meta.glob<{ default: object }>(
  "/src/music/*/output/assemblies/*.lh.ns.json",
  { eager: true }
);

const assemblyRhModules = import.meta.glob<{ default: object }>(
  "/src/music/*/output/assemblies/*.rh.ns.json",
  { eager: true }
);

// Pre-load all XML files at build time (for sheet music rendering)
const tuneXmlModules = import.meta.glob<string>(
  "/src/music/*/output/tune.xml",
  { eager: true, query: "?raw", import: "default" }
);

const nuggetXmlModules = import.meta.glob<string>(
  "/src/music/*/output/nuggets/*.xml",
  { eager: true, query: "?raw", import: "default" }
);

const assemblyXmlModules = import.meta.glob<string>(
  "/src/music/*/output/assemblies/*.xml",
  { eager: true, query: "?raw", import: "default" }
);

// Pre-load all DSP XML files at build time (display-optimized MusicXML)
const tuneDspXmlModules = import.meta.glob<string>(
  "/src/music/*/output/dsp.xml",
  { eager: true, query: "?raw", import: "default" }
);

// Match all *.dsp.xml files in nuggets (includes N1.dsp.xml, N1.lh.dsp.xml, N1.rh.dsp.xml)
const nuggetDspXmlModules = import.meta.glob<string>(
  "/src/music/*/output/nuggets/*.dsp.xml",
  { eager: true, query: "?raw", import: "default" }
);

// Match all *.dsp.xml files in assemblies
const assemblyDspXmlModules = import.meta.glob<string>(
  "/src/music/*/output/assemblies/*.dsp.xml",
  { eager: true, query: "?raw", import: "default" }
);

// Helper to get module from glob by path
const getGlobModule = (
  modules: Record<string, { default?: object }>,
  path: string
): object | null => {
  const module = modules[path];
  return module?.default || (module as unknown as object) || null;
};

// Export local tune keys discovered from file system
export const getLocalTuneKeys = (): string[] => {
  return Object.keys(teacherModules)
    .map((path) => {
      const match = path.match(/\/music\/([^/]+)\/teacher\.json$/);
      return match ? match[1] : null;
    })
    .filter(Boolean) as string[];
};

export const getTeacher = (musicRef: string): Record<string, unknown> | null =>
  getGlobModule(
    teacherModules,
    `/src/music/${musicRef}/teacher.json`
  ) as Record<string, unknown> | null;

export const getTuneNs = (musicRef: string): object | null =>
  getGlobModule(tuneNsModules, `/src/music/${musicRef}/output/tune.ns.json`);

export const getTuneLh = (musicRef: string): object | null =>
  getGlobModule(tuneLhModules, `/src/music/${musicRef}/output/tune.lh.ns.json`);

export const getTuneRh = (musicRef: string): object | null =>
  getGlobModule(tuneRhModules, `/src/music/${musicRef}/output/tune.rh.ns.json`);

export const getNuggetNs = (musicRef: string, nuggetId: string): object | null =>
  getGlobModule(
    nuggetNsModules,
    `/src/music/${musicRef}/output/nuggets/${nuggetId}.ns.json`
  );

export const getNuggetLh = (musicRef: string, nuggetId: string): object | null =>
  getGlobModule(
    nuggetLhModules,
    `/src/music/${musicRef}/output/nuggets/${nuggetId}.lh.ns.json`
  );

export const getNuggetRh = (musicRef: string, nuggetId: string): object | null =>
  getGlobModule(
    nuggetRhModules,
    `/src/music/${musicRef}/output/nuggets/${nuggetId}.rh.ns.json`
  );

export const getAssemblyNs = (
  musicRef: string,
  assemblyId: string
): object | null =>
  getGlobModule(
    assemblyNsModules,
    `/src/music/${musicRef}/output/assemblies/${assemblyId}.ns.json`
  );

export const getAssemblyLh = (
  musicRef: string,
  assemblyId: string
): object | null =>
  getGlobModule(
    assemblyLhModules,
    `/src/music/${musicRef}/output/assemblies/${assemblyId}.lh.ns.json`
  );

export const getAssemblyRh = (
  musicRef: string,
  assemblyId: string
): object | null =>
  getGlobModule(
    assemblyRhModules,
    `/src/music/${musicRef}/output/assemblies/${assemblyId}.rh.ns.json`
  );

// XML helper functions
export const getTuneXml = (musicRef: string): string | null => {
  const path = `/src/music/${musicRef}/output/tune.xml`;
  return tuneXmlModules[path] || null;
};

export const getNuggetXml = (
  musicRef: string,
  nuggetId: string
): string | null => {
  const path = `/src/music/${musicRef}/output/nuggets/${nuggetId}.xml`;
  return nuggetXmlModules[path] || null;
};

export const getAssemblyXml = (
  musicRef: string,
  assemblyId: string
): string | null => {
  const path = `/src/music/${musicRef}/output/assemblies/${assemblyId}.xml`;
  return assemblyXmlModules[path] || null;
};

// DSP XML helper functions (display-optimized MusicXML)
export const getTuneDspXml = (musicRef: string): string | null => {
  const path = `/src/music/${musicRef}/output/dsp.xml`;
  return tuneDspXmlModules[path] || null;
};

export const getNuggetDspXml = (
  musicRef: string,
  nuggetId: string
): string | null => {
  const path = `/src/music/${musicRef}/output/nuggets/${nuggetId}.dsp.xml`;
  return nuggetDspXmlModules[path] || null;
};

export const getAssemblyDspXml = (
  musicRef: string,
  assemblyId: string
): string | null => {
  const path = `/src/music/${musicRef}/output/assemblies/${assemblyId}.dsp.xml`;
  return assemblyDspXmlModules[path] || null;
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
  const teacher = getTeacher(musicRef);
  if (!teacher) return [];
  const teachingOrder = teacher.teachingOrder as string[] | undefined;
  if (teachingOrder) return teachingOrder;
  
  const nuggets = teacher.nuggets as Array<{ id: string }> | undefined;
  return nuggets?.map((n) => n.id) ?? [];
};

// Get local assembly IDs (for dropdown population)
export const getLocalAssemblyIds = (musicRef: string): string[] => {
  const teacher = getTeacher(musicRef);
  if (!teacher) return [];
  const assemblyOrder = teacher.assemblyOrder as string[] | undefined;
  if (assemblyOrder) return assemblyOrder;
  
  const assemblies = teacher.assemblies as Array<{ id: string }> | undefined;
  return assemblies?.map((a) => a.id) ?? [];
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
  musicRef: string
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
        `[tuneAssetBundler] Failed to load note sequence for musicRef: ${musicRef}`
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
        `[tuneAssetBundler] Note sequence for ${musicRef} has no notes`
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
      nuggetXmls:
        Object.keys(nuggetXmls).length > 0 ? nuggetXmls : undefined,
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
      error
    );
    return null;
  }
};
