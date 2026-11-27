import { useNavigate } from "react-router-dom";
import { guestTunes } from "@/music/guestLibrary";
import { TuneLibraryView } from "./TuneLibraryView";

export default function GuestTuneLibrary({ onSelectTune }: { onSelectTune: (key: string) => void }) {
  const navigate = useNavigate();
  return <TuneLibraryView tunes={guestTunes} refetch={() => {}}
    onSignUp={() => navigate("/login?mode=signup")}
    onSelectTune={key => { if (key === "intro") onSelectTune(key); }} />;
}
