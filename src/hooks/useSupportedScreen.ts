import { useSyncExternalStore } from "react";

export function isSupportedScreen(viewportWidth: number, screenWidth: number, screenHeight: number): boolean {
  return viewportWidth >= 700 && Math.min(screenWidth, screenHeight) >= 600;
}

function subscribe(onChange: () => void) {
  window.addEventListener("resize", onChange);
  window.addEventListener("orientationchange", onChange);
  window.screen.orientation?.addEventListener("change", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    window.removeEventListener("orientationchange", onChange);
    window.screen.orientation?.removeEventListener("change", onChange);
  };
}

// Layout width, not visualViewport, keeps the software keyboard and pinch zoom
// from changing eligibility. Screen dimensions also catch landscape phones.
const getSnapshot = () => isSupportedScreen(window.innerWidth, window.screen.width, window.screen.height);

export function useSupportedScreen() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
