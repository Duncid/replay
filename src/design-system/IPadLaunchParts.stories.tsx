import type { Meta, StoryObj } from "@storybook/react-vite";
import { assetLinkClass, ipadAssets, ipadAssetUrl } from "./ipadAssets";

function LaunchParts() {
  return <main className="max-w-5xl space-y-8">
    <header className="max-w-3xl space-y-3">
      <p className="font-mono text-xs uppercase tracking-widest text-primary">iPad assets · Native launch parts</p>
      <h1 className="text-3xl font-semibold">Built from adaptable pieces.</h1>
      <p className="text-muted-foreground">The wordmark, white key and black key are exported at 1×, 2× and 3×. Each native project keeps its own copies and storyboard. Key images use stretchable centers to preserve edges and shadows as the keyboard fills the screen.</p>
    </header>
    {["Wordmark", "WhiteKey", "BlackKey"].map(kind => <section key={kind} className="space-y-4">
      <h2 className="text-2xl font-semibold">{kind === "WhiteKey" ? "White key" : kind === "BlackKey" ? "Black key" : "Wordmark"}</h2>
      <div className="grid gap-4 sm:grid-cols-3">{ipadAssets.parts.filter(part => part.filename.startsWith(`Launch${kind}@`)).map(part => <figure key={part.filename} className="min-w-0 space-y-3 rounded-lg border bg-card p-4">
        <div className="flex h-44 items-center justify-center rounded-md bg-background p-3">
          <img src={ipadAssetUrl("launch-parts", part.filename)} alt={`${kind} launch asset at ${part.scale}×`} width={part.width} height={part.height} className="max-h-full max-w-full object-contain" loading="lazy" />
        </div>
        <figcaption className="space-y-2">
          <p className="font-mono text-sm">{part.scale}× · {part.width} × {part.height} px</p>
          <p className="text-xs text-muted-foreground">{part.width / part.scale} × {part.height / part.scale} pt canvas</p>
          <a href={ipadAssetUrl("launch-parts", part.filename)} download={part.filename} className={assetLinkClass}>Download PNG</a>
        </figcaption>
      </figure>)}</div>
    </section>)}
  </main>;
}

const meta = { title: "iPad assets/Native launch parts", component: LaunchParts } satisfies Meta<typeof LaunchParts>;
export default meta;
export const Scales: StoryObj<typeof meta> = {};
