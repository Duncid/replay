import SwiftUI

/// Two-octave on-screen keyboard (C3–B4). Highlights active/held pitches and
/// works as a touch fallback when no MIDI piano is connected.
struct PianoKeyboardView: View {
    var activePitch: Int?
    var heldPitches: Set<Int> = []

    @EnvironmentObject private var viewModel: LessonViewModel

    private let firstPitch = 48 // C3
    private let lastPitch = 71  // B4

    private var whitePitches: [Int] {
        (firstPitch...lastPitch).filter { !isBlack($0) }
    }

    private func isBlack(_ pitch: Int) -> Bool {
        [1, 3, 6, 8, 10].contains(pitch % 12)
    }

    var body: some View {
        GeometryReader { geometry in
            let whiteWidth = geometry.size.width / CGFloat(whitePitches.count)
            ZStack(alignment: .topLeading) {
                // White keys
                HStack(spacing: 0) {
                    ForEach(whitePitches, id: \.self) { pitch in
                        KeyView(pitch: pitch, isBlack: false,
                                isActive: activePitch == pitch || heldPitches.contains(pitch))
                            .frame(width: whiteWidth, height: geometry.size.height)
                            .onTapGesture {
                                viewModel.piano.play(pitch: pitch)
                            }
                    }
                }
                // Black keys
                ForEach(firstPitch...lastPitch, id: \.self) { pitch in
                    if isBlack(pitch) {
                        let whiteIndex = whitePitches.firstIndex {
                            $0 > pitch
                        } ?? whitePitches.count
                        KeyView(pitch: pitch, isBlack: true,
                                isActive: activePitch == pitch || heldPitches.contains(pitch))
                            .frame(width: whiteWidth * 0.6, height: geometry.size.height * 0.6)
                            .offset(x: CGFloat(whiteIndex) * whiteWidth - whiteWidth * 0.3)
                            .onTapGesture {
                                viewModel.piano.play(pitch: pitch)
                            }
                    }
                }
            }
        }
        .background(Color(.systemGray5))
    }
}

private struct KeyView: View {
    let pitch: Int
    let isBlack: Bool
    let isActive: Bool

    var body: some View {
        RoundedRectangle(cornerRadius: 4)
            .fill(fillColor)
            .overlay(
                RoundedRectangle(cornerRadius: 4)
                    .stroke(Color(.separator), lineWidth: isBlack ? 0 : 1)
            )
            .padding(1)
    }

    private var fillColor: Color {
        if isActive { return .accentColor }
        return isBlack ? Color(.label) : Color(.systemBackground)
    }
}

#Preview {
    PianoKeyboardView(activePitch: 60, heldPitches: [64])
        .frame(height: 180)
        .environmentObject(LessonViewModel())
}
