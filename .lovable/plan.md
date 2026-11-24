# Upload a score and build nuggets in the app

## Goal
From Tune Manager, an admin uploads a score (MusicXML .mxl/.xml or MIDI .mid), the app builds the nuggets and assemblies automatically, and the result appears as a tune ready to publish. The existing local pipeline (`tooling/tune_pipeline`, CLI `generate` / `build` / `build-all`, local `src/music/*/output` folders, Publish flow) stays exactly as it is.

## User experience
1. Menu > Admin > Tune Management > new item "Upload new tune...".
2. Dialog: file picker, title, tune key (auto-filled from title), optional tempo / time signature / hands (Right, Left, Both).
3. "Build" shows progress: Uploading > Building nuggets > Ready (or a readable error, e.g. "No piano part found").
4. On success the tune opens in Tune Manager as a draft preview (Full / Nuggets / Assemblies), then the existing Publish dialog (Create or Update) saves it. Nothing is written to published tunes until the admin clicks Publish.
5. Upload history list: date, file, status, error if any; failed builds can be retried.

## How it works
```text
Tune Manager (admin)
   | upload file
   v
File storage (private "tune-sources" bucket)
   | 
   v
Server function "tune-build" (checks admin, creates a build job)
   | sends signed file link
   v
Python worker (hosted, scale-to-zero) running the SAME tooling/tune_pipeline code
   | returns teacher.json, nuggets, assemblies, tune.xml, dsp.xml, note sequences
   v
"tune-build" stores the result on the job -> app shows preview -> existing Publish flow
```

## Keeping the pipeline intact
- No changes to existing pipeline modules or CLI behavior.
- The worker is a thin wrapper in a new folder `tooling/tune_worker/` that imports `tune_pipeline` as a library and calls the same functions the CLI `build` command uses, inside a temporary folder.
- If a small entry point is needed to call it without the CLI, it is added as a new function alongside, not a rewrite; existing pipeline tests must still pass unchanged.
- Local workflow (build locally, publish "Un-Published" folders) keeps working side by side.

## Hosting the worker
Recommended: Modal (one Python file, scale-to-zero, free monthly credit covers this volume). Alternative: Google Cloud Run (container). Either needs one account set up by you and one secret key stored in the backend; the worker only accepts calls signed with a shared secret.

## Technical details
- Storage: private bucket `tune-sources`, admin-only upload/read policies.
- Table `tune_build_jobs`: id, created_by, source_path, tune_key, title, options (json), status (queued/running/succeeded/failed), result (json bundle in the same shape as `tune_assets`), error, timestamps. RLS: admins only via `has_role()`.
- Edge function `tune-build`: `requireAdmin`, validates input with Zod, creates job, calls worker with signed URL + HMAC secret, saves result/error. Runs synchronously (builds take a few seconds) with a timeout; UI polls job status as fallback.
- Worker: FastAPI/Modal endpoint, verifies HMAC, downloads file, runs pipeline in a temp dir, returns bundle JSON, max file size ~5 MB, timeout 60 s.
- Frontend: upload dialog + job hook in Tune Manager; preview reuses the existing asset loader; Publish reuses `tune-publish` with the job bundle instead of a local folder bundle.
- Tests: worker test that a fixture score produces nuggets matching the local CLI output; check that non-admins cannot upload or start builds.

## Open points
- Hosting choice (Modal vs Cloud Run) and creating that account.
- Whether builds should go straight to publish (skip preview) later.
