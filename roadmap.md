# Tune-first Replay

- [x] Prefill editable upload Title and Composer from original MusicXML/.mxl; retain confirmed credits in jobs and send them to publishing on builds/retries.

- [x] Add a composer field and automatic MusicXML extraction; populate Chopin/Satie and verify published credits.
- [ ] Deploy original-source composer extraction in the uploaded-tune worker (requires Modal deployment access, unavailable in this sandbox).

- [x] Fix instrument-only tune publishing for local tunes and uploaded tune bundles; preserve all practice-section notes.
- [ ] Deploy the uploaded-tune worker track-combination fix (requires Modal deployment access, unavailable in this sandbox).

- [x] Replace teacher-driven entry with a published tune library.
- [x] Show locked/unlocked tunes using existing tune progression and student completion.
- [x] Keep the current tune practice flow and return to the library.
- [x] Verify tune selection, locks, and practice; commit changes.
- [x] Add the same tune library and prerequisite-tune unlocks to the standalone native iPad app.
- [x] Add native tune practice using the existing highway and Cloud tune coach/evaluation functions.
- [x] Verify native logic where tooling permits and document Mac-only checks.
- [x] Keep Quest for tune progression management and place web management screens under the burger menu’s Admin submenu.
- [x] Restore Compose beside Tunes without changing its existing controls or behavior.
- [ ] Compile and verify native playback on iPad (requires a Mac with Xcode; unavailable in this sandbox).- [x] Add sign-in (email, Google, Lovable); owner-only data; admin-only management
- [x] Add an add-a-tune start screen: .mxl explanation, MuseScore link, then the file picker.
- [x] Make edouardwautier@gmail.com admin and attach existing data to it
- [x] Order the student tune list oldest published first so new uploads join the end.
