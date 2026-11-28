import manifestBase from "./manifestBase.json";
import { bundledStrings, US } from "./languages";

export function updateLocalizedMetadata(locale: string, description: string, imageAlt: string) {
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]')) {
    meta.content = description;
  }
  document.querySelector<HTMLMetaElement>('meta[property="og:image:alt"]')?.setAttribute("content", imageAlt);
  const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!link) return;
  if (bundledStrings[locale]?.["landing.description"] === description) {
    link.href = locale === US ? "/manifest.json" : "/manifest.fr-FR.json";
    return;
  }
  // Additional languages and live admin edits can differ from the shipped manifests.
  // An inline manifest needs absolute URLs to retain the same install identity and scope.
  const absolute = (path: string) => new URL(path, location.origin).href;
  const manifest = { ...manifestBase, lang: locale, description, id: absolute(manifestBase.id),
    start_url: absolute(manifestBase.start_url), scope: absolute(manifestBase.scope),
    icons: manifestBase.icons.map(icon => ({ ...icon, src: absolute(icon.src) })) };
  link.href = "data:application/manifest+json," + encodeURIComponent(JSON.stringify(manifest));
}
