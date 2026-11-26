import { guestTunes } from "@/music/guestLibrary";
import { TuneLibraryView } from "./TuneLibraryView";

export default function GuestTuneLibrary({ onSelectTune }: { onSelectTune: (key: string) => void }) {
  return <TuneLibraryView tunes={guestTunes} refetch={() => {}}
    onSelectTune={key => { if (key === "intro") onSelectTune(key); }} />;
}
