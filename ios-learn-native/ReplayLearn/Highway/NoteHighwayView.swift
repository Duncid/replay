import SpriteKit
import SwiftUI

/// SwiftUI host for the note highway. The scene is owned by the view model so
/// it survives SwiftUI re-renders (never recreated per body evaluation).
struct NoteHighwayView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let scene: NoteHighwayScene

    var body: some View {
        SpriteView(scene: scene,
                   preferredFramesPerSecond: 120,
                   options: [.ignoresSiblingOrder, .shouldCullNonVisibleNodes])
            .onAppear { scene.reduceMotion = reduceMotion }
            .onChange(of: reduceMotion) { _, value in scene.reduceMotion = value }
            .accessibilityHidden(true)
    }
}
