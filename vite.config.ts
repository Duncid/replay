import { defineConfig, type Plugin } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

import manifestBase from "./src/lib/manifestBase.json" with { type: "json" };
import en from "./src/locales/en/common.json" with { type: "json" };
import fr from "./src/locales/fr/common.json" with { type: "json" };
import it from "./src/locales/it/common.json" with { type: "json" };

// Supply real US metadata before JavaScript runs, including to social crawlers.
function localizedMetadata(): Plugin {
  const manifests = new Map([
    ["manifest.json", { ...manifestBase, lang: "en-US", description: en.landing.description }],
    ["manifest.fr-FR.json", { ...manifestBase, lang: "fr-FR", description: fr.landing.description }],
    ["manifest.it-IT.json", { ...manifestBase, lang: "it-IT", description: it.landing.description }],
  ]);
  const escapeAttribute = (text: string) => text.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  return {
    name: "localized-metadata",
    transformIndexHtml: html => html.replaceAll("__APP_DESCRIPTION__", escapeAttribute(en.landing.description))
      .replaceAll("__APP_IMAGE_ALT__", escapeAttribute(en.landing.socialImage)),
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const manifest = manifests.get(req.url?.split("?")[0].slice(1) ?? "");
        if (!manifest) return next();
        res.setHeader("Content-Type", "application/manifest+json");
        res.end(JSON.stringify(manifest));
      });
    },
    generateBundle() {
      for (const [fileName, manifest] of manifests) {
        this.emitFile({ type: "asset", fileName, source: JSON.stringify(manifest) });
      }
    },
  };
}

export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    // Lovable serves this OAuth endpoint; Vite must not send it to the SPA's 404.
    proxy: {
      "^/~oauth/initiate(?:\\?|$)": {
        target: "https://improv-jam-bot.lovable.app",
        changeOrigin: true,
      },
    },
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  plugins: [localizedMetadata(), react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
  build: {
    // iPadOS 26.2+ and current evergreen desktop browsers.
    target: ["safari26.2", "chrome130", "firefox128"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
