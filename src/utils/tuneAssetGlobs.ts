// Centralized Vite glob imports for tune XML assets
// These are loaded at build time as raw strings for sheet music rendering

const tuneXmlModules = import.meta.glob<string>(
  "/src/music/*/output/tune.xml",
  { eager: true, query: "?raw", import: "default" }
);

export const getTuneXml = (musicRef: string): string | null => {
  const path = `/src/music/${musicRef}/output/tune.xml`;
  return tuneXmlModules[path] || null;
};
