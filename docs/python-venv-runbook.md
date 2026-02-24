## Python venv runbook

Use this when working on the local `tooling/` pipeline.

### Create and activate
- Create the venv: `python3 -m venv tooling/venv`
- Activate it: `source tooling/venv/bin/activate`

### Install pipeline dependencies
- Install editable package: `pip install -e tooling`
- If pip fails with SSL errors, retry with trusted hosts:
  `pip install -U pip setuptools wheel --trusted-host pypi.org --trusted-host files.pythonhosted.org --trusted-host pypi.python.org`
  `pip install -e tooling --trusted-host pypi.org --trusted-host files.pythonhosted.org --trusted-host pypi.python.org`

### Pipeline process

#### Step 1: Extract and clean
- Command: `python -m tune_pipeline.extract src/music/st-louis-blues-complex`
- What it does: unpacks `tune.mxl` and removes very short ghost notes.
- Output:
  - cleaned `tune.xml` in the tune folder
  - `tune.ns.json` (all MIDI instruments combined, from `tune.mid`)
  - `tune.instX.ns.json` per MIDI instrument track (for example `tune.inst1.ns.json`, `tune.inst2.ns.json`)

#### Step 2: Generate `teacher.json` (outside pipeline)
- This is done by the agent workflow, not by the Python pipeline itself.
- Make sure `teacher.json` is present in the same tune folder before Step 3.

#### Step 3: Build
- Preferred command: `tune-pipeline build src/music/st-louis-blues-complex`
- Equivalent command: `python -m tune_pipeline.cli build src/music/st-louis-blues-complex`
- What it does: builds output artifacts (full/hand splits, note sequence files, nuggets, assemblies, DSP XML).
- Output: `output/` directory under the tune folder.

### Deactivate
- `deactivate`
