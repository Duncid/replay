// FFMPEG_PATH=/path/to/ffmpeg node scripts/capture-landing-loop.mjs [local origin]
// Uses only local account/coach fixtures and actual piano input; no live account.
import { chromium, expect } from '@playwright/test';
import { readFile, mkdir, writeFile, mkdtemp, copyFile, rename, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const origin = process.argv[2] ?? 'http://127.0.0.1:8082';
const loop = JSON.parse(await readFile(new URL('../design-assets/landing/st-louis-blues-loop.ns.json', import.meta.url), 'utf8'));
const xml = await readFile(new URL('../design-assets/landing/st-louis-blues-loop.musicxml', import.meta.url), 'utf8');
const sequence = { ...loop, totalTime: loop.totalTime * 3, notes: Array.from({ length: 3 }, (_, repeat) =>
  loop.notes.map(note => ({ ...note, startTime: note.startTime + repeat * loop.totalTime, endTime: note.endTime + repeat * loop.totalTime }))).flat() };
const account = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const session = {
  access_token: `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: account, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.fixture`,
  refresh_token: 'local-capture-fixture', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: account, email: 'preview@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} },
};
const directory = new URL('../public/marketing/', import.meta.url);
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ args: ['--mute-audio', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])] });
const temporary = await mkdtemp(join(tmpdir(), 'noodlyn-loop-'));
let encoder;
try {
  const page = await browser.newPage({ viewport: { width: 1194, height: 834 }, deviceScaleFactor: 1 });
  await page.clock.install();
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
      practicePlan: [{ itemId: 'practice-loop', itemType: 'full_tune', instruction: 'Find your rhythm. Let the melody flow.', motifs: [], nugget: null, assembly: null,
        fullTune: { id: 'practice-loop', label: '12-bar practice loop', noteSequence: sequence } }],
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
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Replay', exact: true })).toBeVisible();
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.fonts.ready);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await page.evaluate(notes => {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    for (const note of notes) {
      const key = document.querySelector(`.piano-key[data-note="${names[note.pitch % 12]}${Math.floor(note.pitch / 12) - 1}"]`);
      if (!key) throw new Error(`Missing piano key ${note.pitch}`);
      setTimeout(() => key.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })), note.startTime * 1000);
      setTimeout(() => key.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })), note.endTime * 1000);
    }
  }, sequence.notes);
  // Capture the middle repetition: upcoming and trailing notes are already present.
  // Offset the cut from the exact note-on so React and Pixi have both rendered
  // the pressed key before the first frame. The last frame has the same phase.
  await page.clock.runFor(loop.totalTime * 1000 + 125);
  const framesPerSecond = 30;
  const frameCount = loop.totalTime * framesPerSecond;
  let encoderLog = '';
  let poster;
  encoder = spawn(process.env.FFMPEG_PATH ?? 'ffmpeg', [
    '-y', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-framerate', String(framesPerSecond), '-i', 'pipe:0',
    '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    join(temporary, 'loop.mp4'),
  ], { stdio: ['pipe', 'ignore', 'pipe'] });
  encoder.stderr.on('data', data => { encoderLog += data; });
  const finished = once(encoder, 'close');
  for (let frame = 0; frame < frameCount; frame++) {
    if (frame > 0) await page.clock.runFor(Math.round(frame * 1000 / framesPerSecond) - Math.round((frame - 1) * 1000 / framesPerSecond));
    const image = await page.screenshot({ type: 'jpeg', quality: 90 });
    if (frame === Math.floor(frameCount * .75)) poster = image;
    if (!encoder.stdin.write(image)) await once(encoder.stdin, 'drain');
    if (frame % 180 === 0) {
      await expect(page.locator('.tune-practice')).toBeVisible();
      console.log(`Captured ${frame}/${frameCount} frames`);
      await writeFile(`/tmp/noodlyn-loop-frame-${frame}.jpg`, image);
    }
  }
  encoder.stdin.end();
  const [code] = await finished;
  if (code !== 0) throw new Error(encoderLog);
  await expect(page.locator('.tune-practice')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Replay', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);
  const staging = new URL('st-louis-blues-loop.next.mp4', directory);
  await copyFile(join(temporary, 'loop.mp4'), staging);
  await rename(staging, new URL('st-louis-blues-loop.mp4', directory));
  await writeFile(new URL('st-louis-blues-loop-poster.jpg', directory), poster);
  console.log(`Captured ${loop.totalTime}s of player practice at ${framesPerSecond} fps.`);
} finally {
  encoder?.stdin.destroy();
  if (encoder?.exitCode === null) encoder.kill();
  await browser.close();
  await rm(temporary, { recursive: true, force: true });
}
