import { useRef, useState } from "react";
import { TuneUploadDialog } from "@/components/TuneUploadDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useTuneLibrary } from "@/hooks/useTuneLibrary";
import { TuneLibraryView } from "./TuneLibraryView";

interface TuneLibraryProps {
  localUserId?: string | null;
  profileLoading?: boolean;
  onSelectTune: (tuneKey: string) => void;
}
export function TuneLibrary({ localUserId, profileLoading, onSelectTune }: TuneLibraryProps) {
  const library = useTuneLibrary(localUserId);
  const { user } = useAuth();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  if (!profileLoading && !localUserId) return <p role="alert" className="p-8 text-center text-muted-foreground">Choose or create a practice profile from the Menu to play.</p>;
  return (
    <>
      {user && (
        <>
          {/* Same flow as the menu: straight to the file picker, then the dialog. */}
          <input ref={uploadInputRef} type="file" accept=".mxl,.xml,.musicxml" className="hidden" data-testid="tune-upload-input-carousel"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) { setUploadFile(f); setUploadOpen(true); }
            }} />
          <TuneUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} file={uploadFile} />
        </>
      )}
      <TuneLibraryView {...library} isLoading={library.isLoading || profileLoading} onSelectTune={onSelectTune}
        onAddTune={user ? () => uploadInputRef.current?.click() : undefined} />
    </>
  );
}
