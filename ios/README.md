# iOS Build

## Setup

After cloning or pulling changes, run `pod install` in the `App` directory to install CocoaPods dependencies and apply build phase fixes.

## SwiftDriver Incremental Build Warnings

If you see "Could not read priors, will not do cross-module incremental builds" for App or Capacitor targets:

1. **Clear DerivedData:** Delete `~/Library/Developer/Xcode/DerivedData/App-*` (or use Xcode > Settings > Locations > Derived Data > arrow to open folder, then delete the App folder)
2. **Clean build:** Product > Clean Build Folder (Cmd+Shift+K)
3. **Rebuild** the project

If the warning persists, try **Whole Module** compilation: Build Settings > Swift Compiler - Code Generation > Compilation Mode > Whole Module.
