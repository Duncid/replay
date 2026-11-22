import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { Metronome } from "@/components/Metronome";
import { FeedbackScreen } from "@/components/FeedbackScreen";
import { TeacherWelcome } from "@/components/TeacherWelcome";
import { TuneEvaluationNotesTable } from "@/components/TuneEvaluationNotesTable";
import { SaveCompositionModal } from "@/components/SaveCompositionModal";
import { NewUserDialog } from "@/components/NewUserDialog";
import { TrackItem } from "@/components/TrackItem";
import { UserMenu } from "@/components/UserMenu";
import { Button } from "@/components/ui/button";
import type { NoteSequence } from "@/types/noteSequence";

const meta = { title: "Components/App" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const noop = () => {};

const pitches = [60, 62, 64, 65, 67, 65, 64, 62];
const sequence = {
  notes: pitches.map((pitch, i) => ({ pitch, startTime: i * 0.5, endTime: i * 0.5 + 0.45, velocity: 90 })),
  totalTime: pitches.length * 0.5,
} as unknown as NoteSequence;
const played = {
  notes: pitches.map((pitch, i) => ({ pitch: i === 3 ? 66 : pitch, startTime: i * 0.52, endTime: i * 0.52 + 0.4, velocity: 80 })),
  totalTime: 4.2,
};

export const MetronomeStory: Story = { name: "Metronome", render: function M() {
  const [bpm, setBpm] = useState(90);
  const [ts, setTs] = useState("4/4");
  const [playing, setPlaying] = useState(false);
  return <Metronome bpm={bpm} setBpm={setBpm} timeSignature={ts} setTimeSignature={setTs} isPlaying={playing} setIsPlaying={setPlaying} />;
} };

const feedback = (evaluation: "pass" | "close" | "fail", text: string): Story => ({
  render: () => <FeedbackScreen evaluation={evaluation} feedbackText={text} onReturnToPractice={noop} onMakeEasier={noop} onMakeHarder={noop} onFinishLesson={noop}
    awardedSkills={evaluation === "pass" ? [{ skillKey: "rhythm", title: "Steady rhythm", isUnlocked: true }] : []} />,
});
export const FeedbackPass: Story = { name: "Feedback screen – pass", ...feedback("pass", "Great job — every note was right and your timing was steady.") };
export const FeedbackClose: Story = { name: "Feedback screen – close", ...feedback("close", "Almost! The fourth note was a little sharp.") };
export const FeedbackFail: Story = { name: "Feedback screen – fail", ...feedback("fail", "Let's slow it down and try the first bar again.") };

export const Welcome: Story = { name: "Welcome screen", render: () => <TeacherWelcome isLoading={false} onSelectActivity={noop} greeting={{
  greeting: "Welcome back! Ready to keep going with the blues?",
  suggestions: [
    { activityKey: "intro", activityType: "tune", label: "Intro", why: "You're close to mastering it.", trackTitle: "Intro", level: "beginner" },
    { activityKey: "st-louis-blues", activityType: "tune", label: "St Louis Blues", why: "A new challenge.", trackTitle: "St Louis Blues", level: "intermediate" },
  ],
}} /> };
export const WelcomeLoading: Story = { name: "Welcome screen – loading", render: () => <TeacherWelcome isLoading greeting={null} onSelectActivity={noop} /> };

export const NotesTable: Story = { name: "Evaluation notes table", render: () => <TuneEvaluationNotesTable debugData={{ tuneKey: "intro", nuggetId: "n1", targetSequence: sequence, userSequence: played }} /> };
export const NotesTableEmpty: Story = { name: "Evaluation notes table – empty", render: () => <TuneEvaluationNotesTable debugData={null} /> };

export const Track: Story = { name: "Track item", render: function T() {
  const [playing, setPlaying] = useState(false);
  return <DndContext><SortableContext items={["a", "b"]}><div className="flex gap-3">
    <TrackItem id="a" sequence={sequence} isPlaying={playing} onPlay={() => setPlaying(true)} onStop={() => setPlaying(false)} isFirst onMergeNext={noop} onRemove={noop} onRequestImprov={noop} onRequestVariations={noop} />
    <TrackItem id="b" sequence={sequence} isAiGenerated isLast onMergePrevious={noop} onRemove={noop} />
  </div></SortableContext></DndContext>;
} };

export const SaveComposition: Story = { name: "Save composition dialog", render: function S() {
  const [open, setOpen] = useState(true);
  return <><Button onClick={() => setOpen(true)}>Save composition</Button><SaveCompositionModal open={open} onOpenChange={setOpen} onSave={() => setOpen(false)} defaultTitle="My blues" /></>;
} };

export const NewUser: Story = { name: "New user dialog", render: function N() {
  const [open, setOpen] = useState(true);
  return <><Button onClick={() => setOpen(true)}>New user</Button><NewUserDialog open={open} onOpenChange={setOpen} onCreateUser={async () => setOpen(false)} /></>;
} };

export const Menu: Story = { name: "User menu", render: function U() {
  const [lang, setLang] = useState("en");
  const [notation, setNotation] = useState<"auto" | "abc" | "solfege">("auto");
  return <UserMenu language={lang} onLanguageChange={setLang} notationPreference={notation} onNotationChange={setNotation} onOpenManagement={noop} />;
} };
