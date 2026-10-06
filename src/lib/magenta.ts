import type { MagentaApi } from "@/types/magenta";

declare global {
  interface Window {
    mm: MagentaApi;
  }
}

// Load Magenta from CDN (UMD bundle for browser compatibility)
let loadingPromise: Promise<void> | null = null;

export const loadMagentaScript = (): Promise<void> => {
  if (window.mm) return Promise.resolve();
  if (loadingPromise) return loadingPromise;
  loadingPromise = new Promise((resolve, reject) => {
    // Use the full UMD bundle which includes all modules
    const script = document.createElement("script");
    const fail = (message: string) => {
      clearTimeout(timeout);
      script.remove();
      loadingPromise = null;
      reject(new Error(message));
    };
    const timeout = setTimeout(() => fail("Magenta loading timed out. Please retry."), 15_000);
    script.src = "https://cdn.jsdelivr.net/npm/@magenta/music@1.23.1/dist/magentamusic.min.js";
    script.async = true;
    script.onload = () => {
      if (window.mm) {
        clearTimeout(timeout);
        console.log("[Magenta] UMD bundle loaded successfully");
        resolve();
      } else {
        fail("Magenta loaded but mm object not found");
      }
    };
    script.onerror = () => fail("Failed to load Magenta script");
    document.head.appendChild(script);
  });
  return loadingPromise;
};
