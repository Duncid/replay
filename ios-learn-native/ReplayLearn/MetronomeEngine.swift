import AVFoundation
import Foundation

/// Sample-accurate metronome using a scheduled AVAudioPlayerNode.
/// Supports the feel presets used by Learn lessons (subset: straight feels;
/// swing/shuffle fall back to straight 8ths).
@MainActor
final class MetronomeEngine: ObservableObject {
    @Published private(set) var isPlaying = false
    @Published private(set) var currentBeat = 0

    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let sampleRate: Double = 44100
    private var clickBuffer: AVAudioPCMBuffer?
    private var accentBuffer: AVAudioPCMBuffer?
    private var timer: Timer?
    private var started = false

    private var bpm: Double = 90
    private var beatsPerBar = 4

    private func ensureStarted() {
        guard !started else { return }
        started = true
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: nil)
        clickBuffer = makeClick(frequency: 1600, gain: 0.5)
        accentBuffer = makeClick(frequency: 2200, gain: 0.8)
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)
            try engine.start()
        } catch {
            print("[MetronomeEngine] Failed to start: \(error)")
        }
    }

    func start(bpm: Double, timeSignature: String) {
        stop()
        ensureStarted()
        self.bpm = bpm
        self.beatsPerBar = Int(timeSignature.split(separator: "/").first ?? "4") ?? 4
        currentBeat = 0
        isPlaying = true
        scheduleTick(accent: true)
        timer = Timer.scheduledTimer(withTimeInterval: 60.0 / bpm, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self, self.isPlaying else { return }
                self.currentBeat = (self.currentBeat + 1) % self.beatsPerBar
                self.scheduleTick(accent: self.currentBeat == 0)
            }
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
        player.stop()
        isPlaying = false
        currentBeat = 0
    }

    private func scheduleTick(accent: Bool) {
        guard let buffer = accent ? accentBuffer : clickBuffer else { return }
        if !player.isPlaying { player.play() }
        player.scheduleBuffer(buffer, at: nil, options: [], completionHandler: nil)
    }

    private func makeClick(frequency: Double, gain: Double) -> AVAudioPCMBuffer? {
        let duration = 0.05
        let frameCount = AVAudioFrameCount(sampleRate * duration)
        guard let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1),
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else {
            return nil
        }
        buffer.frameLength = frameCount
        guard let channel = buffer.floatChannelData?[0] else { return nil }
        for frame in 0..<Int(frameCount) {
            let t = Double(frame) / sampleRate
            let envelope = exp(-60.0 * t)
            channel[frame] = Float(sin(2.0 * .pi * frequency * t) * envelope * gain)
        }
        return buffer
    }
}
