# System tunes and account tunes

## What changes for you
- Every tune is either a **System tune** (provided by Noodlyn, seen by every account, only admins can change it) or an **Account tune** (belongs to one account; its owner can add, rename, delete and rebuild it).
- The tune list shows a small "Noodlyn" badge on System tunes. Account tunes show edit/delete options to their owner; System tunes show none to non-admins.
- Any user can **Remove** a System tune from their list: it is only hidden for their account, with progress kept. A "Hidden Noodlyn tunes" section in the Add a tune window lets them **Add back** any hidden tune, and it returns to the end of their list.
- Admins get two new actions in Tune Manager on any of their account tunes:
  - **Promote to System tune** — the tune becomes visible to everyone.
  - **Replace a System tune with…** — pick a System tune, then pick a tune from your account library; the System tune keeps its name, its place in everyone's list and players' progress where possible, but now plays the new music.
- Admins can also **Demote** a System tune back to their account.

## Data cleanup (one-time)
System tunes become: Intro, When The Saints Go Marching In, St. Louis Blues, The Entertainer, Ode to Joy (currently titled "Hymne À La Joie"), Clair De Lune.
Everything else stays as your personal account tunes: Gymnopédie No. 1 (currently visible to everyone, will become private), Amazing Grace, Boogie Woogie Licks, Greensleeves, Prélude En Do, Waltz in A Minor.
Should "Hymne À La Joie" be renamed "Ode to Joy"? Default: keep the current title.

## Technical details
- Keep `tune_assets.is_global` as the System flag and `owner_user_id` as account owner (no new column). Backfill: set `is_global=true` on all versions of `intro`, `when-the-saints-go-marching-in`, `st-louis-blues`, `the-entertainer`, `hymne-a-la-joie`, `clair-de-lune`; `false` on the rest.
- Enforcement in edge functions (`tune-manage`, `tune-publish`, `tune-build`): owners may delete/rename/rebuild their non-global tunes; any write touching a global tune requires `requireAdmin`. Add `tune_assets` owner DELETE policy only for non-global own rows; admin policies unchanged.
- `tune-manage` new actions: `promote` / `demote` (admin, replaces `set-global`), `replace-system` (admin): copies the newest published asset of the source account tune into a new version under the System tune's key (keeping title/composer unless chosen otherwise, `is_global=true`), so `tune_list_positions` and `tune_nugget_state` keyed by tune_key stay valid; nugget progress with no matching nugget id is simply ignored. Source tune left untouched.
- Hiding: new table `hidden_system_tunes` (auth_user_id, tune_key, created_at; owner-only RLS and grants, unique per account+key). Web and native libraries filter hidden keys; adding back deletes the row and appends a `tune_list_positions` entry at the end.
- UI: `useTuneLibrary` exposes `isSystem`; `TuneCard` badge; `TuneManagement` action menu with a picker dialog for replace. Native iPad reads `is_global` already — add badge only.
- Tests: hide/add-back rules, plus rule tests for who may edit/delete/promote/replace (owner vs other user vs admin, system vs account), plus replace keeps key and list position.
- AGENTS.md: update the tune visibility rule to describe System vs Account tunes.
