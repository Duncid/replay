import type { CSSProperties } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { getNotePalette } from "@/constants/noteColors";

const sharpNotes = ["C", "D", "F", "G", "A"] as const;

function MusicalIdentity() {
  const palette = getNotePalette();
  return <section className="space-y-6" aria-labelledby="musical-identity">
    <div className="space-y-2">
      <h2 id="musical-identity" className="text-2xl font-semibold">Musical identity</h2>
      <p className="text-muted-foreground">Seven pitch families cover all twelve notes. Sharps inherit the color of the natural below: C♯ → C, D♯ → D, F♯ → F, G♯ → G and A♯ → A. Labels remain visible so color is never the only cue.</p>
    </div>
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">Natural notes</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-7">{Object.entries(palette).map(([note, color]) => <div key={note} className="space-y-2">
        <div className="flex h-16 items-center justify-center rounded-lg font-mono text-xl font-semibold" style={{ background: color, color: "hsl(var(--note-ink))" }}>{note}</div>
        <p className="font-mono text-xs text-muted-foreground">{color}</p>
      </div>)}</div>
    </div>
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">Sharp notes</h3>
      <p className="text-sm text-muted-foreground">The upper swatch shows the pitch color used by falling notes and active rail cells. The lower swatch uses the idle sharp rail treatment: 60% pitch color mixed with 40% black-key color, with a contrast-adjusted label.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{sharpNotes.map(note => <div key={note} className="space-y-3 rounded-lg border p-3">
        <div className="flex h-16 items-center justify-center rounded-md font-mono text-xl font-semibold" style={{ background: palette[note], color: "hsl(var(--note-ink))" }}>{note}♯</div>
        <div className="note-rail__cell note-rail__cell--black" style={{ "--nc": palette[note], "--sharp-label": `hsl(var(--note-${note.toLowerCase()}-sharp-label))` } as CSSProperties}>{note}♯</div>
        <p className="font-mono text-xs text-muted-foreground">{note} family · {palette[note]}</p>
      </div>)}</div>
    </div>
    <p className="text-sm text-muted-foreground">Pitch colors belong to the notes and rail. Piano keys use lime for player activity and blue for playback in the Acid palette.</p>
  </section>;
}

const fontFamilies = [
  { name: "Space Grotesk", className: "font-display", token: "font-display", use: "Headings and tune titles", weights: "Medium 500 · Semibold 600 · Bold 700", sample: "Made for practice." },
  { name: "Inter", className: "font-sans", token: "font-sans", use: "Body text, buttons and controls", weights: "Regular 400 · Medium 500 · Semibold 600", sample: "Take your time. Find your rhythm." },
  { name: "JetBrains Mono", className: "font-mono", token: "font-mono", use: "Note labels, timing and metadata", weights: "Medium 500 · Semibold 600", sample: "C♯4 · 120 BPM · 4/4" },
];

const fontStyles = [
  { name: "Display", detail: "Space Grotesk · 36 / 40 px · 600", className: "font-display text-4xl leading-10 font-semibold", sample: "Made for practice." },
  { name: "Page title", detail: "Space Grotesk · 30 / 36 px · 600", className: "font-display text-3xl leading-9 font-semibold", sample: "Your tunes" },
  { name: "Section title", detail: "Space Grotesk · 20 / 28 px · 600", className: "font-display text-xl leading-7 font-semibold", sample: "Your next practice" },
  { name: "Body", detail: "Inter · 15 / 22 px · 400", className: "font-sans text-[15px] leading-[22px] font-normal", sample: "Take your time and listen to each note." },
  { name: "Control label", detail: "Inter · 14 / 20 px · 500", className: "font-sans text-sm leading-5 font-medium", sample: "Start practice" },
  { name: "Supporting text", detail: "Inter · 14 / 20 px · 400", className: "font-sans text-sm leading-5 font-normal text-muted-foreground", sample: "Complete Intro to unlock this tune." },
  { name: "Caption", detail: "Inter · 12 / 16 px · 400", className: "font-sans text-xs leading-4 font-normal text-muted-foreground", sample: "MIDI connected" },
  { name: "Note label", detail: "JetBrains Mono · 11 / 12 px · 600", className: "font-mono text-[11px] leading-3 font-semibold", sample: "C4  C♯4  D4  D♯4  E4" },
];

function TypographySection() {
  return <section className="space-y-6" aria-labelledby="typography">
    <div className="space-y-2">
      <h2 id="typography" className="text-2xl font-semibold">Typography</h2>
      <p className="text-muted-foreground">Three locally bundled font families give headings, reading text and musical data distinct roles. These specimens use the app’s font tokens.</p>
    </div>
    <div className="grid gap-4 sm:grid-cols-3">{fontFamilies.map(font => <article key={font.name} className="space-y-4 rounded-lg border bg-card p-4">
      <div><h3 className={`${font.className} text-lg font-semibold`}>{font.name}</h3><code className="text-xs text-muted-foreground">{font.token}</code></div>
      <p className={`${font.className} text-2xl leading-8 font-medium`}>{font.sample}</p>
      <p className="text-sm">{font.use}</p>
      <p className="text-xs leading-5 text-muted-foreground">{font.weights}</p>
    </article>)}</div>
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">Font styles</h3>
      <p className="text-sm text-muted-foreground">Size / line height in pixels, followed by font weight. Body text defaults to 15 / 22; headings use the display family.</p>
      <div className="divide-y rounded-lg border px-4">{fontStyles.map(style => <div key={style.name} className="grid gap-3 py-5 sm:grid-cols-[230px_minmax(0,1fr)] sm:items-center">
        <div className="space-y-1"><p className="text-sm font-medium">{style.name}</p><p className="text-xs text-muted-foreground">{style.detail}</p></div>
        <p className={style.className}>{style.sample}</p>
      </div>)}</div>
    </div>
  </section>;
}

function Foundations() {
  const colors = ["background", "foreground", "card", "primary", "secondary", "muted", "muted-foreground", "accent", "destructive", "border", "ring"];
  return <main className="max-w-4xl space-y-10">
    <header className="space-y-3"><p className="text-sm text-primary">NOODLYN · DESIGN SYSTEM</p><h1 className="text-4xl font-semibold">Made for practice.</h1><p className="max-w-2xl text-muted-foreground">Lime player actions, blue playback, near-black surfaces and seven pitch colors. These examples use the same tokens and components as the app.</p></header>
    <section className="space-y-4"><h2 className="text-2xl font-semibold">Semantic colors</h2><div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{colors.map(token => <div key={token} className="rounded-lg border p-3"><div className="mb-3 h-16 rounded-md border" style={{ background: `hsl(var(--${token}))` }} /><code className="text-xs">{token}</code></div>)}</div></section>
    <MusicalIdentity />
    <TypographySection />
    <section className="space-y-4"><h2 className="text-2xl font-semibold">Spacing & shape</h2><p className="text-muted-foreground">A 4 px rhythm. Use 16–24 px within groups and 32 px between sections. The base radius is 12 px; medium controls use 10 px.</p>{[4, 8, 12, 16, 24, 32].map(size => <div key={size} className="flex items-center gap-4"><code className="w-10 text-xs">{size}px</code><div className="h-3 rounded bg-primary" style={{ width: size * 5 }} /></div>)}</section>
    <section className="space-y-3"><h2 className="text-2xl font-semibold">Interaction</h2><p>Use visible labels, keyboard focus rings and explicit locked or disabled states. Prefer 44 px touch targets for primary iPad actions. Honor reduced motion. Use a dialog for a decision, a sheet for detail and a toast for a transient result.</p></section>
  </main>;
}
const meta = { title: "Foundations/Noodlyn", component: Foundations } satisfies Meta<typeof Foundations>;
export default meta;
export const Overview: StoryObj<typeof meta> = {};

export const Typography: StoryObj<typeof meta> = {
  render: () => <main className="max-w-4xl"><TypographySection /></main>,
};
