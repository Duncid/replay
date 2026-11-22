#!/bin/bash
set -euo pipefail

# Pass a booted iOS simulator UDID (or use the only booted simulator).
simulator="${1:-booted}"
native_root="$(cd "$(dirname "$0")/.." && pwd)"
smoke_dir="$(mktemp -d /tmp/replay-audio-smoke.XXXXXX)"
app="$smoke_dir/ReplayAudioSmoke.app"
bundle_id="com.playbk.audio-smoke"
mkdir -p "$app"

cat > "$app/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.playbk.audio-smoke</string>
<key>CFBundleExecutable</key><string>ReplayAudioSmoke</string>
<key>CFBundleName</key><string>ReplayAudioSmoke</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>MinimumOSVersion</key><string>18.6</string>
<key>UIDeviceFamily</key><array><integer>1</integer><integer>2</integer></array>
<key>UILaunchScreen</key><dict/>
</dict></plist>
PLIST

xcrun --sdk iphonesimulator swiftc -parse-as-library -swift-version 5 \
  -sdk "$(xcrun --sdk iphonesimulator --show-sdk-path)" \
  -target "$(uname -m)-apple-ios18.6-simulator" \
  "$native_root/ReplayLearn/Models.swift" \
  "$native_root/ReplayLearn/PianoAudioEngine.swift" \
  "$native_root/ReplayLearn/MetronomeEngine.swift" \
  "$native_root/Tests/AudioSmoke.swift" \
  -o "$app/ReplayAudioSmoke"
codesign --force --sign - "$app"
xcrun simctl install "$simulator" "$app"
trap 'xcrun simctl uninstall "$simulator" "$bundle_id" >/dev/null 2>&1 || true' EXIT
xcrun simctl launch --console --terminate-running-process "$simulator" "$bundle_id" | tee "$smoke_dir/output.log"
grep -q '^PASS: demo playback' "$smoke_dir/output.log"
