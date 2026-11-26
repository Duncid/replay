import { useState } from "react";
import { guestIntroPlan, guestIntroSequence, guestIntroXml } from "@/music/guestLibrary";
import { TunePractice } from "./TunePractice";
import type { TuneModeProps } from "./TuneMode";

export default function GuestTuneMode(props: TuneModeProps) {
  const [wins, setWins] = useState(0);
  return <TunePractice tuneKey="intro" tuneTitle="Intro" localSheetXml={guestIntroXml}
    currentNugget={guestIntroPlan} currentIndex={0} totalNuggets={1} currentStreak={wins} totalWins={wins}
    lastEvaluation={wins ? { evaluation: "pass", feedbackText: "You played Intro! Keep practising, or return to your tunes.",
      currentStreak: wins, successCount: 1, suggestNewNugget: false, replayDemo: false, evalIndex: wins } : null}
    language={props.language} notationPreference={props.notationPreference}
    onPlaySample={() => props.onPlaySample(guestIntroSequence)} onStopSample={props.onStopSample}
    isPlaying={props.isPlayingSample} onLeave={props.onLeave}
    onSwitchNugget={() => {}} onPreviousNugget={() => {}}
    onPlayheadReachedEnd={() => setWins(value => value + 1)}
    onRegisterNoteHandler={props.onRegisterNoteHandler} onRegisterNoteOffHandler={props.onRegisterNoteOffHandler}
    onRegisterExpectedNotesProvider={props.onRegisterExpectedNotesProvider} />;
}
