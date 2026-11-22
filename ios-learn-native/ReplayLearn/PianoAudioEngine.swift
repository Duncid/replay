import AVFoundation
import Foundation

/// Piano playback engine. The engine and voice pool are created and warmed at
/// app launch so the first key press plays instantly — nothing is allocated on
/// note press.
///
/// Uses a small pool of pre-started AVAudioPlayerNodes with a synthesized
/// piano-ish tone (sine + harmonics with exponential decay). Swap `makeBuffer`
/// for sampled buffers later without touching the call sites.
@MainActor
final class PianoAudioEngine: ObservableObject {
    private let engine = AVAudioEngine()
    private var voices: [AVAudioPlayerNode] = []
    private var nextVoice = 0
    private let voiceCount = 16
    private var bufferCache: [Int: AVAudioPCMBuffer] = [:]
    // Player outputs must match the scheduled buffers. The mixer converts this
    // mono format to the device's channel count and sample rate.
    private let playbackFormat = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1)!

    @Published private(set) var isReady = false

    /// Call once at app launch. Pre-builds buffers for the full MIDI range and
    /// starts the engine so playback is instant.
    func preload() {
        guard !isReady else { return }
        for _ in 0..<voiceCount {
            let node = AVAudioPlayerNode()
            engine.attach(node)
            engine.connect(node, to: engine.mainMixerNode, format: playbackFormat)
            voices.append(node)
        }
        engine.prepare()
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)
            try engine.start()
            // Pre-render all note buffers up-front.
            for pitch in 21...108 {
                bufferCache[pitch] = makeBuffer(pitch: pitch)
            }
            isReady = true
        } catch {
            print("[PianoAudioEngine] Failed to start: \(error)")
        }
    }

    func play(pitch: Int, velocity: Int = 100) {
        guard isReady, let buffer = bufferCache[pitch] else { return }
        let voice = voices[nextVoice]
        nextVoice = (nextVoice + 1) % voiceCount
        voice.stop()
        voice.volume = Float(velocity) / 127.0
        voice.scheduleBuffer(buffer, at: nil, options: [], completionHandler: nil)
        if !voice.isPlaying { voice.play() }
    }

    /// Plays a note sequence (demo playback). Returns a task that can be cancelled.
    func play(sequence: NoteSequence, startingAt start: CFTimeInterval = CACurrentMediaTime(),
              onHighlight: @escaping (Int?) -> Void) -> Task<Void, Never> {
        Task { @MainActor in
            for note in sequence.notes.sorted(by: { $0.startTime < $1.startTime }) {
                let delay = note.startTime - (CACurrentMediaTime() - start)
                if delay > 0 {
                    try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                }
                if Task.isCancelled { return }
                onHighlight(note.pitch)
                let velocity = note.velocity.map { $0 <= 1 ? $0 * 127 : $0 } ?? 100
                play(pitch: note.pitch, velocity: Int(max(0, min(127, velocity))))
                Task { @MainActor in
                    try? await Task.sleep(nanoseconds: UInt64(max(note.endTime - note.startTime, 0.05) * 1_000_000_000))
                    onHighlight(nil)
                }
            }
        }
    }

    /// Synthesized piano-ish buffer: fundamental + harmonics, exponential decay.
    private func makeBuffer(pitch: Int) -> AVAudioPCMBuffer? {
        let frequency = 440.0 * pow(2.0, Double(pitch - 69) / 12.0)
        let duration = 1.5
        let sampleRate = playbackFormat.sampleRate
        let frameCount = AVAudioFrameCount(sampleRate * duration)
        guard let buffer = AVAudioPCMBuffer(pcmFormat: playbackFormat, frameCapacity: frameCount) else {
            return nil
        }
        buffer.frameLength = frameCount
        guard let channel = buffer.floatChannelData?[0] else { return nil }
        let harmonics: [(Double, Double)] = [(1, 1.0), (2, 0.45), (3, 0.2), (4, 0.08)]
        for frame in 0..<Int(frameCount) {
            let t = Double(frame) / sampleRate
            let envelope = exp(-3.0 * t)
            var sample = 0.0
            for (multiple, amplitude) in harmonics {
                sample += amplitude * sin(2.0 * .pi * frequency * multiple * t)
            }
            channel[frame] = Float(sample * envelope * 0.3)
        }
        return buffer
    }
}
