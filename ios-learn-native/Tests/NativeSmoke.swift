import SwiftUI

@main
struct NativeSmoke: App {
    var body: some Scene {
        WindowGroup { Text("Native flow regression check").task { await run() } }
    }
    @MainActor private func run() async {
        precondition(UIFont(name: "SpaceGrotesk-Light_Regular", size: 20) != nil, "Display font not registered")
        precondition(UIFont(name: "JetBrainsMono-Regular", size: 11) != nil, "Mono font not registered")
        let callback = URL(string: "com.playbk.learn://auth/callback#state=test-state&access_token=access&refresh_token=refresh")!
        precondition(BrowserSignIn.tokens(from: callback, state: "test-state")?.0 == "access")
        precondition(BrowserSignIn.tokens(from: callback, state: "wrong-state") == nil)
        precondition(BrowserSignIn.tokens(from: URL(string: "com.playbk.app://auth/callback#state=test-state&access_token=access&refresh_token=refresh")!, state: "test-state") == nil)
        precondition(BrowserSignIn.tokens(from: URL(string: callback.absoluteString + "&state=test-state")!, state: "test-state") == nil)
        let keyboard = PianoSurface(frame: CGRect(x: 0, y: 0, width: 1200, height: 300))
        var accessibleNotes: Set<Int> = []
        keyboard.onDown = { pitch, _ in accessibleNotes.insert(pitch) }
        keyboard.onUp = { pitch in accessibleNotes.remove(pitch) }
        keyboard.setNeedsLayout(); keyboard.layoutIfNeeded()
        let firstKey = keyboard.accessibilityElements!.first as! UIAccessibilityElement
        precondition(firstKey.accessibilityActivate() && accessibleNotes == [48], "VoiceOver did not start the key")
        try? await Task.sleep(nanoseconds: 250_000_000)
        precondition(accessibleNotes.isEmpty && keyboard.accessibilityElements?.count == 25, "VoiceOver did not release the key")
        let model = LessonViewModel(preview: true)
        precondition(model.phase == .library)
        model.startTune("st-louis-blues")
        precondition(model.phase == .library, "Locked tune opened")
        await capture(RootView().environmentObject(model), name: "library-wide", size: CGSize(width: 1200, height: 834))
        await capture(NavigationStack { FreePlayView().environmentObject(model) }, name: "free-play", size: CGSize(width: 1200, height: 834))
        await capture(NavigationStack { ProgressLibraryView().environmentObject(model) }, name: "progress", size: CGSize(width: 600, height: 900))
        model.startTune("intro")
        await capture(RootView().environmentObject(model), name: "practice-wide", size: CGSize(width: 1200, height: 834))
        model.highway.previewBeat = 0.5
        await capture(RootView().environmentObject(model), name: "practice-covered-notes", size: CGSize(width: 1200, height: 834))
        model.highway.previewBeat = nil
        await capture(RootView().environmentObject(model), name: "practice-narrow", size: CGSize(width: 400, height: 900))
        await capture(RootView().environmentObject(model).environment(\.dynamicTypeSize, .accessibility3), name: "practice-large-text", size: CGSize(width: 600, height: 900))
        precondition(model.phase == .practice && model.practicePlan.count == 1)
        model.nextItem()
        precondition(model.currentIndex == 0, "Last section advanced outside plan")
        model.noteDown(60, 100)
        model.noteDown(60, 80, source: "midi")
        model.noteUp(60)
        precondition(model.heldPitches == [60], "Touch release cleared MIDI note")
        model.noteUp(60, source: "midi")
        precondition(model.heldPitches.isEmpty)
        model.playDemo()
        precondition(model.isDemoPlaying)
        try? await Task.sleep(nanoseconds: 100_000_000)
        precondition(!model.clock.isRunning && model.demoPitches.isEmpty, "Demo started without a presented scene")
        model.restart()
        precondition(!model.isDemoPlaying && model.demoPitches.isEmpty && !model.clock.isRunning)
        try? await Task.sleep(nanoseconds: 300_000_000)
        precondition(model.demoPitches.isEmpty, "Cancelled demo leaked highlights")
        await checkDemoReadiness(model)
        model.startRecording()
        precondition(model.phase == .recording)
        try? await Task.sleep(nanoseconds: 2_800_000_000)
        model.noteDown(60, 100); model.noteDown(64, 100); model.noteDown(67, 100)
        precondition(model.heldPitches.count == 3)
        try? await Task.sleep(nanoseconds: 100_000_000)
        model.noteUp(60); model.noteUp(64); model.noteUp(67)
        model.stopAndEvaluate()
        precondition(model.phase == .feedback && model.evaluation != nil, "Touch attempt did not reach feedback")
        model.continueAfterFeedback()
        precondition(model.phase == .practice)
        model.startRecording(); model.noteDown(60, 100); model.suspend()
        precondition(model.phase == .practice && model.heldPitches.isEmpty && !model.clock.isRunning)
        model.leaveTune()
        try? await Task.sleep(nanoseconds: 100_000_000)
        precondition(model.phase == .library && model.resume?.tuneKey == "intro")
        model.startTune("intro")
        precondition(model.phase == .practice, "Resume did not restore practice")
        print("PASS: native flow, VoiceOver note lifetime, font registration, locks, resume, demo cancellation, input overlap, chord recording, feedback and suspension")
        fflush(stdout); exit(0)
    }
    @MainActor private func checkDemoReadiness(_ model: LessonViewModel) async {
        let host = UIHostingController(rootView: RootView().environmentObject(model))
        let scene = UIApplication.shared.connectedScenes.first as! UIWindowScene
        let window = UIWindow(windowScene: scene)
        window.rootViewController = host; window.isHidden = false
        model.playDemo()
        for _ in 0..<120 {
            if model.clock.isRunning { break }
            try? await Task.sleep(nanoseconds: 16_000_000)
        }
        precondition(model.highway.isPresentationReady && model.clock.isRunning, "Presented scene never armed demo")
        precondition(model.clock.inputTime < -0.7 && model.demoPitches.isEmpty, "Demo skipped its one-second lead-in")
        try? await Task.sleep(nanoseconds: 450_000_000)
        precondition(model.demoPitches.isEmpty, "Audio started during preparation lead-in")
        model.restart()
        try? await Task.sleep(nanoseconds: 650_000_000)
        precondition(!model.clock.isRunning && model.demoPitches.isEmpty, "Restart failed to cancel prepared audio")
        window.isHidden = true
    }
    @MainActor private func capture<V: View>(_ content: V, name: String, size: CGSize) async {
        let host = UIHostingController(rootView: content.preferredColorScheme(.dark).frame(width: size.width, height: size.height))
        let scene = UIApplication.shared.connectedScenes.first as! UIWindowScene
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(origin: .zero, size: size)
        window.rootViewController = host
        window.isHidden = false
        host.view.frame = CGRect(origin: .zero, size: size)
        host.view.setNeedsLayout(); host.view.layoutIfNeeded()
        try? await Task.sleep(nanoseconds: 500_000_000)
        let renderer = UIGraphicsImageRenderer(size: size)
        let image = renderer.image { _ in host.view.drawHierarchy(in: CGRect(origin: .zero, size: size), afterScreenUpdates: true) }
        let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        try! image.pngData()!.write(to: directory.appendingPathComponent(name+".png"))
        window.isHidden = true
    }

}
