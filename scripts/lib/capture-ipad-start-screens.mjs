import { chromium } from '@playwright/test';
import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';

/** Capture all canvases before replacing any release images. No native mutations. */
export async function captureIPadStartScreens({ base, output, screens, beat = 4.25, logoScale = 1, tuneOpacity = .65 }) {
  const url = new URL('iframe.html', base.endsWith('/') ? base : `${base}/`);
  url.searchParams.set('id', 'ipad-assets-start-screens--minimal');
  url.searchParams.set('viewMode', 'story');
  url.searchParams.set('globals', 'theme:acid');
  url.searchParams.set('args', `beat:${beat};logoScale:${logoScale};tuneOpacity:${tuneOpacity}`);
  await mkdir(output, { recursive: true });
  const staging = await mkdtemp(join(output, '.start-screens-'));
  const browser = await chromium.launch({ args: process.platform === 'darwin' ? ['--use-angle=metal'] : [] });
  let background;
  try {
    for (const screen of screens) {
      const page = await browser.newPage({ viewport: { width: screen.width / screen.scale, height: screen.height / screen.scale }, deviceScaleFactor: screen.scale });
      // Artwork must be self-contained; unexpected network dependencies fail capture.
      await page.route('**/*', route => new URL(route.request().url()).origin === url.origin ? route.continue() : route.abort());
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.goto(url.href);
        await page.evaluate(() => document.fonts.ready);
        await page.locator('main[data-scene-ready="true"]').waitFor({ timeout: 30_000 });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        if (errors.length) throw new Error(errors.join('\n'));
        background = await page.locator('main').evaluate(el => getComputedStyle(el).backgroundColor);
        const geometry = await page.evaluate(() => {
          const space = document.querySelector('.ipad-start-screen__space').getBoundingClientRect();
          const logo = document.querySelector('main h1').getBoundingClientRect();
          return { overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
            centered: Math.abs(logo.x + logo.width / 2 - (space.x + space.width / 2)) < 1 && Math.abs(logo.y + logo.height / 2 - (space.y + space.height / 2)) < 1,
            fits: logo.left >= 0 && logo.right <= innerWidth && logo.top >= 0 && logo.bottom <= space.bottom };
        });
        if (geometry.overflow || !geometry.centered || !geometry.fits) throw new Error(`Invalid artwork geometry for ${screen.filename}: ${JSON.stringify(geometry)}`);
        await page.screenshot({ path: join(staging, screen.filename), animations: 'disabled' });
        console.log(`Captured ${screen.width} × ${screen.height} (${screen.orientation})`);
      } finally { await page.close(); }
    }
    await mkdir(join(output, 'screens'), { recursive: true });
    for (const screen of screens) await rename(join(staging, screen.filename), join(output, 'screens', screen.filename));
    return {
      design: 'Controlled production UI: adaptive piano and rail, frozen C-major tune, shadowed Space Grotesk Noodlyn wordmark centered above the piano.',
      background,
      startScreen: { story: 'ipad-assets-start-screens--minimal', beat, logoScale, tuneOpacity, theme: 'acid', renderer: 'chromium', regenerate: 'npm run ipad:start-screens' },
    };
  } finally { await browser.close(); await rm(staging, { recursive: true, force: true }); }
}
