import { lazy, Suspense } from "react";
import type { SheetMusicProps } from "./SheetMusicRenderer";

const Renderer = lazy(() => import("./SheetMusicRenderer").then(module => ({ default: module.SheetMusic })));

export function SheetMusic(props: SheetMusicProps) {
  return (
    <Suspense fallback={<div className="min-h-16" aria-busy="true" aria-label="Loading notation" />}>
      <Renderer {...props} />
    </Suspense>
  );
}
