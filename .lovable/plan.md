# Upload card polish and a stable, arrangeable tune order

## 1. No checklist at all
The checklist still appears while the score file uploads (before the build starts). Pressing Build will now close the window immediately; the new card appears right away showing "Uploading", then continues with the build steps. If the upload itself fails, the card shows "Failed" with Retry.

## 2. Same illustration size
The building card's top area will use exactly the same height as the tune illustration on normal cards (so the card doesn't change size when the tune finishes).

## 3. Tunes keep their place, ready for user arrangement
Today the order is computed from publish dates, and rebuilding/republishing a tune can shift it — that's why the new tune moved. Instead, each account gets its own saved order:
- Each tune has a saved position in your list. A new upload is placed last, and stays there after the build finishes.
- Rebuilding or republishing never changes positions.
- Tunes without a saved position (e.g. a new global tune) are added at the end, oldest first.
- This sets up drag-to-reorder later; reordering itself is not part of this change.

## Technical details
- New table `tune_list_positions (auth_user_id uuid, tune_key text, position double precision, primary key (auth_user_id, tune_key))`, RLS: owner-only select/insert/update/delete; grants to authenticated. Seed current order for existing accounts from today's earliest-publication order.
- `useTuneLibrary`: sort by saved position, then unpositioned by earliest publication; append missing positions (max+1) in the background.
- Upload: when Build is pressed, upsert the tune_key at max+1 (keeps existing position if the key already exists, i.e. updates).
- `TuneUploadDialog`: close on Build; pass a local "pending upload" (title, composer, step state) to the tune list so the card shows before the server job exists; replaced by the server job once created.
- `BuildingTuneCard`: top area `h-[120px]` to match `TuneThumbnail`.
- Pure ordering helper in `src/utils/tuneLibrary.ts` with a test: positioned tunes first by position, new ones appended, republishing doesn't move.
- Update memory note on tune list order.
