# Practice without AI

`tune-coach` and `tune-evaluate` prefer validated AI responses. Missing
`LOVABLE_API_KEY`, gateway/network errors, an eight-second timeout, malformed JSON
or invalid tool output activate their deterministic fallbacks. Authentication,
score loading and persistence remain outside the AI error boundary. Both paths
return the existing response shape used by the web and native apps.

## Planning

`fallback.ts` schedules a short plan from the profile's existing state:

- Review one attempted but unstable nugget, then learn up to two more.
- Follow `teachingOrder`, appending omitted nuggets in score order. Only nugget
  references in `dependsOn` are prerequisites; motif IDs are not.
- A current streak of two makes a nugget stable. Explicit `sameAs` repetitions
  share readiness with their original passage.
- Add up to two assemblies whose component nuggets are already stable,
  progressing from lower to higher tiers. Scheduled work is not treated as passed.
- Offer the full tune when all unique nuggets are stable and a highest-tier
  assembly is stable, or when the score has no valid assemblies. Scores with only
  a full-tune asset can start there directly.

Instructions and feedback have English and French templates; other languages
fall back to English.

## Evaluation

`../tune-evaluate/fallback.ts` uses weighted edit distance to find the best
contiguous matching passage, ignoring unrelated recording prefixes and suffixes.
Internal extra/missing/wrong notes prevent a pass. Chords allow small onset
offsets and doubled unisons; rapid melodic notes remain separate.

A pass requires exact pitches/order and onset intervals within 30%, with a small
absolute tolerance and extra allowance for repeated-note rearticulation. Note
release durations are not graded except for isolated sustained notes. Minor pitch
edits or moderate timing errors return `close`; larger errors return `fail`.

Each request credits at most one success, using the existing state/run writes.
Three successes in the full-tune streak allow acquisition and associated skill
awards. The fallback never acquires an entire tune from an assembly alone.

## Validation and deployment

Run `npm run test:tune-fallback` (also included in `npm run check`). Tests cover the
pure algorithms and the actual handlers with mocked platform boundaries, including
failure modes, response enrichment, saved runs, streaks and acquisition.

Deploy both edge functions to activate this behavior. No Modal worker, database
migration or native app update is required. Local tests do not verify a deployed
in-app practice session.
