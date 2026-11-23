import SwiftUI
import UIKit

/// UIKit owns fingers, not a stack of competing SwiftUI gestures. Rail and keys
/// share geometry; the render path never animates input feedback.
struct PianoKeyboardView: UIViewRepresentable {
    var range: ClosedRange<Int> = 48...72
    var held: Set<Int> = []
    var demo: Set<Int> = []
    var armed: Set<Int> = []
    var transparentRail = false
    var tuneRange: ClosedRange<Int>?
    var onDown: (Int, Int) -> Void
    var onUp: (Int) -> Void
    func makeUIView(context: Context) -> PianoSurface { PianoSurface() }
    func updateUIView(_ view: PianoSurface, context: Context) {
        if view.range != range { view.cancelTouches(); view.range = range; view.setNeedsLayout() }
        view.transparentRail = transparentRail
        view.isOpaque = !transparentRail
        view.backgroundColor = transparentRail ? .clear : UIColor(ReplayTheme.background)
        view.held = held; view.demo = demo; view.armed = armed; view.tuneRange = tuneRange; view.onDown = onDown; view.onUp = onUp
        view.setNeedsDisplay()
    }
    static func dismantleUIView(_ uiView: PianoSurface, coordinator: ()) { uiView.cancelTouches() }
}

final class PianoSurface: UIView {
    var range = 48...72
    var held: Set<Int> = [], demo: Set<Int> = []
    var armed: Set<Int> = []
    var transparentRail = false
    var tuneRange: ClosedRange<Int>?
    var onDown: ((Int, Int) -> Void)?
    var onUp: ((Int) -> Void)?
    private var touchState = PianoTouchState<ObjectIdentifier>()
    private var lastSize: CGSize = .zero
    private var geometry: PianoGeometry { .init(range: range, width: bounds.width, height: bounds.height) }
    override init(frame: CGRect) {
        super.init(frame: frame)
        isMultipleTouchEnabled = true; isOpaque = true; backgroundColor = UIColor(ReplayTheme.background)
        isAccessibilityElement = false
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override func layoutSubviews() {
        super.layoutSubviews()
        if lastSize != bounds.size { cancelTouches(); lastSize = bounds.size }
        accessibilityElements = range.map { pitch in
            let key = PianoAccessibilityKey(accessibilityContainer: self)
            key.accessibilityLabel = PianoGeometry.label(pitch)
            key.accessibilityTraits = .button
            key.accessibilityHint = "Double tap to play"
            key.accessibilityFrameInContainerSpace = geometry.keyRect(pitch)
            let identity = ObjectIdentifier(key)
            key.activate = { [weak self] in self?.activate(pitch, identity: identity) }
            return key
        }
        setNeedsDisplay()
    }
    override func draw(_ rect: CGRect) {
        let backing = transparentRail ? CGRect(x: 0, y: PianoGeometry.railHeight, width: bounds.width, height: max(0, bounds.height - PianoGeometry.railHeight)) : bounds
        if transparentRail { UIGraphicsGetCurrentContext()?.clear(bounds) }
        UIColor(ReplayTheme.background).setFill(); UIRectFill(backing)
        let g = geometry
        for pitch in g.whites + g.blacks {
            let black = PianoGeometry.isBlack(pitch)
            let active = held.contains(pitch) || demo.contains(pitch)
            let player = UIColor(held.contains(pitch) ? ReplayTheme.accent : ReplayTheme.ai)
            let note = UIColor(ReplayTheme.pitch(pitch))
            let rail = g.railRect(pitch)
            let context = UIGraphicsGetCurrentContext()
            context?.saveGState()
            if let tuneRange, !tuneRange.contains(pitch) { context?.setAlpha(0.3) }
            let railFill = black && !active ? note.darkened(0.6) : note
            railFill.setFill(); UIBezierPath(roundedRect: rail, cornerRadius: 4).fill()
            // Dark labels on bright F#/G#; pure white on the darker sharp cells.
            let railInk: UIColor = black && !active && ![6,8].contains(pitch % 12) ? .white : UIColor(ReplayTheme.onAccent)
            let label = PianoGeometry.label(pitch) as NSString
            let attributes: [NSAttributedString.Key: Any] = [.font: UIFont(name: "JetBrainsMono-Regular", size: 11) ?? UIFont.monospacedSystemFont(ofSize: 11, weight: .medium), .foregroundColor: railInk]
            let textSize = label.size(withAttributes: attributes)
            label.draw(at: CGPoint(x: rail.midX-textSize.width/2, y: rail.midY-textSize.height/2), withAttributes: attributes)
            if active { player.setFill(); UIRectFill(CGRect(x: rail.minX+3, y: rail.maxY-3, width: rail.width-6, height: 3)) }
            if armed.contains(pitch) { UIColor(ReplayTheme.ink).setStroke(); let ring = UIBezierPath(roundedRect: rail.insetBy(dx: 1, dy: 1), cornerRadius: 3); ring.lineWidth = 2; ring.stroke() }
            context?.restoreGState()
            let frame = g.keyRect(pitch)
            let path = UIBezierPath(roundedRect: frame, cornerRadius: black ? 8 : 12)
            (active ? player : UIColor(Color(hex: black ? 0x16181F : 0xFAFAFA))).setFill(); path.fill()
            UIColor(Color(hex: black ? 0x2A2E3A : 0xD9D9D9)).setStroke(); path.lineWidth = 1; path.stroke()
            if !active {
                UIColor(Color(hex: black ? 0x2A2E3A : 0xD9D9D9)).setFill()
                UIBezierPath(roundedRect: CGRect(x: frame.minX+3, y: frame.maxY-7, width: frame.width-6, height: 4), cornerRadius: 2).fill()
            }
        }
    }
    private func activate(_ pitch: Int, identity: ObjectIdentifier) {
        let change = touchState.move(identity, to: pitch)
        if let on = change.on { onDown?(on, 100) }
        // VoiceOver activation needs an audible duration, not an immediate
        // note-on/note-off pair. It shares ownership with physical fingers.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) { [weak self] in
            guard let self else { return }
            let change = self.touchState.move(identity, to: nil)
            if let off = change.off { self.onUp?(off) }
        }
    }
    private func update(_ touches: Set<UITouch>, ending: Bool = false) {
        for touch in touches {
            let pitch = ending ? nil : geometry.key(at: touch.location(in: self))
            let change = touchState.move(ObjectIdentifier(touch), to: pitch)
            if let off = change.off { onUp?(off) }
            if let on = change.on { onDown?(on, 100) }
        }
        setNeedsDisplay()
    }
    func cancelTouches() { for pitch in touchState.cancel() { onUp?(pitch) } }
    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) { update(touches) }
    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) { update(touches) }
    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) { update(touches, ending: true) }
    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) { update(touches, ending: true) }
    override func didMoveToWindow() { if window == nil { cancelTouches() } }
}
private final class PianoAccessibilityKey: UIAccessibilityElement {
    var activate: (() -> Void)?
    override func accessibilityActivate() -> Bool { activate?(); return true }
}
private extension UIColor {
    func darkened(_ factor: CGFloat) -> UIColor {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        getRed(&r, green: &g, blue: &b, alpha: &a)
        return UIColor(red: r*factor, green: g*factor, blue: b*factor, alpha: a)
    }
}
