# Noodlyn landing-page media

The iPad frame, mouse tilt, and glass reflection remain live HTML/CSS in
`src/pages/Landing.tsx` and `src/pages/Landing.css`. They are not baked into the
video, so a new capture can replace the screen independently.

## Retained assets

- `st-louis-blues-loop.musicxml`: editable 12-bar score with repeat marks,
  extracted from source measures 50–61, at 120 BPM.
- `st-louis-blues-loop.mxl`: the same score packaged for importing into the app.
- `st-louis-blues-loop.ns.json`: the same 24-second phrase as a NoteSequence.
- `st-louis-blues-loop.json`: source timing, composer, and caption metadata.
- `public/marketing/st-louis-blues-loop.mp4`: silent H.264 video, 1194 × 834,
  30 fps. Captured using scripted player input in the real practice UI.
- `public/marketing/st-louis-blues-loop-poster.jpg`: poster from the video.
- `public/marketing/st-louis-blues-practice.png`: original high-resolution still,
  kept separately and used for reduced motion and failed video loads.

The original tune under `src/music/st-louis-blues/` is unchanged. The visible
caption is **St Louis Blues / 12-bar practice loop**.

## Regenerate after UI changes

From the repository root, with dependencies installed:

1. Build the excerpt: `python3 scripts/build-landing-loop.py`.
2. Build the app with `npm run build`, then run
   `npm run preview -- --host 127.0.0.1 --port 8082 --strictPort`.
   Capture the production preview, so hot reload cannot interrupt the recording.
3. Capture: `FFMPEG_PATH=/absolute/path/to/ffmpeg node scripts/capture-landing-loop.mjs`.
   The default capture URL is `http://127.0.0.1:8082`. A different local production
   preview URL can be supplied as the final argument. The completed capture
   replaces the video only after validation; the prior video remains intact on failure.
4. Check the preview, especially the loop boundary, green player highlights,
   pause/resume, and reduced-motion fallback. Run
   `npx playwright test e2e/landing.spec.ts --workers=2`.

The encoder needs H.264 support. If no full FFmpeg is installed, a temporary
encoder can be obtained without changing project dependencies:

```sh
python3 -m pip install --target /tmp/noodlyn-video-tools imageio-ffmpeg==0.8.1
PYTHONPATH=/tmp/noodlyn-video-tools python3 -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'
```

Use the printed path as `FFMPEG_PATH`. The capture uses only fixture account and
coach responses; it never signs in to or modifies a real account. It repeats the
score three times and captures a middle cycle, with a deterministic browser
clock and actual on-screen piano events. No demo playback is recorded. The tiny
measure numbers return to the start of the captured cycle when the video loops.

To change the phrase, update the measure selection and source timing in
`scripts/build-landing-loop.py`, then regenerate both score and capture. Keep the
duration aligned to whole bars. To refresh only the original still, run
`node scripts/capture-landing-practice.mjs`; the video capture never overwrites it.

No production deployment or database change is needed to regenerate these files.

## Live full-tune experiment

The video landing is preserved by tag **`noodlyn-landing-video-v1`** at
`b52c334c` (also on `codex/noodlyn-landing-page`). The experiment lives on
`codex/noodlyn-live-demo`. No video, capture source, or original image was removed.

- `/`: live full-tune performance, using the production `NoteHighway`, `PianoKey`,
  `NoteRail`, piano geometry, and acoustic sample engine.
- `/?preview=video`: the original 24-second video for side-by-side comparison.
- `src/components/landing/demoScore.ts`: imports the complete bundled St Louis
  Blues sequence (317 notes, 120 BPM). Includes the complete final note and pads
  to a bar boundary: 226 seconds. The next repetition approaches before the wrap.
- `LivePracticePreview.tsx`: a read-only transport feeds player highlights and
  solid player notes. It has no account, coaching, microphone, MIDI, scoring, or
  practice progress calls. The separate catalog reads only published global tunes. Its keys are inert and disabled. It does not alter the
  normal signed-in practice flow.
- The fixed 1194 × 834 viewport scales inside the existing iPad, sharing the
  renderer/key geometry instead of duplicating drawing code.
- Attempts acoustic audio automatically on arrival. If browser autoplay policy blocks it, the first non-control tap/click/key or the Play button unlocks sound. The single Play/Pause control pauses both sound and motion. Only acoustic samples are requested. Until those
  samples finish loading, the performance stays silent; it never plays the
  synth fallback. A failed/slow sample load offers retry after 15 seconds.
- Pause, hidden tabs, and offscreen visibility stop the transport and release
  active audio. Resume continues at the same position. Reduced motion, loading,
  and graphics errors use the retained original still.

To compare locally, run `npm run dev` and open the two URLs above. To restore the
video as the default, switch to the preserved landing branch after saving any
experiment changes, or change the preview selection in `Landing.tsx`.

Validation: `npx playwright test e2e/landing.spec.ts e2e/landing-live.spec.ts`.
The sound regression uses a tiny local WAV response to exercise decoding and
voice scheduling without depending on the external sample CDN. Manually verify
real sample playback as well when changing audio.

Sound follows mouse proximity to the **viewport centre**, using a smooth radial
curve: 5% at/outside the edges, at most 30% in the centre, with a 200 ms gain ramp.
Mobile/iPad and other touch-capable devices keep a steady 5%, even with a mouse attached. This gain belongs only to this preview's
sampler; it never changes shared/master audio or signed-in practice volume.


### Library navigation

The caption contains only previous/next chevrons, the selected tune title, and
Play/Pause. Playback state survives tune changes; the new tune starts at the
beginning, with its own duration, tempo, composer, and adaptive keyboard range.
The acoustic sampler stays mounted, so switching tunes does not reload samples.

`useDemoLibrary.ts` reads `tune_assets` with `is_global = true` and a published
curriculum version. It does not read account profiles/progress, write positions,
or alter RLS. Anonymous access remains governed by existing database policies.
If that request fails, times out, or returns no public tunes, it uses bundled
local library scores. Grouped note exports win; otherwise all instrument exports
are combined, preserving their note timing. The original St Louis Blues stays
the initial hero tune. Cloud-only private uploads are never offered here.


### Viewport layout

The page uses the viewport height; the iPad scales to the remaining room after
the heading, controls, and two feature blocks. The iPad and transport are
centred together. The compatibility and MXL/coaching blocks stay side by side.
Short viewports use compact spacing. Reduced motion still uses the retained
image and disables the CTA border animation.

Audio autoplay respects browser policy. Samples preload, but a suspended
AudioContext is treated as blocked autoplay rather than a sample-load failure.
Automated checks cover real permitted Chromium autoplay and a blocked-until-
interaction path on Chromium/WebKit, plus eight portrait/landscape viewport sizes.
