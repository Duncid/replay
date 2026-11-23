import Foundation
import CoreGraphics

/// One coordinate system for the pitch rail, rendering and black-first hit testing.
struct PianoGeometry {
    let range: ClosedRange<Int>
    let width: CGFloat
    let height: CGFloat
    static let railHeight: CGFloat = 52
    /// MIDI changes only key height; the rail and touch geometry stay intact.
    static func panelHeight(_ normalHeight: CGFloat, midiConnected: Bool) -> CGFloat {
        railHeight + max(0, normalHeight - railHeight) * (midiConnected ? 0.5 : 1)
    }
    static func isBlack(_ pitch: Int) -> Bool { [1, 3, 6, 8, 10].contains(pitch % 12) }
    static func label(_ pitch: Int) -> String { "\(["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"][pitch % 12])\(pitch / 12 - 1)" }
    var whites: [Int] { range.filter { !Self.isBlack($0) } }
    var blacks: [Int] { range.filter(Self.isBlack) }
    var whiteWidth: CGFloat { max(1, (width - 4 - CGFloat(whites.count - 1) * 2) / CGFloat(whites.count)) }
    func keyRect(_ pitch: Int) -> CGRect {
        let black = Self.isBlack(pitch)
        let index = whites.firstIndex(of: black ? pitch - 1 : pitch) ?? 0
        let x = 2 + CGFloat(index) * (whiteWidth + 2)
        return CGRect(x: black ? x + whiteWidth + 1 - whiteWidth * 0.29 : x,
                      y: Self.railHeight, width: black ? whiteWidth * 0.58 : whiteWidth,
                      height: max(0, height - Self.railHeight) * (black ? 0.58 : 1))
    }
    func railRect(_ pitch: Int) -> CGRect {
        let key = keyRect(pitch)
        return CGRect(x: key.minX, y: Self.isBlack(pitch) ? 0 : 26, width: key.width, height: 24)
    }
    func key(at point: CGPoint) -> Int? {
        guard point.x >= 0, point.x < width, point.y >= Self.railHeight, point.y < height else { return nil }
        if let black = blacks.first(where: { keyRect($0).contains(point) }) { return black }
        return whites.first { keyRect($0).insetBy(dx: -1, dy: 0).contains(point) }
    }
}

/// Independent from UIKit: one pitch may be held by several fingers/sources.
struct PianoTouchState<ID: Hashable> {
    private(set) var touches: [ID: Int] = [:]
    mutating func move(_ id: ID, to pitch: Int?) -> (off: Int?, on: Int?) {
        let previous = touches[id]
        guard previous != pitch else { return (nil, nil) }
        touches.removeValue(forKey: id)
        let off = previous.flatMap { touches.values.contains($0) ? nil : $0 }
        let on = pitch.flatMap { touches.values.contains($0) ? nil : $0 }
        touches[id] = pitch
        return (off, on)
    }
    mutating func cancel() -> Set<Int> { let held = Set(touches.values); touches = [:]; return held }
}
