import type { Meta, StoryObj } from "@storybook/react-vite";
import { assetLinkClass, ipadAssets, ipadAssetUrl } from "./ipadAssets";

function Icons() {
  return <main className="max-w-6xl space-y-8">
    <header className="max-w-3xl space-y-3">
      <p className="font-mono text-xs uppercase tracking-widest text-primary">iPad assets · App icons</p>
      <h1 className="text-3xl font-semibold">The blue piano, at every size.</h1>
      <p className="text-muted-foreground">The release pack contains {ipadAssets.icons.length} square PNG sizes, all resized from the existing opaque 1024 × 1024 master. Both native apps use the same artwork in independent asset catalogs.</p>
    </header>
    <section className="grid gap-6 rounded-xl border bg-card p-6 sm:grid-cols-[192px_minmax(0,1fr)] sm:items-center" aria-labelledby="icon-master">
      <img src={ipadAssetUrl("icons", "icon-1024.png")} alt="Blue Noodlyn piano app icon" width={192} height={192} className="max-w-full" />
      <div className="space-y-3">
        <h2 id="icon-master" className="text-2xl font-semibold">1024 px master</h2>
        <p className="text-sm text-muted-foreground">Each iOS app catalog references a universal 1024 × 1024 image; Xcode derives device sizes. The smaller files below are reusable exports, including sizes used by the web app. This grid is the release inventory, not a list of required iPad icon slots.</p>
        <p className="font-mono text-xs text-muted-foreground">PNG · opaque background · square artwork</p>
        <a href={ipadAssetUrl("icons", "icon-1024.png")} download="icon-1024.png" className={assetLinkClass}>Download master PNG</a>
      </div>
    </section>
    <section className="space-y-4" aria-labelledby="icon-sizes">
      <h2 id="icon-sizes" className="text-2xl font-semibold">All exported sizes</h2>
      <p className="text-sm text-muted-foreground">Each preview uses its actual bitmap file. Images up to 96 px display at native CSS size; larger images are reduced to 96 px. Dimensions refer to image pixels, not iPad points.</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">{ipadAssets.icons.map(size => <figure key={size} className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex h-28 items-center justify-center rounded-md bg-background">
          <img src={ipadAssetUrl("icons", `icon-${size}.png`)} alt={`Piano icon, ${size} pixels square`} width={Math.min(size, 96)} height={Math.min(size, 96)} loading="lazy" />
        </div>
        <figcaption className="space-y-2">
          <p className="font-mono text-sm">{size} × {size} px</p>
          <a href={ipadAssetUrl("icons", `icon-${size}.png`)} download={`icon-${size}.png`} className={assetLinkClass}>Download PNG</a>
        </figcaption>
      </figure>)}</div>
    </section>
  </main>;
}

const meta = { title: "iPad assets/App icons", component: Icons } satisfies Meta<typeof Icons>;
export default meta;
export const Sizes: StoryObj<typeof meta> = {};
