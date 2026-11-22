import { useTuneLibrary } from "@/hooks/useTuneLibrary";
import { TuneLibraryView } from "./TuneLibraryView";

interface TuneLibraryProps {
  localUserId?: string | null;
  onSelectTune: (tuneKey: string) => void;
}
export function TuneLibrary({ localUserId, onSelectTune }: TuneLibraryProps) {
  const library = useTuneLibrary(localUserId);
  return <TuneLibraryView {...library} onSelectTune={onSelectTune} />;
}
