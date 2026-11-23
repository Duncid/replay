#if DEBUG
import SwiftUI
import QuartzCore

/// Opt-in instrumented Debug run. Timing/scoring/rendering retain their production paths.
struct NativePerformanceView: View {
    @StateObject private var model = LessonViewModel(preview: true)
    @StateObject private var probe = NativePerformanceProbe()
    var body: some View {
        RootView().environmentObject(model).preferredColorScheme(.dark)
            .task { await probe.run(model) }
    }
}

@MainActor
private final class NativePerformanceProbe: ObservableObject {
    private var started = false
    private var collecting = false
    private var frames: [Double] = [], updates: [Double] = [], audioErrors: [Double] = []
    private var firstAudio: Double?
    private let launch = CACurrentMediaTime()
    private var count = 200, seconds = 8
    private var full = false

    private func report(_ fields: [String: Any]) {
        var result: [String: Any] = ["schema": 2, "platform": "native", "notes": count, "seconds": seconds, "full": full]
        fields.forEach { result[$0.key] = $0.value }
        if let data = try? JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]), let json = String(data: data, encoding: .utf8) {
            print("[Replay Performance] " + json); fflush(stdout)
        }
    }
    private func percentile(_ values: [Double], _ fraction: Double) -> Double {
        let sorted = values.sorted()
        return sorted.isEmpty ? 0 : sorted[Int(Double(sorted.count - 1) * fraction)]
    }
    private func wait(allowInactive: Bool = false, _ condition: () -> Bool) async throws {
        let deadline = CACurrentMediaTime() + 45
        while !condition() {
            if CACurrentMediaTime() > deadline { throw ProbeError.timeout }
            if !allowInactive && UIApplication.shared.applicationState != .active { throw ProbeError.background }
            try await Task.sleep(nanoseconds: 16_000_000)
        }
    }
    private enum ProbeError: Error { case timeout, background, workload, audioUnavailable }

    func run(_ model: LessonViewModel) async {
        guard !started else { return }; started = true
        let args = ProcessInfo.processInfo.arguments
        count = args.first(where: { $0.hasPrefix("--performance-notes=") }).flatMap { Int($0.split(separator: "=").last!) } ?? 200
        seconds = args.first(where: { $0.hasPrefix("--performance-seconds=") }).flatMap { Int($0.split(separator: "=").last!) } ?? 8
        full = args.contains("--performance-full")
        defer {
            collecting = false
            model.stopDemo()
            model.highway.performanceFrame = nil; model.highway.performanceUpdate = nil
            model.piano.performanceNote = nil
        }
        do {
            guard [200, 1000, 5000].contains(count), (2...20).contains(seconds) else { throw ProbeError.workload }
            guard model.piano.isReady else { throw ProbeError.audioUnavailable }
            try await wait(allowInactive: true) { UIApplication.shared.applicationState == .active }
            frames.reserveCapacity(seconds * 130); updates.reserveCapacity(seconds * 130)
            report(["phase": "startup", "probeReadyMs": (CACurrentMediaTime() - launch) * 1000,
                    "os": UIDevice.current.systemVersion, "thermalState": ProcessInfo.processInfo.thermalState.rawValue,
                    "lowPowerMode": ProcessInfo.processInfo.isLowPowerModeEnabled, "reducedMotion": UIAccessibility.isReduceMotionEnabled])
            model.preparePerformanceFixture(count: count)
            model.highway.performanceFrame = { [weak self] in
                guard let self, self.collecting else { return }
                self.frames.append(CACurrentMediaTime())
            }
            model.highway.performanceUpdate = { [weak self] ms in
                guard let self, self.collecting else { return }; self.updates.append(ms)
            }
            model.piano.performanceNote = { [weak self] expected, actual in
                guard let self else { return }
                self.firstAudio = self.firstAudio ?? CACurrentMediaTime()
                self.audioErrors.append(abs(actual - expected) * 1000)
            }
            let selected = CACurrentMediaTime()
            model.startTune("performance-fixture")
            let loaded = CACurrentMediaTime()
            try await wait { model.highway.isPresentationReady }
            let ready = CACurrentMediaTime()
            let screen = model.highway.view?.window?.windowScene?.screen
            report(["phase": "tune-ready", "elapsedMs": (ready - selected) * 1000, "loadMs": (loaded - selected) * 1000,
                    "scenePoints": [model.highway.size.width, model.highway.size.height], "maximumFramesPerSecond": screen?.maximumFramesPerSecond ?? 0])
            model.playDemo()
            try await wait { firstAudio != nil }
            report(["phase": "audio-start", "sceneToAudioMs": (firstAudio! - ready) * 1000, "selectionToAudioMs": (firstAudio! - selected) * 1000])
            collecting = true
            let end = CACurrentMediaTime() + Double(seconds)
            while CACurrentMediaTime() < end {
                if UIApplication.shared.applicationState != .active { throw ProbeError.background }
                try await Task.sleep(nanoseconds: 100_000_000)
            }
            collecting = false
            let gaps = zip(frames.dropFirst(), frames).map { ($0 - $1) * 1000 }
            guard !gaps.isEmpty else { throw ProbeError.timeout }
            let elapsed = (frames.last! - frames.first!) * 1000
            report(["phase": "playback", "frames": gaps.count, "elapsedMs": elapsed, "fps": Double(gaps.count) * 1000 / elapsed,
                    "frameP50Ms": percentile(gaps, 0.5), "frameP95Ms": percentile(gaps, 0.95), "frameP99Ms": percentile(gaps, 0.99),
                    "maxFrameMs": gaps.max()!, "over25Ms": gaps.filter { $0 > 25 }.count, "over50Ms": gaps.filter { $0 > 50 }.count,
                    "sceneUpdateP95Ms": percentile(updates, 0.95), "audioNotes": audioErrors.count,
                    "audioDispatchErrorP95Ms": percentile(audioErrors, 0.95), "maxAudioDispatchErrorMs": audioErrors.max() ?? 0,
                    "thermalState": ProcessInfo.processInfo.thermalState.rawValue])
            report(["phase": "complete"])
        } catch { report(["phase": "error", "message": String(describing: error)]) }
    }
}
#endif
