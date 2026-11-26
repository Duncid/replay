import type { Meta, StoryObj } from "@storybook/react-vite";
import { getNotePalette } from "@/constants/noteColors";

function Foundations() {
  const colors = ["background", "foreground", "card", "primary", "secondary", "muted", "muted-foreground", "accent", "destructive", "border", "ring"];
  return <main className="max-w-4xl space-y-10">
    <header className="space-y-3"><p className="text-sm text-primary">NOODLYN · DESIGN SYSTEM</p><h1 className="text-4xl font-semibold">Made for practice.</h1><p className="max-w-2xl text-muted-foreground">Lime player actions, blue playback, near-black surfaces and seven pitch colors. These examples use the same tokens and components as the app.</p></header>
    <section className="space-y-4"><h2 className="text-2xl font-semibold">Semantic colors</h2><div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{colors.map(token => <div key={token} className="rounded-lg border p-3"><div className="mb-3 h-16 rounded-md border" style={{ background: `hsl(var(--${token}))` }} /><code className="text-xs">{token}</code></div>)}</div></section>
    <section className="space-y-4"><h2 className="text-2xl font-semibold">Musical identity</h2><p className="text-muted-foreground">Note colors identify pitch; labels remain visible so color is never the only cue.</p><div className="flex flex-wrap gap-3">{Object.entries(getNotePalette()).map(([note, color]) => <div key={note} className="flex size-16 items-center justify-center rounded-lg text-xl font-bold text-black" style={{ background: color }}>{note}</div>)}</div></section>
    <section className="space-y-3"><h2 className="text-2xl font-semibold">Typography</h2><p className="text-3xl font-semibold">Page title · Tunes</p><p className="text-xl font-semibold">Section title · Your next practice</p><p className="text-base">Body · Take your time and listen to each note.</p><p className="text-sm text-muted-foreground">Supporting text · Complete Intro to unlock this tune.</p><p className="text-xs text-muted-foreground">Caption · MIDI connected</p></section>
    <section className="space-y-4"><h2 className="text-2xl font-semibold">Spacing & shape</h2><p className="text-muted-foreground">A 4 px rhythm. Use 16–24 px within groups and 32 px between sections. The base radius is 12 px; medium controls use 10 px.</p>{[4, 8, 12, 16, 24, 32].map(size => <div key={size} className="flex items-center gap-4"><code className="w-10 text-xs">{size}px</code><div className="h-3 rounded bg-primary" style={{ width: size * 5 }} /></div>)}</section>
    <section className="space-y-3"><h2 className="text-2xl font-semibold">Interaction</h2><p>Use visible labels, keyboard focus rings and explicit locked or disabled states. Prefer 44 px touch targets for primary iPad actions. Honor reduced motion. Use a dialog for a decision, a sheet for detail and a toast for a transient result.</p></section>
  </main>;
}
const meta = { title: "Foundations/Noodlyn", component: Foundations } satisfies Meta<typeof Foundations>;
export default meta;
export const Overview: StoryObj<typeof meta> = {};
