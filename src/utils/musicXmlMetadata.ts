import JSZip from "jszip";

export interface ScoreMetadata { title: string | null; composer: string | null }

export function parseMusicXmlMetadata(xml: string): ScoreMetadata {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) return { title: null, composer: null };
  const root = doc.documentElement;
  if (!["score-partwise", "score-timewise"].includes(root.localName)) return { title: null, composer: null };
  const child = (parent: Element, name: string) => Array.from(parent.children).find(el => el.localName === name);
  const work = child(root, "work");
  const title = work ? child(work, "work-title")?.textContent?.trim() : null;
  const identification = child(root, "identification");
  const composers = Array.from(identification?.children ?? [])
    .filter(el => el.localName === "creator" && el.getAttribute("type")?.toLowerCase() === "composer")
    .map(el => (el.textContent ?? "").replace(/\s*\([0-9]{4}[^)]*\)\s*$/, "").trim())
    .filter(name => name && !["music21", "musescore", "unknown", "composer"].includes(name.toLowerCase()));
  return { title: title || child(root, "movement-title")?.textContent?.trim() || null,
    composer: Array.from(new Set(composers)).sort().join("; ") || null };
}

export async function readMusicXmlMetadata(file: File): Promise<ScoreMetadata> {
  let xml: string;
  if (/\.mxl$/i.test(file.name)) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const container = zip.file("META-INF/container.xml");
    const doc = container ? new DOMParser().parseFromString(await container.async("string"), "application/xml") : null;
    const roots = doc ? Array.from(doc.getElementsByTagNameNS("*", "rootfile")) : [];
    const root = roots.find(el => el.getAttribute("media-type") === "application/vnd.recordare.musicxml+xml") ?? roots[0];
    const path = root?.getAttribute("full-path");
    const score = path ? zip.file(path) : Object.values(zip.files).find(entry => !entry.dir && !entry.name.startsWith("META-INF/") && /\.(xml|musicxml)$/i.test(entry.name));
    if (!score || score.dir) return { title: null, composer: null };
    xml = await score.async("string");
  } else {
    xml = await file.text();
  }
  return parseMusicXmlMetadata(xml);
}