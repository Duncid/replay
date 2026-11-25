# TuneMaster prompt rewrite + debug tune review screen

## 1. Rewrite the TuneMaster prompt
Update `tooling/tuneMaster.md` and its copy used by the upload function:
- Remove "4–6 seconds per nugget" and "start at beat 1 by default"; size nuggets by musical phrase (usually 2–4 bars, sometimes 1).
- Lead-ins: if a phrase starts before the bar line, the nugget starts there and the previous one ends just before.
- Required first step: return a `form` field describing sections (intro, A, A repeat, B...) and phrases with bar ranges; cuts only at those boundaries.
- Name and one-sentence description become mandatory for every nugget.
- Fill "builds on" when a nugget reuses an earlier pattern.
- Repeats: mark a repeated passage with `sameAs: "N3"` (recorded in the plan; skipping/sharing progress in practice comes later).
- Final self-check: no phrase split mid-way, lead-ins kept, repeats marked.
- Plan validation accepts the new `form` and `sameAs` fields (extra fields are ignored if the worker does not know them yet).

## 2. Debug mode: tune review screen
- With Debug on, tapping a tune in the student list opens the Tune Manager on that tune instead of starting practice.
- New first option "Overview" in the Full / Nuggets / Assemblies selector, selected by default.
- Overview = one scrollable list of every nugget, then assemblies, then the full tune, ordered smallest to largest (by note count, then bar length). Each row: name, bars, note count, hand info, a mini piano-roll preview and a play button. Rows with identical notes are flagged "Duplicate of N3" to make repeats obvious.
- "Publish" button in the top right of this screen, reusing the existing publish flow.
- Debug off: student list behaves exactly as today.

## 3. Pipeline check (after build)
Rebuild The Entertainer and the Waltz with the new prompt, then review the Overview together: phrase cuts, lead-ins, duplicates, names. Set The Entertainer's composer to Scott Joplin.

## Technical notes
- Debug routing in `src/pages/Index.tsx` (switch to the `lab` mode with the selected tune key); add `"overview"` to `TargetType` in `TuneManagement.tsx` as default.
- Duplicate detection: compare normalized pitch/relative-onset lists of each item's note sequence.
- Rebuilding uploaded tunes uses `tune-build`; worker (Modal) changes are not needed for prompt-only edits, but the multi-track worker fix is still undeployed.
- Add a small test for the smallest-first ordering and duplicate flag.
