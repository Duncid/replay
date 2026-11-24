import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Music } from "lucide-react";
import { TopToastLabel, TopToastProgress } from "@/components/TopToast";
import { TrackLoadingItem } from "@/components/TrackLoadingItem";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { PianoInput } from "@/components/PianoInput";
import { LessonCard } from "@/components/LessonCard";

const meta = { title: "Components/App" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const noop = () => {};

export const TopToasts: Story = { name: "Top toast", parameters: { edgeToEdge: true }, render: () => <div className="relative h-40"><TopToastLabel show icon={<Music className="h-4 w-4" />} label="Recording…" pulse /><div className="absolute inset-x-0 top-16"><TopToastProgress show progress={60} /></div></div> };
export const TrackLoading: Story = { name: "Track loading item", render: () => <div className="h-40"><TrackLoadingItem label="Generating…" /></div> };
export const Spinner: Story = { name: "Loading spinner", render: () => <LoadingSpinner message="Loading tunes…" /> };
export const Input: Story = { name: "Piano input", render: function M() {
  const [connected, setConnected] = useState(false);
  const [silent, setSilent] = useState(false);
  const [onKb, setOnKb] = useState(true);
  const [mic, setMic] = useState(false);
  return <PianoInput micEnabled={mic} onMicEnabledChange={setMic} micStatus="running" micLevel={.4} isConnected={connected} deviceName={connected ? "Digital Piano" : null} attemptedNoDevice={false} isSupported
    onConnect={() => setConnected(true)} onDisconnect={() => setConnected(false)}
    silentWhilePlaying={silent} onSilentWhilePlayingChange={setSilent} playOnKeyboard={onKb} onPlayOnKeyboardChange={setOnKb} canPlayOnKeyboard />; } };
export const Lesson: Story = { name: "Lesson card", render: () => <LessonCard instruction="Play the first four notes of the melody." isEvaluating={false} mode="practice" onPlay={noop} onEvaluate={noop} onLeave={noop} trackTitle="Intro" difficulty={2} skillToUnlock={{ skillKey: "k", title: "Steady rhythm", isUnlocked: false }} /> };
