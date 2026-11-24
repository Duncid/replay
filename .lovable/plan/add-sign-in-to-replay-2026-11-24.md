# Add sign-in to Replay

## What you get
- A sign-in page with **email + password**, **Continue with Google** and **Sign in with Lovable**, plus "forgot password".
- Each person's progress (unlocked tunes, practice results, lesson history) belongs to their account and only they can see or change it.
- Compositions and quests belong to whoever created them.
- The Admin section (Quest, Tune Management) only shows for admins, and only admins can publish, rename or delete tunes and edit quests. Only you (edouardwautier@gmail.com, signing in with Google) are admin to start; more admins can be added later.
- The user menu shows the signed-in person with a "Sign out" item; the device-name "user switcher" goes away.

## Assumptions (tell me if wrong)
- The whole app needs sign-in (no browsing while signed out).
- All existing progress, compositions and quests are attached to your account the first time you sign in.
- Published tunes and the curriculum stay readable by any signed-in person, since everyone needs them to play.
- The native iPad app keeps working as today for now; adding sign-in there is a separate step.

## Technical details
- Enable email auth, Google and Lovable providers; `/auth` and `/reset-password` routes; session context with `onAuthStateChange`; route guard around Index.
- `profiles` (display name) with signup trigger; `user_roles` + `has_role()` with `admin`; signup trigger grants admin and claims all rows with null `user_id` when the email is edouardwautier@gmail.com.
- Add nullable `user_id uuid` to compositions, quest_graphs, lesson_runs, practice_sessions, tune_practice_runs, tune_nugget_state, user_skill_state, user_*_acquisition; client and edge functions write `auth.uid()` instead of `local_user_id`.
- Replace every `USING (true)` policy: owner-scoped (`user_id = auth.uid()`) for personal data; `authenticated` read + admin write for tune_assets/curriculum_*; drop anon grants; deprecate `local_users`/`local_user_id` with comments (not dropped).
- Edge functions (tune-evaluate, tune-coach, lesson-*, teacher-greet, tune-publish, tune-manage) validate the JWT and derive the user; publish/manage require admin.
- Update E2E tests to sign in with a test user; add tests: non-owner can't read another's runs, non-admin can't publish.
- Then mark the remaining 14 findings fixed.
