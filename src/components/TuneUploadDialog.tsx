import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePublishedTuneKeys } from "@/hooks/useTuneQueries";
import { startTuneUpload } from "@/hooks/useActiveTuneBuilds";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { readMusicXmlMetadata, titleCase } from "@/utils/musicXmlMetadata";

export const toTuneKey = (title: string) =>
  title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

/** Name the tune; pressing Build closes the window and the tune list card shows the progress. */
export function TuneUploadDialog({ open, onOpenChange, file }: { open: boolean; onOpenChange: (o: boolean) => void; file: File | null; onStarted?: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [composer, setComposer] = useState("");
  const [readingMetadata, setReadingMetadata] = useState(false);
  const { data: published = [] } = usePublishedTuneKeys();
  const key = toTuneKey(title);
  const exists = published.some((t) => t.tune_key === key);

  useEffect(() => {
    if (!open || !file) return;
    let cancelled = false;
    const fallback = titleCase(file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim()).slice(0, 120);
    setTitle(fallback); setComposer(""); setReadingMetadata(true);
    readMusicXmlMetadata(file).then(metadata => {
      if (cancelled) return;
      setTitle((metadata.title || fallback).slice(0, 120));
      setComposer((metadata.composer || "").slice(0, 300));
    }).catch(() => {
      // A missing or malformed credit should not block the normal upload flow.
    }).finally(() => { if (!cancelled) setReadingMetadata(false); });
    return () => { cancelled = true; };
  }, [open, file]);

  const handleBuild = () => {
    if (!file || !key || readingMetadata) return;
    startTuneUpload(qc, { file, tuneKey: key, title: titleCase(title.trim()), composer: composer.trim() });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("upload.name")}</DialogTitle>
          <DialogDescription>{file?.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4" aria-busy={readingMetadata}>
          <div className="space-y-1">
            <Label htmlFor="tune-title">{t("upload.title")}</Label>
            <Input id="tune-title" autoFocus value={title} maxLength={120} disabled={readingMetadata} onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && key) handleBuild(); }} />
            {exists && <p className="text-xs text-muted-foreground">{t("upload.exists")}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="tune-composer">{t("upload.composer")}</Label>
            <Input id="tune-composer" value={composer} maxLength={300} disabled={readingMetadata} onChange={(e) => setComposer(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && key) handleBuild(); }} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button disabled={!file || !key || readingMetadata} onClick={handleBuild}>{t("upload.build")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
