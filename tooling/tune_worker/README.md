# Hosted tune builder (Modal)

The in-app MusicXML uploader runs the Python tune pipeline on Modal. **Pulling or pushing Git changes, or publishing the web app in Lovable, does not redeploy this worker.** Changes in `tooling/tune_worker/`, `tooling/tune_pipeline/`, or the worker image require a separate Modal deployment.

## Current deployment

Verified by a successful CLI deployment on 2026-11-24 from commit `b1d8c693`:

| Setting | Value |
| --- | --- |
| Workspace / local profile | `duncid` |
| Environment | `main` |
| App | `replay-tune-worker` |
| Function | `build` (handles both `prepare` and `build` actions) |
| Endpoint | `https://duncid--replay-tune-worker-build.us-east.modal.run` |
| Dashboard | [Modal deployment and logs](https://modal.com/apps/duncid/main/deployed/replay-tune-worker) |
| Modal secret | `tune-worker`, containing `TUNE_WORKER_SECRET` |

That deployment confirmed the code was uploaded; it did **not** verify a real in-app build. Use the verification steps below after each deployment. Treat the URL printed by a successful deploy as authoritative and compare it with the backend's `TUNE_WORKER_URL`.

## Redeploy an existing installation

From the repository root, pull the intended revision, then deploy from `tooling/` so Modal can find both Python packages:

```bash
git pull --ff-only
git log -1 --oneline
cd tooling
uv tool run --with fastapi modal deploy tune_worker/modal_app.py --profile duncid --env main
```

The `uv tool run --with fastapi` form works even when `modal` is not on your shell's PATH. It supplies the local deployment dependencies without changing `tooling/pyproject.toml`. If Modal and FastAPI are already installed in your active Python environment, the equivalent command is:

```bash
modal deploy tune_worker/modal_app.py --profile duncid --env main
```

Wait for **`App deployed`** and a successful exit. This uploads the local `tune_pipeline` and `tune_worker` source and builds/reuses the image defined in `modal_app.py`. Deploy the intended local revision; uncommitted Python changes can also be included. Routine redeployment reuses the existing secret.

### Verify and retry

1. Check the deployment timestamp and function in the Modal dashboard linked above.
2. In the app's upload dialog / Tune Management, find the failed job under **Recent uploads** and click **Retry**. The backend reuses the stored source path and creates a fresh signed download URL; do not upload the file again while the source still exists.
3. Wait for `succeeded`, select the job, and review the nugget and assembly counts. Publishing is a separate **Publish** action; rebuilding does not publish the tune.
4. If it fails, capture the job ID, time, and full error from the status tooltip or `tune_build_jobs.error`, then inspect the worker logs and the `tune-build` edge-function logs. The visible status text is truncated to 40 characters.

Fetch recent worker logs:

```bash
uv tool run --with fastapi modal app logs replay-tune-worker --profile duncid --env main
```

Add `--follow` to stream logs while retrying. A successful deployment alone does not establish that score parsing, AI planning, or publishing succeeds.

## First-time setup on another computer

With `uv` installed (also used by the [local Python tooling workflow](../../docs/python-venv-runbook.md)), authenticate:

```bash
uv tool run --with fastapi modal token new
uv tool run --with fastapi modal profile list
```

Complete the browser login with an account that has access to the `duncid` workspace. The CLI stores its authentication token in `~/.modal.toml`; never commit or paste that file. Confirm the resulting profile before deploying. The commands above explicitly target profile `duncid` and environment `main`; use the appropriate profile name if your local setup differs.

The local Modal login token and `TUNE_WORKER_SECRET` are different credentials: the first permits deployments; the second authenticates backend requests to the running worker. MCP is not required for deployment or the app's runtime requests.

### Configure a new backend / worker installation

Skip secret creation for routine redeployments of the existing installation.

| Location | Required configuration |
| --- | --- |
| Modal secret `tune-worker` | `TUNE_WORKER_SECRET`: a long random shared value |
| Lovable Cloud backend secrets | `TUNE_WORKER_SECRET`: exactly the same value; `TUNE_WORKER_URL`: the deployed function URL |
| Backend database | `tune_build_jobs` and its policies from `drizzle/migrations/0003_tune_build_jobs.sql` |
| Backend storage | Private `tune-sources` bucket and the admin upload/read policies from that migration |
| Backend functions | Current `tune-build` and `tune-publish`; AI gateway access is configured on the backend, not Modal |

The migration adds storage policies but does not create the bucket. Ensure it exists when setting up a new backend.

Create the Modal secret through its dashboard, or use a private dotenv file outside the repository with a single `TUNE_WORKER_SECRET` entry:

```bash
uv tool run --with fastapi modal secret create tune-worker --from-dotenv /absolute/path/to/private-worker.env --profile duncid --env main
```

Keep the file private and out of version control; do not put the value directly in shell history. Configure the matching backend secret, deploy, and set the backend URL from the deploy output. When intentionally rotating the shared secret, update both locations together and redeploy the worker so its containers use the new value. CLI secret replacement requires `--force`.

## Request flow and deployment boundaries

1. An admin uploads `.mxl`, `.xml`, or `.musicxml` to `tune-sources`. MIDI-only uploads are not supported. The worker caps downloaded input at 5 MiB.
2. `tune-build` enforces `requireAdmin`, creates/reuses a `tune_build_jobs` row, marks it `running`, and signs a storage URL valid for 300 seconds.
3. The backend calls the worker with `action: "prepare"` to obtain compact measure/note data. It asks TuneMaster through the AI gateway for a teaching plan.
4. The backend calls the same endpoint with `action: "build"` and the optional plan. The worker uses the shared Python pipeline and returns a `tune-publish` bundle. The backend falls back to the pipeline heuristic if planning fails, or retries without the plan if a planned build fails.
5. The backend stores the result and terminal status. The user reviews and publishes it through `tune-publish`.

The endpoint is public at Modal's routing layer but the handler requires an HMAC-SHA256 signature over `<timestamp>.<raw request body>`, using `x-timestamp` and `x-signature`. It rejects timestamps more than 300 seconds from the worker clock. Keep the shared secret server-side; the browser never calls the worker directly.

| Changed code/configuration | Deployment needed |
| --- | --- |
| `tooling/tune_worker/`, `tooling/tune_pipeline/`, image dependencies | Redeploy Modal |
| `supabase/functions/tune-build/` (including its TuneMaster prompt copy) | Deploy the backend edge function |
| Upload / management React components | Publish the web app |
| Job schema or storage policies | Apply the backend migration |

The worker image currently uses Python 3.11 and pins `music21==9.9.1`. Its dependencies are defined in `modal_app.py`; Modal does not automatically use `tooling/uv.lock`. The local CLI uses the local tooling environment and does not call the hosted worker. See the [local pipeline runbook](../../docs/python-venv-runbook.md).

## Troubleshooting

| Symptom | Check / action |
| --- | --- |
| `modal: command not found` | Use the `uv tool run --with fastapi modal ...` commands above. |
| `Token missing` | Run `modal token new` through `uv`, finish browser login, and check the profile. |
| Secret `tune-worker` not found | Check workspace and environment; provision the secret only for the intended installation. |
| `Tune builder is not connected yet` | Set both backend worker secrets. |
| Worker returns `Unauthorized` / 401 | Compare shared secrets, selected endpoint, and clock/timestamp. An unsigned browser or curl request should fail authentication. |
| Bare `Builder error (422)` | Check that the backend URL points at the intended deployment and redeploy the latest worker. The November 2026 fix included the FastAPI request annotation and error reporting. A bare 422 alone is not proof of stale code; inspect validation details and logs. |
| 422 with a score/plan explanation | Inspect the actual error. Caught pipeline/build exceptions return an `error` string; malformed requests, download failures, or container startup failures may instead need logs. |
| `Uploaded file not found` | Check the source object and storage configuration. Retry reuses the file; it cannot recover a deleted source. |
| Timeout or job remains `running` | Inspect worker and edge-function logs before starting another build. Calls are synchronous: Modal has a 120-second function limit; backend prepare/build fetch limits are 60/140 seconds. The signed source URL lasts 300 seconds across planning and fallback attempts. These limits do not extend the edge runtime's own lifetime. |
| `succeeded` with a TuneMaster warning | The heuristic fallback succeeded. Inspect `result.briefing.planner` (`tunemaster` or `heuristic`). The current UI may show an error toast for this non-empty warning even though the job succeeded; select the succeeded job to review it. |

## Local verification

From `tooling/`, run the worker and shared pipeline tests when changing build behavior:

```bash
uv sync --group dev
uv run env PYTHONPATH=. python -m pytest tune_worker/tests tune_pipeline/tests
```

These tests cover local pipeline behavior, not Modal authentication, the deployed HTTP handler, or backend integration. Follow them with deployment and an in-app retry/build to verify the full path.
