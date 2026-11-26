// Capture the production practice UI with the repository's complete St Louis Blues
// score. All account/coach responses are local fixtures; no live account is used.
// Usage: node scripts/capture-landing-practice.mjs [http://127.0.0.1:8080]
import { chromium, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';

const origin = process.argv[2] ?? 'http://127.0.0.1:8080';
const sequence = JSON.parse(await readFile(new URL('../src/music/st-louis-blues/output/tune.ns.json', import.meta.url), 'utf8'));
const xml = await readFile(new URL('../src/music/st-louis-blues/output/tune.xml', import.meta.url), 'utf8');
const account = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const session = {
  access_token: `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: account, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.fixture`,
  refresh_token: 'local-screenshot-fixture', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: account, email: 'preview@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} },
};
const browser = await chromium.launch({ args: ['--mute-audio', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])] });
try {
  const page = await browser.newPage({ viewport: { width: 1194, height: 834 }, deviceScaleFactor: 2 });
  await page.addInitScript(session => {
    localStorage.setItem('sb-mmlizntmpbriyumsunsh-auth-token', JSON.stringify(session));
    localStorage.setItem('replay-instrument', JSON.stringify('classic'));
    localStorage.setItem('i18nextLng', 'en');
  }, session);
  await page.route('**/*.supabase.co/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/user')) return route.fulfill({ json: session.user });
    if (url.pathname.endsWith('/tune-coach')) return route.fulfill({ json: {
      tuneTitle: 'St Louis Blues', encouragement: '', motifsSummary: [], practiceHistory: [],
      practicePlan: [{ itemId: 'full-tune', itemType: 'full_tune', instruction: 'Find your rhythm. Let the melody flow.', motifs: [], nugget: null, assembly: null,
        fullTune: { id: 'full-tune', label: 'Full tune', noteSequence: sequence } }],
    } });
    if (url.pathname.includes('/rest/v1/')) {
      const table = url.pathname.split('/').pop();
      return route.fulfill({ json: table === 'local_users' ? [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Player', auth_user_id: account }]
        : table === 'tune_assets' ? [{ tune_key: 'st-louis-blues', is_global: true, briefing: { title: 'St Louis Blues' }, note_sequence: sequence, tune_xml: xml }]
        : [] });
    }
    return route.abort();
  });
  await page.goto(origin);
  await page.getByRole('button', { name: 'Practice: St Louis Blues', exact: true }).click();
  await page.locator('.note-highway[data-render-ready="true"]').waitFor({ timeout: 60000 });
  // Cancel the demo and advance through the actual player gates by playing the
  // on-screen piano. Keep the full score and capture its midpoint in player mode.
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Replay', exact: true })).toBeVisible();
  const groups = new Map();
  for (const note of sequence.notes) {
    const time = Math.round(note.startTime * 1000) / 1000;
    if (time > sequence.totalTime / 2) continue;
    if (!groups.has(time)) groups.set(time, new Set());
    groups.get(time).add(note.pitch);
  }
  const steps = [...groups].sort(([a], [b]) => a - b);
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  for (const [index, [, pitches]] of steps.entries()) {
    const keys = [...pitches].map(pitch => page.getByRole('button', { name: `${names[pitch % 12]}${Math.floor(pitch / 12) - 1}`, exact: true }));
    for (const key of keys) await key.dispatchEvent('mousedown');
    // Let the real playback engine publish the next gate before the next chord.
    await page.waitForTimeout(30);
    if (index < steps.length - 1) for (const key of keys) await key.dispatchEvent('mouseup');
  }
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);
  await expect(page.locator('.piano-key[data-activity="user"]').first()).toBeVisible();
  await page.waitForTimeout(150);
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.fonts.ready);
  await mkdir(new URL('../public/marketing/', import.meta.url), { recursive: true });
  await page.screenshot({ path: new URL('../public/marketing/st-louis-blues-practice.png', import.meta.url).pathname });
  console.log(`Captured full St Louis Blues in player mode after ${steps.length} note groups, through ${steps.at(-1)[0]} seconds.`);
} finally {
  await browser.close();
}
