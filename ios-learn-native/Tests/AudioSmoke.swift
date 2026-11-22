import SwiftUI
import QuartzCore

/// Runs the production audio engines without Cloud, MIDI or lesson UI.
@main
struct AudioSmoke: App {
    var body: some Scene {
        WindowGroup {
            Text("Audio playback regression check")
                .task { await runPlayback() }
        }
    }

    @MainActor private func runPlayback() async {
        let piano = PianoAudioEngine()
        piano.preload()
        precondition(piano.isReady, "Piano engine failed to start")
        piano.preload()

        // The first scheduled note reproduced the Play Demo crash. More than
        // 16 notes also exercises reuse of every voice in the production pool.
        let notes = (0..<20).map { index in
            Note(pitch: 60 + index % 12, startTime: Double(index) * 0.05,
                 endTime: Double(index) * 0.05 + 0.1, velocity: 0.5)
        }
        let sequence = NoteSequence(notes: notes, totalTime: 1.1)
        var highlighted: [Int] = []
        for _ in 0..<2 {
            let demo = piano.play(sequence: sequence, startingAt: CACurrentMediaTime() + 0.1) { pitch in
                if let pitch { highlighted.append(pitch) }
            }
            await demo.value
        }
        precondition(highlighted == (notes + notes).map(\.pitch), "Demo skipped notes")
        piano.play(pitch: 21)
        piano.play(pitch: 108)

        let metronome = MetronomeEngine()
        for _ in 0..<2 {
            metronome.start(bpm: 240, timeSignature: "4/4")
            precondition(metronome.isPlaying, "Metronome failed to start")
            try? await Task.sleep(nanoseconds: 600_000_000)
            metronome.stop()
            precondition(!metronome.isPlaying)
        }
        print("PASS: demo playback, voice reuse, repeated playback, piano range and metronome")
        fflush(stdout)
        exit(0)
    }
}
