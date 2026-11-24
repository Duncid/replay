import { useTuneLibrary } from "@/hooks/useTuneLibrary";
import { TuneLibraryView } from "./TuneLibraryView";

interface TuneLibraryProps {
  localUserId?: string | null;
  profileLoading?: boolean;
  onSelectTune: (tuneKey: string) => void;
}
export function TuneLibrary({ localUserId, profileLoading, onSelectTune }: TuneLibraryProps) {
  const library = useTuneLibrary(localUserId);
  if (!profileLoading && !localUserId) return <p role="alert" className="p-8 text-center text-muted-foreground">Choose or create a practice profile from the Menu to play.</p>;
  return <TuneLibraryView {...library} isLoading={library.isLoading || profileLoading} onSelectTune={onSelectTune} />;
}
