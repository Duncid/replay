# Upload flow fixes and in-card progress

## 1. Remove "Recent uploads"
Delete the recent uploads list at the bottom of the upload window.

## 2. Stop the form flashing back during the build
Cause: once the score finishes uploading, the window briefly forgets it is building (it waits for the first progress update from the server), so the "Name your tune" form reappears for a moment. Fix: as soon as a build starts, the window stays in progress mode until the build ends.

## 3. Capitalize every word of the title
Today capitalization is only applied when the title comes from the score's built-in info. When the score has no title, the title falls back to the file name, which is not capitalized — that is likely what you hit. Fix: apply the same rule to the file-name fallback and to the final title when you press Build (so "waltz in a minor" and "the_entertainer" both become capitalized). Words you type in capitals stay as typed.

## 4. Progress shown on the tune card instead of the window
- After you press Build, the window closes right away.
- A new card appears at the end of your tune list (just before "Add a tune") with the title, composer, and the current step ("Uploading", "Reading", "Planning", "Cutting", "Adding") plus a thin progress bar.
- The card can't be played while building. When the build finishes, it turns into a normal playable tune card in the same spot.
- If the build fails, the card shows "Failed" with a Retry button and a dismiss (x) button.
- Builds keep running if you leave the page; reopening the app shows the card again with current progress.
- The Admin → Upload route keeps the same behavior (closes and shows the card).

## Technical details
- `TuneUploadDialog.tsx`: remove recent-jobs block; derive `showProgress` from `activeJob || uploading`; apply `titleCase` to fallback and on submit; on successful `startBuild`, close dialog.
- New hook `useActiveTuneBuilds` (queries the user's `tune_build_jobs` with status running or recently failed, polls every 2s while any running; invalidates tune queries on success).
- `TuneCarousel.tsx`: render a `BuildingTuneCard` per active job before the add tile; it reuses `TuneCard` styling with a step label + progress bar, Retry (`tune-build` `retry`) and dismiss (local hide).
- Uploading the file itself happens before the window closes so the file is not lost; the card then takes over.
- Test: extend `e2e/upload-metadata.spec.ts` for filename-fallback capitalization.
