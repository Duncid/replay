import { useTranslation } from "react-i18next";
import { lazy, Suspense } from "react";
import type { SheetMusicProps } from "./SheetMusicRenderer";

const Renderer = lazy(() => import("./SheetMusicRenderer").then(module => ({ default: module.SheetMusic })));

export function SheetMusic(props: SheetMusicProps) {
  const { t } = useTranslation();
  return (
    <Suspense fallback={<div className="min-h-16" aria-busy="true" aria-label={t("practice.notation")} />}>
      <Renderer {...props} />
    </Suspense>
  );
}
