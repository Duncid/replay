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
    private var voicePitches: [Int: Int] = [:]
    private var demoVoices: Set<Int> = []
    private let voiceCount = 16
    private var bufferCache: [Int: AVAudioPCMBuffer] = [:]
    // Player outputs must match the scheduled buffers. The mixer converts this
    // mono format to the device's channel count and sample rate.
    private let playbackFormat = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1)!

    var renderHostTime: Double? {
        guard engine.isRunning, let time = engine.outputNode.lastRenderTime, time.isHostTimeValid else { return nil }
        return AVAudioTime.seconds(forHostTime: time.hostTime)
    }

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

    func play(pitch: Int, velocity: Int = 100, demo: Bool = false) {
        guard isReady, let buffer = bufferCache[pitch] else { return }
        let voice = voices[nextVoice]
        voicePitches[nextVoice] = pitch
        if demo { demoVoices.insert(nextVoice) } else { demoVoices.remove(nextVoice) }
        nextVoice = (nextVoice + 1) % voiceCount
        voice.stop()
        voice.volume = Float(velocity) / 127.0
        voice.scheduleBuffer(buffer, at: nil, options: [], completionHandler: nil)
        if !voice.isPlaying { voice.play() }
    }

    func release(pitch: Int, demo: Bool = false) {
        let released = voicePitches.filter { $0.value == pitch && demoVoices.contains($0.key) == demo }.map(\.key)
        for index in released { voices[index].stop(); voicePitches.removeValue(forKey: index); demoVoices.remove(index) }
    }
    func stopAll() { voices.forEach { $0.stop() }; voicePitches = [:]; demoVoices = [] }

    /// A single cancellable event timeline owns polyphonic highlights and releases.
    /// No detached note-off tasks can leak into the next section or replay.
    func play(sequence: NoteSequence, startingAt start: CFTimeInterval = CACurrentMediaTime(),
              onHeld: ((Set<Int>) -> Void)? = nil,
              onHighlight: @escaping (Int?) -> Void = { _ in }) -> Task<Void, Never> {
        struct Event { let time: Double; let pitch: Int; let velocity: Double?; let on: Bool }
        var events: [Event] = []
        for note in sequence.notes where note.startTime.isFinite && note.endTime.isFinite {
            events.append(Event(time: max(0, note.startTime), pitch: note.pitch, velocity: note.velocity, on: true))
            events.append(Event(time: max(note.startTime + 0.05, note.endTime), pitch: note.pitch, velocity: nil, on: false))
        }
        events.sort { lhs, rhs in
            if lhs.time == rhs.time { return !lhs.on && rhs.on }
            return lhs.time < rhs.time
        }
        return Task { @MainActor in
            var counts: [Int: Int] = [:]
            for event in events {
                let delay = event.time - ((renderHostTime ?? start) - start)
                if delay > 0 { try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000)) }
                guard !Task.isCancelled else { return }
                if event.on {
                    counts[event.pitch, default: 0] += 1
                    let v = event.velocity.map { $0 <= 1 ? $0 * 127 : $0 } ?? 100
                    play(pitch: event.pitch, velocity: Int(max(0, min(127, v))), demo: true)
                } else {
                    counts[event.pitch, default: 1] -= 1
                    if counts[event.pitch] == 0 { counts.removeValue(forKey: event.pitch); release(pitch: event.pitch, demo: true) }
                }
                onHeld?(Set(counts.keys))
                if event.on { onHighlight(event.pitch) } else if counts.isEmpty { onHighlight(nil) }
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
