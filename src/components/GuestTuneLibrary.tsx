import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import { guestTunes } from "@/music/guestLibrary";
import { TuneLibraryView } from "./TuneLibraryView";

export default function GuestTuneLibrary({ onSelectTune, onSignUp, previewPaused }: { onSelectTune: (key: string) => void; onSignUp?: () => void; previewPaused?: boolean }) {
  const navigate = useNavigate();
  const { systemTitle } = useLanguage();
  const tunes = guestTunes.map(tune => ({ ...tune, title: systemTitle(tune.tune_key, tune.title ?? tune.tune_key) }));
  return <TuneLibraryView tunes={tunes} refetch={() => {}}
    onSignUp={onSignUp ?? (() => navigate("/login?mode=signup"))} previewPaused={previewPaused}
    onSelectTune={key => { if (key === "intro") onSelectTune(key); }} />;
}
