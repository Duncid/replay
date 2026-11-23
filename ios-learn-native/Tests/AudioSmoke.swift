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
            let demo = piano.play(sequence: sequence, startingAt: CACurrentMediaTime() + 0.1, onHighlight: { pitch in
                if let pitch { highlighted.append(pitch) }
            })
            await demo.value
        }
        precondition(highlighted == (notes + notes).map(\.pitch), "Demo skipped notes")
        var chordSeen = false
        var held: Set<Int> = []
        let chord = NoteSequence(notes: [60,64,67].map { Note(pitch: $0, startTime: 0, endTime: 0.2, velocity: 100) }, totalTime: 0.2)
        await piano.play(sequence: chord, onHeld: { pitches in held = pitches; if pitches.count == 3 { chordSeen = true } }).value
        precondition(chordSeen && held.isEmpty, "Polyphonic highlights or releases failed")
        var callbacks = 0
        let cancelled = piano.play(sequence: chord, startingAt: CACurrentMediaTime() + 0.2, onHeld: { _ in callbacks += 1 })
        cancelled.cancel(); piano.stopAll()
        await cancelled.value
        try? await Task.sleep(nanoseconds: 400_000_000)
        precondition(callbacks == 0, "Cancelled playback leaked callbacks")
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
        print("PASS: demo playback, voice reuse, repeated playback, piano range, polyphonic highlights, cancellation and metronome")
        fflush(stdout)
        exit(0)
    }
}
