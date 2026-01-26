import { useEffect, useRef, useState } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { getTuneXml } from "@/utils/tuneAssetGlobs";

export const LabMode = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initOsmd = async () => {
      if (!containerRef.current) return;

      const xml = getTuneXml("intro");
      if (!xml) {
        setError("Intro tune XML not found");
        setIsLoading(false);
        return;
      }

      try {
        const osmd = new OpenSheetMusicDisplay(containerRef.current, {
          autoResize: true,
          backend: "svg",
          drawTitle: true,
        });

        await osmd.load(xml);
        osmd.render();
        osmdRef.current = osmd;
        setIsLoading(false);
      } catch (err) {
        console.error("[LabMode] OSMD error:", err);
        setError(err instanceof Error ? err.message : "Failed to render sheet music");
        setIsLoading(false);
      }
    };

    initOsmd();

    return () => {
      osmdRef.current = null;
    };
  }, []);

  return (
    <div className="w-full h-full flex flex-col items-center justify-start p-4 overflow-auto">
      <h2 className="text-lg font-semibold mb-4">Lab: OSMD Sheet Music</h2>

      {isLoading && <p className="text-muted-foreground">Loading sheet music...</p>}
      {error && <p className="text-destructive">{error}</p>}

      <div
        ref={containerRef}
        className="w-full bg-white rounded-lg p-4"
        style={{ minHeight: 400 }}
      />
    </div>
  );
};
