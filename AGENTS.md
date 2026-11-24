# Project Rules

- `ios-learn-native/` is a standalone Swift/SwiftUI iPad app (Learn mode only), separate from the Capacitor wrapper in `ios/` — keep the two native projects independent; the native app talks to the same Lovable Cloud edge functions and shares no code with the web app.
- Native note highway (`ios-learn-native/ReplayLearn/Highway/`): drawing (SpriteKit scene), timing (HighwayClock) and scoring (HitJudge) stay separate, and all nodes/effects are pooled up-front — keeps frame rate steady and scoring testable.
- The web student entry uses `TuneLibrary` and the existing `TuneMode`, without teacher selection calls; progression resolution stays in a pure utility because curriculum node keys can differ from published music references.
- Native student entry reads published tune assets and device-scoped acquisitions directly, then uses tune-coach/tune-evaluate with the pooled highway; pure Swift progression tests stay outside the app target so they can run without Apple UI frameworks.
- Web Quest and Tune Manager remain mounted as existing management views and are reached through the user menu's Admin submenu; this grouping is navigation, not a new authorization role.
- Shared dropdown submenus own mouse-exit dismissal and tag their portaled descendants so nested menus stay open during traversal while abandoned branches close; keyboard and touch behavior stays with Radix.
- Accounts own practice profiles (`local_users.auth_user_id`); per-player data stays keyed by `local_user_id` and is guarded by `owns_local_user()` in RLS and `_shared/auth.ts` in edge functions — reuses existing progress keys instead of re-keying every table.
- Admin rights come only from `user_roles`/`has_role()`; UI admin checks are display-only, while RLS and `requireAdmin` enforce them.
