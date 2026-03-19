import "@capacitor/core";
import "./lib/webMidiIosPolyfill";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./lib/i18n";

// Set safe area fallback for Capacitor iOS (env() often returns 0 in WKWebView)
if (typeof window !== "undefined") {
  const cap = (window as any).Capacitor;
  if (cap?.isNativePlatform?.()) {
    document.documentElement.style.setProperty(
      "--safe-area-inset-top",
      "24px",
    );
  }
}

createRoot(document.getElementById("root")!).render(<App />);
