#!/bin/bash
set -euo pipefail
simulator="${1:-booted}"
native_root="$(cd "$(dirname "$0")/.." && pwd)"
smoke_dir="$(mktemp -d /tmp/replay-native-smoke.XXXXXX)"
app="$smoke_dir/ReplayNativeSmoke.app"
bundle_id="com.playbk.native-smoke"
mkdir -p "$app"
cat > "$app/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.playbk.native-smoke</string>
<key>CFBundleExecutable</key><string>ReplayNativeSmoke</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>MinimumOSVersion</key><string>26.0</string>
<key>UIDeviceFamily</key><array><integer>2</integer></array>
<key>UILaunchScreen</key><dict/>
<key>UIAppFonts</key><array><string>SpaceGrotesk.ttf</string><string>JetBrainsMono.ttf</string></array>
</dict></plist>
PLIST
sources=()
while IFS= read -r file; do
  if [[ "$file" != *ReplayLearnApp.swift ]]; then sources+=("$file"); fi
done < <(rg --files "$native_root/ReplayLearn" -g '*.swift')
xcrun --sdk iphonesimulator swiftc -parse-as-library -swift-version 5 -D DEBUG \
  -sdk "$(xcrun --sdk iphonesimulator --show-sdk-path)" \
  -target "$(uname -m)-apple-ios26.0-simulator" \
  "${sources[@]}" "$native_root/Tests/NativeSmoke.swift" -o "$app/ReplayNativeSmoke"
cp "$native_root/ReplayLearn/Resources/Fonts/"*.ttf "$app/"
codesign --force --sign - "$app"
xcrun simctl install "$simulator" "$app"
trap 'xcrun simctl uninstall "$simulator" "$bundle_id" >/dev/null 2>&1 || true' EXIT
xcrun simctl launch --console --terminate-running-process "$simulator" "$bundle_id" | tee "$smoke_dir/output.log"
grep -q '^PASS: native flow' "$smoke_dir/output.log"
mkdir -p /tmp/replay-native-validation
container="$(xcrun simctl get_app_container "$simulator" "$bundle_id" data)"
cp "$container/Documents/"*.png /tmp/replay-native-validation/
echo "Layout snapshots: /tmp/replay-native-validation"
