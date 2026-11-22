import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const palettes = JSON.parse(readFileSync(new URL("src/design-system/palettes.json", root), "utf8"));
function hsl(hex) {
  const [r, g, b] = hex.match(/[a-f\d]{2}/gi).map(part => parseInt(part, 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  const l = (max + min) / 2;
  const s = delta ? delta / (1 - Math.abs(2 * l - 1)) : 0;
  let h = delta ? max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4 : 0;
  h = (h * 60 + 360) % 360;
  return `${h.toFixed(3)} ${(s * 100).toFixed(3)}% ${(l * 100).toFixed(3)}%`;
}
const css = "/* Generated from palettes.json by npm run tokens:generate. */\n" + Object.entries(palettes).map(([theme, colors]) =>
  `${theme === "acid" ? ':root, [data-theme="acid"]' : `[data-theme="${theme}"]`} {\n` +
  Object.entries(colors).map(([name, hex]) => `  --${name}: ${hsl(hex)};`).join("\n") + "\n}\n",
).join("\n");
const target = new URL("src/design-system/palette.generated.css", root);
if (process.argv.includes("--check")) {
  if (readFileSync(target, "utf8") !== css) throw new Error("Theme tokens are stale. Run npm run tokens:generate.");
} else writeFileSync(target, css);
