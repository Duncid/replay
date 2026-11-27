import type { Meta, StoryObj } from "@storybook/react-vite";
import { PianoKey } from "@/components/PianoKey";
import { createPianoLayout, pianoKeyStyle } from "@/components/pianoLayout";
import { assetLinkClass, ipadAssets, ipadAssetUrl } from "./ipadAssets";
import { IPadStartScreen } from "@/components/branding/IPadStartScreen";

const layout = createPianoLayout(false);
const noop = () => {};

function NativePartsSource() {
  return <main className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
    <h1 className="absolute inset-0 m-0 grid place-items-center font-display text-[80px] font-semibold tracking-tight">Noodlyn</h1>
    <div aria-hidden="true" inert className="pointer-events-none absolute inset-x-1 bottom-1 h-[266px]">
      <div className="absolute inset-0 z-0">
        {layout.whiteKeys.map(note => <PianoKey key={note.midi} note={`${note.note}${note.octave}`} isBlack={false} isPlayable onPress={noop} onRelease={noop} style={pianoKeyStyle(layout, note)} />)}
      </div>
      <div className="absolute inset-0 z-10">
        {layout.blackKeys.map(note => <PianoKey key={note.midi} note={`${note.note}${note.octave}`} isBlack isPlayable onPress={noop} onRelease={noop} style={pianoKeyStyle(layout, note)} />)}
      </div>
    </div>
  </main>;
}

function ScreenSizes() {
  const portraits = ipadAssets.screens.filter(screen => screen.orientation === "portrait");
  return <main className="mx-auto max-w-6xl space-y-8 p-6 text-foreground">
    <header className="max-w-3xl space-y-3">
      <p className="font-mono text-xs uppercase tracking-widest text-primary">iPad assets · Start screens</p>
      <h1 className="text-3xl font-semibold">One design, every canvas.</h1>
      <p className="text-muted-foreground">{ipadAssets.screens.length} PNG exports across {portraits.length} canvas sizes, in portrait and landscape. An adaptive production keyboard, a frozen tune and a shadowed Noodlyn wordmark centered in the space above the piano.</p>
      <p className="text-sm text-muted-foreground">Dimensions below come from the checked-in asset manifest. Pixels describe the exported PNG; points describe its logical canvas at 2×. Thumbnails are scaled to fit; downloads retain the full resolution.</p>
    </header>
    <aside className="space-y-2 rounded-lg border bg-card p-4">
      <h2 className="text-lg font-semibold">Adaptive native launch screens</h2>
      <p className="text-sm text-muted-foreground">The new start-screen composition is generated from controlled web UI. Noodlyn and Noodlyn Learn currently retain their independent native launch storyboards with the simpler wordmark and key parts. Exporting these PNGs does not install them in either native app.</p>
    </aside>
    <div className="grid gap-6 lg:grid-cols-2">{portraits.map(portrait => {
      const landscape = ipadAssets.screens.find(screen => screen.width === portrait.height && screen.height === portrait.width)!;
      return <article key={portrait.filename} className="min-w-0 space-y-4 rounded-xl border bg-card p-4">
        <h2 className="text-lg font-semibold">{portrait.family}</h2>
        <div className="grid gap-5 sm:grid-cols-2">{[portrait, landscape].map(screen => <figure key={screen.filename} className="min-w-0 space-y-3">
          <a href={ipadAssetUrl("screens", screen.filename)} target="_blank" rel="noreferrer" className="flex h-64 items-center justify-center rounded-lg border bg-background p-2 focus-visible:outline-2 focus-visible:outline-ring" aria-label={`Open ${screen.width} × ${screen.height} ${screen.orientation} start screen`}>
            <img src={ipadAssetUrl("screens", screen.filename)} alt={`Noodlyn start screen in ${screen.orientation}`} width={screen.width} height={screen.height} className="max-h-full max-w-full object-contain" loading="lazy" />
          </a>
          <figcaption className="space-y-1">
            <p className="text-sm font-medium capitalize">{screen.orientation}</p>
            <p className="font-mono text-xs">{screen.width} × {screen.height} px</p>
            <p className="font-mono text-xs text-muted-foreground">{screen.width / screen.scale} × {screen.height / screen.scale} pt · {screen.scale}×</p>
            <a className={assetLinkClass} href={ipadAssetUrl("screens", screen.filename)} download={screen.filename}>Download PNG</a>
          </figcaption>
        </figure>)}</div>
      </article>;
    })}</div>
  </main>;
}

const meta = {
  title: "iPad assets/Start screens",
  component: IPadStartScreen,
  args: { beat: 4.25, logoScale: 1, tuneOpacity: .65 },
  argTypes: {
    beat: { control: { type: "range", min: 0, max: 12, step: .25 }, description: "Frozen beat in the original C-major phrase; controls notes and key highlights together." },
    logoScale: { control: { type: "range", min: .6, max: 1.25, step: .05 }, description: "Scale of the wordmark centered above the piano." },
    tuneOpacity: { control: { type: "range", min: 0, max: 1, step: .05 }, description: "Background highway strength; piano and wordmark stay opaque." },
  },
  parameters: {
    edgeToEdge: true,
    docs: { description: { component: "Controlled start-screen scene using the same NoteHighway, NoteRail, PianoKey and adaptive layout as the website’s iPad demo. Live source exposes the frozen beat, logo scale and tune opacity without audio or account services. The wordmark is centered in the remaining space above the piano. Run npm run ipad:start-screens to export every manifest size. Native parts source preserves the separate, simpler native launch artwork." } },
  },
} satisfies Meta<typeof IPadStartScreen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Sizes: Story = { render: () => <ScreenSizes />, parameters: { controls: { disable: true } } };
// Keep the export name stable: scripts/export-ipad-assets.mjs captures this story.
export const Minimal: Story = { name: "Live source", parameters: { docs: { story: { height: 768 } } } };
export const NativeParts: Story = { name: "Native parts source", render: () => <NativePartsSource />, parameters: { controls: { disable: true }, docs: { story: { height: 768 } } } };

