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
