## Python venv runbook

Use this when working on the local `tooling/` pipeline. The recommended tool in this repo is **uv** (see `tooling/pyproject.toml`).

### With uv (recommended)

```bash
cd tooling
uv sync --group dev
```

Run the CLI:

```bash
uv run env PYTHONPATH=. python -m tune_pipeline.cli --help
```

- **`generate`** — writes `teacher.json` in the tune folder from `tune.xml` (if present) or from instrument `tune.inst*.ns.json` / `tune.ns.json`. Curriculum (nuggets, assemblies, `teachingOrder`, `assemblyOrder`, labels, `dependsOn`) is **fully rule-generated**; you normally do not author `teacher.json` by hand.
- **`build`** — runs `generate` first, then validates `teacher.json` and writes everything under `output/` (full tune XML/NS, nuggets, assemblies, DSP XML). Use **`build --no-generate`** only when you want to freeze an existing `teacher.json`.
- **Single-track tunes** — put only **`tune.ns.json`** (or a single `tune.inst1.ns.json`) in the tune folder; do not add a second instrument unless it is real LH/RH data from the score. After build, **`output/tune.ns.json`** is written as a copy of the sole track so publishing and `getTuneNs` keep working; curriculum **`modes`** are **`["RH"]`** only.

Example from repo root:

```bash
cd tooling && uv run env PYTHONPATH=. python -m tune_pipeline.cli build ../src/music/intro
```

Build **every** tune folder under `src/music/` (each subfolder must contain `tune.ns.json`, `tune.inst*.ns.json`, and/or `tune.xml`):

```bash
cd tooling && uv run env PYTHONPATH=. python -m tune_pipeline.cli build-all ../src/music
```

Folders that only have **`tune.mxl`** / **`tune.mid`** need **extract** first (writes `tune.xml` + `tune.inst*.ns.json`):

```bash
cd tooling
for d in gymnopdie st-louis-blues st-louis-blues2; do
  uv run env PYTHONPATH=. python -m tune_pipeline.extract "../src/music/$d"
done
uv run env PYTHONPATH=. python -m tune_pipeline.cli build-all ../src/music
```

### Classic venv (optional)

- Create the venv: `python3 -m venv tooling/venv`
- Activate it: `source tooling/venv/bin/activate`
- Install: `pip install -e tooling` (if your tooling supports editable install) or use `PYTHONPATH=tooling` and install dependencies from `tooling/pyproject.toml`.

### Pipeline process

#### Step 1: Extract and clean (optional MXL path)

- Command: `python -m tune_pipeline.extract src/music/<tune-folder>`
- What it does: unpacks `tune.mxl` and removes very short ghost notes.
- Output:
  - cleaned `tune.xml` in the tune folder
  - `tune.ns.json` (combined MIDI, from `tune.mid` if present)
  - `tune.instX.ns.json` per MIDI instrument track

#### Step 2: Generate curriculum + build

- Put `tune.xml` and/or `tune.inst*.ns.json` (or `tune.ns.json`) in `src/music/<key>/`.
- Run: `tune-pipeline build src/music/<key>` (or `python -m tune_pipeline.cli build ...`).
- Results:
  - `teacher.json` — auto-generated curriculum
  - `output/` — artifacts consumed by the app (`tuneAssetBundler` globs)

### Deactivate

- `deactivate` (venv only)
