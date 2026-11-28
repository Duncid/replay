import { useTranslation } from "react-i18next";
import { lazy, Suspense, useRef, useState } from "react";
import { toast } from "sonner";
import { tuneDisplayTitle } from "@/utils/tunePreview";
import { AddTuneStartDialog } from "@/components/AddTuneStartDialog";
import { TuneUploadDialog } from "@/components/TuneUploadDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useTuneLibrary } from "@/hooks/useTuneLibrary";
import { useActiveTuneBuilds } from "@/hooks/useActiveTuneBuilds";
import { TuneLibraryView } from "./TuneLibraryView";
import { LoadingSpinner } from "./LoadingSpinner";

const GuestTuneLibrary = lazy(() => import("./GuestTuneLibrary"));

interface TuneLibraryProps {
  localUserId?: string | null;
  profileLoading?: boolean;
  onSelectTune: (tuneKey: string) => void;
  onSignUp?: () => void;
  previewPaused?: boolean;
}
export function TuneLibrary({ localUserId, profileLoading, onSelectTune, onSignUp, previewPaused }: TuneLibraryProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  if (!user) return <Suspense fallback={<LoadingSpinner message={t("library.loadingMusic")} />}><GuestTuneLibrary onSelectTune={onSelectTune} onSignUp={onSignUp} previewPaused={previewPaused} /></Suspense>;
  return <AccountTuneLibrary localUserId={localUserId} profileLoading={profileLoading} onSelectTune={onSelectTune} />;
}

function AccountTuneLibrary({ localUserId, profileLoading, onSelectTune }: TuneLibraryProps) {
  const { t } = useTranslation();
  const library = useTuneLibrary(localUserId);
  const { user } = useAuth();
  const active = useActiveTuneBuilds();
  const [introOpen, setIntroOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  if (!profileLoading && !localUserId) return <p role="alert" className="p-8 text-center text-muted-foreground">{t("library.profile")}</p>;
  return (
    <>
      {user && (
        <>
          {/* The CTA opens the start screen first; the picker follows from its button. */}
          <input ref={uploadInputRef} type="file" accept=".mxl,.xml,.musicxml" className="hidden" data-testid="tune-upload-input-carousel"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) { setIntroOpen(false); setUploadFile(f); setUploadOpen(true); }
            }} />
          <AddTuneStartDialog open={introOpen} onOpenChange={setIntroOpen} onPickFile={() => uploadInputRef.current?.click()}
            hiddenTunes={library.hiddenTunes} onAddBack={key => library.showTune(key).catch(e => toast.error(e.message))} />
          <TuneUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} file={uploadFile} onStarted={() => active.refetch()} />
        </>
      )}
      <TuneLibraryView {...library} isLoading={library.isLoading || profileLoading} onSelectTune={onSelectTune}
        onAddTune={user ? () => setIntroOpen(true) : undefined}
        onRemoveTune={tune => {
          const name = tune.title?.trim() || tuneDisplayTitle(tune.tune_key);
          if (tune.isSystem) {
            void library.hideTune(tune.tune_key).then(() => toast.success(t("library.removed", { title: name })), e => toast.error(e.message));
          } else if (confirm(t("library.confirmDelete", { title: name }))) {
            void library.deleteTune(tune.tune_key).then(() => toast.success(t("library.deleted", { title: name })), e => toast.error(e.message));
          }
        }}
        builds={active.builds} onRetryBuild={active.retry} onDismissBuild={active.dismiss} />
    </>
  );
}
