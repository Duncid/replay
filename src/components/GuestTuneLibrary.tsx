import { useNavigate } from "react-router-dom";
import { guestTunes } from "@/music/guestLibrary";
import { TuneLibraryView } from "./TuneLibraryView";

export default function GuestTuneLibrary({ onSelectTune, onSignUp, previewPaused }: { onSelectTune: (key: string) => void; onSignUp?: () => void; previewPaused?: boolean }) {
  const navigate = useNavigate();
  return <TuneLibraryView tunes={guestTunes} refetch={() => {}}
    onSignUp={onSignUp ?? (() => navigate("/login?mode=signup"))} previewPaused={previewPaused}
    onSelectTune={key => { if (key === "intro") onSelectTune(key); }} />;
}
