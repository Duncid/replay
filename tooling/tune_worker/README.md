# Tune worker

Hosted wrapper that lets admins upload a MusicXML score in the app and get nuggets/assemblies built by the unchanged `tune_pipeline`.

1. `pip install modal && modal setup`
2. `modal secret create tune-worker TUNE_WORKER_SECRET=<long random string>`
3. From `tooling/`: `modal deploy tune_worker/modal_app.py` — copy the printed `build` URL.
4. In the app backend secrets, set `TUNE_WORKER_URL` (that URL) and `TUNE_WORKER_SECRET` (same string).

Tests (from `tooling/`): `uv run pytest tune_worker/tests`. MIDI-only uploads are rejected for now.
