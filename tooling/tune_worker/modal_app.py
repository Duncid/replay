"""Modal web endpoint for in-app tune builds.

Deploy from the ``tooling`` folder:  ``modal deploy tune_worker/modal_app.py``
Create the secret first: ``modal secret create tune-worker TUNE_WORKER_SECRET=<same value as the app>``
"""
from __future__ import annotations

import hashlib
import hmac
import os
import tempfile
import time
import urllib.request
from pathlib import Path

import modal

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("music21>=9.1.0", "networkx>=3.2", "pretty_midi>=0.2.10", "pydantic>=2.6.0", "fastapi[standard]")
    .add_local_python_source("tune_pipeline", "tune_worker")
)
app = modal.App("replay-tune-worker", image=image)
MAX_BYTES = 5 * 1024 * 1024


@app.function(secrets=[modal.Secret.from_name("tune-worker")], timeout=120)
@modal.fastapi_endpoint(method="POST")
async def build(request: "fastapi.Request"):  # type: ignore[name-defined]  # noqa: F821
    from fastapi.responses import JSONResponse
    from tune_worker.build import BuildError, build_bundle_from_file

    raw = await request.body()
    ts = request.headers.get("x-timestamp", "")
    sig = request.headers.get("x-signature", "")
    secret = os.environ["TUNE_WORKER_SECRET"].encode()
    expected = hmac.new(secret, f"{ts}.".encode() + raw, hashlib.sha256).hexdigest()
    if not ts.isdigit() or abs(time.time() - int(ts)) > 300 or not hmac.compare_digest(expected, sig):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    import json
    body = json.loads(raw)
    url, filename, title = body.get("fileUrl"), body.get("filename", "tune.mxl"), body.get("title")
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / Path(filename).name
        with urllib.request.urlopen(url, timeout=30) as resp:
            data = resp.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            return JSONResponse({"error": "File too large (max 5 MB)"}, status_code=400)
        path.write_bytes(data)
        try:
            bundle = build_bundle_from_file(path, title)
        except BuildError as exc:
            return JSONResponse({"error": str(exc)}, status_code=422)
    return {"bundle": bundle}
