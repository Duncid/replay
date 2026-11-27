import manifest from "../../design-assets/ipad-release/manifest.json";

// Import the release pack directly so downloads work in dev and published Storybook.
const files = import.meta.glob<string>("../../design-assets/ipad-release/{screens,icons,launch-parts}/*.png", {
  eager: true,
  query: "?url&no-inline",
  import: "default",
});

export { manifest as ipadAssets };
export function ipadAssetUrl(folder: "screens" | "icons" | "launch-parts", filename: string) {
  return files[`../../design-assets/ipad-release/${folder}/${filename}`];
}

export const assetLinkClass = "text-sm text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring";
