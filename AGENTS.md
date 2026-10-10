# Project Rules

- `ios-learn-native/` is a standalone Swift/SwiftUI iPad app (Learn mode only), separate from the Capacitor wrapper in `ios/` — keep the two native projects independent; the native app talks to the same Lovable Cloud edge functions and shares no code with the web app.
- Native note highway (`ios-learn-native/ReplayLearn/Highway/`): drawing (SpriteKit scene), timing (HighwayClock) and scoring (HitJudge) stay separate, and all nodes/effects are pooled up-front — keeps frame rate steady and scoring testable.
