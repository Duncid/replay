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

### Run the extraction step
- `python -m tune_pipeline.extract src/music/st-louis-blues`
- Output: cleaned `tune.xml` in the tune folder

### Deactivate
- `deactivate`
