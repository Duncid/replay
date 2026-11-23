import { useLayoutEffect, useState } from "react";

/** Extend a practice canvas to its workspace's top without moving the hit line.
 * Observe layout only; playback never drives React measurements or state updates.
 */
export function useHighwayTopBleed(enabled = true) {
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const [topBleed, setTopBleed] = useState(0);
  useLayoutEffect(() => {
    const surface = stage?.closest<HTMLElement>("[data-highway-surface]");
    if (!enabled || !stage || !surface) { setTopBleed(0); return; }
    const measure = () => setTopBleed(Math.max(0, stage.getBoundingClientRect().top - surface.getBoundingClientRect().top));
    const observer = new ResizeObserver(measure);
    // Ancestors account for wrapping controls, coaching text, safe areas and resizing.
    for (let node: HTMLElement | null = stage; node; node = node.parentElement) {
      observer.observe(node);
      if (node === surface) break;
    }
    measure();
    return () => observer.disconnect();
  }, [stage, enabled]);
  return { stageRef: setStage, topBleed };
}
