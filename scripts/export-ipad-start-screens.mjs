// Start Storybook, then npm run ipad:start-screens -- --url http://127.0.0.1:6006/
import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureIPadStartScreens } from './lib/capture-ipad-start-screens.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({ options: {
  url: { type: 'string', default: 'http://127.0.0.1:6006/' },
  output: { type: 'string', default: resolve(root, 'design-assets/ipad-release') },
  beat: { type: 'string', default: '4.25' },
  'logo-scale': { type: 'string', default: '1' },
  'tune-opacity': { type: 'string', default: '0.65' },
} });
const number = (key, min, max) => {
  const value = Number(values[key]);
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`--${key} must be between ${min} and ${max}`);
  return value;
};
const manifest = JSON.parse(await readFile(resolve(root, 'design-assets/ipad-release/manifest.json'), 'utf8'));
const output = resolve(values.output);
const metadata = await captureIPadStartScreens({ base: values.url, output, screens: manifest.screens,
  beat: number('beat', 0, 12), logoScale: number('logo-scale', .6, 1.25), tuneOpacity: number('tune-opacity', 0, 1) });
await mkdir(output, { recursive: true });
// A custom output is a screen-only review pack, not an incomplete icon/native pack.
const result = output === resolve(root, 'design-assets/ipad-release') ? { ...manifest, ...metadata } : { ...metadata, screens: manifest.screens };
const temporary = resolve(output, '.manifest-start-screens.json');
await writeFile(temporary, JSON.stringify(result, null, 2) + '\n');
await rename(temporary, resolve(output, 'manifest.json'));
console.log(`Exported ${manifest.screens.length} deterministic start screens to ${output}`);
