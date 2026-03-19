#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "=== 1/4 Building web app ==="
npm run build

echo ""
echo "=== 2/4 Syncing to iOS (Capacitor) ==="
npx cap sync ios

echo ""
echo "=== 3/4 Running pod install ==="
cd ios/App
if command -v pod &>/dev/null; then
  pod install
else
  echo "[warn] CocoaPods not found — skipping. Install with: sudo gem install cocoapods"
  echo "        Or use Homebrew: brew install cocoapods"
fi

cd "$ROOT"
echo ""
echo "=== Opening Xcode ==="
npx cap open ios
echo "✓ Done."
