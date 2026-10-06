#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if ! command -v pod >/dev/null; then
  echo "CocoaPods is required. Install it with a supported Ruby before syncing iOS."
  exit 1
fi

echo "Building web app"
npm run build

echo ""
echo "Syncing assets and native dependencies"
npx cap sync ios

echo "Opening Xcode"
npx cap open ios
echo "✓ Done."
