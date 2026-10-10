import Foundation

/// Scores live play against the target notes. Pure logic — knows nothing about
/// drawing. The scene only receives the resulting judgments.
struct HitJudge {
    enum Grade: Equatable { case perfect, good, miss, extra }

    struct Judgment: Equatable {
        let grade: Grade
        let pitch: Int
        let noteIndex: Int?
    }

    static let perfectWindow = 0.08
    static let goodWindow = 0.18

    private(set) var targets: [Note] = []
    private(set) var resolved: [Int: Grade] = [:]
    private(set) var streak = 0
    private(set) var bestStreak = 0
    private(set) var score = 0

    mutating func reset(targets: [Note]) {
        self.targets = targets.sorted { $0.startTime < $1.startTime }
        resolved = [:]
        streak = 0
        bestStreak = 0
        score = 0
    }

    /// Judges a key press at musical time `t`.
    mutating func noteOn(pitch: Int, at t: Double) -> Judgment {
        var best: (index: Int, delta: Double)?
        for (i, note) in targets.enumerated() where resolved[i] == nil && note.pitch == pitch {
            let delta = abs(note.startTime - t)
            if delta <= Self.goodWindow, delta < (best?.delta ?? .infinity) {
                best = (i, delta)
            }
        }
        guard let best else {
            streak = 0
            return Judgment(grade: .extra, pitch: pitch, noteIndex: nil)
        }
        let grade: Grade = best.delta <= Self.perfectWindow ? .perfect : .good
        resolved[best.index] = grade
        streak += 1
        bestStreak = max(bestStreak, streak)
        score += (grade == .perfect ? 100 : 60) * (1 + min(streak, 20) / 10)
        return Judgment(grade: grade, pitch: pitch, noteIndex: best.index)
    }

    /// Marks notes whose window has fully passed as missed.
    mutating func sweepMisses(now t: Double) -> [Judgment] {
        var out: [Judgment] = []
        for (i, note) in targets.enumerated() where resolved[i] == nil && t > note.startTime + Self.goodWindow {
            resolved[i] = .miss
            streak = 0
            out.append(Judgment(grade: .miss, pitch: note.pitch, noteIndex: i))
        }
        return out
    }
}
