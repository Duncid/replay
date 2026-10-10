import AVFoundation
import QuartzCore

/// Single source of time for the note highway, demo playback and scoring.
///
/// Time is measured from an anchor host time and shifted by the audio output
/// latency, so what you *see* crossing the hit line lines up with what you
/// *hear* — not with when the sound was scheduled.
@MainActor
final class HighwayClock {
    private(set) var anchor: CFTimeInterval?

    var isRunning: Bool { anchor != nil }

    /// Starts the clock. `leadIn` seconds of falling notes are shown before t = 0.
    /// Returns the host time at which t = 0 happens (used to schedule audio).
    @discardableResult
    func start(leadIn: Double = 0) -> CFTimeInterval {
        let a = CACurrentMediaTime() + leadIn
        anchor = a
        return a
    }

    func stop() { anchor = nil }

    /// Musical time in seconds (negative during lead-in). Visual-safe.
    var time: Double {
        guard let anchor else { return -.infinity }
        return CACurrentMediaTime() - anchor - AVAudioSession.sharedInstance().outputLatency
    }

    /// Musical time for an input event (MIDI is heard locally with no output
    /// delay to compensate, so we use raw host time).
    var inputTime: Double {
        guard let anchor else { return -.infinity }
        return CACurrentMediaTime() - anchor
    }
}
