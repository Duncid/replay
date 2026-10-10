import SpriteKit

/// The note highway: falling notes, beat/bar guides, hit line, keyboard and
/// hit effects — all on one SpriteKit surface, positioned every frame from
/// `HighwayClock`. All nodes are created up-front; nothing is allocated per frame.
@MainActor
final class NoteHighwayScene: SKScene {
    enum Mode { case idle, demo, play }

    // MARK: Inputs
    let clock: HighwayClock
    var lookahead: Double = 2.5           // seconds of notes visible above the hit line
    var bpm: Double = 90
    var beatsPerBar = 4
    private(set) var mode: Mode = .idle

    // MARK: Layout
    private var lowPitch = 60, highPitch = 72
    private var keyboardHeight: CGFloat { max(120, size.height * 0.28) }
    private var hitY: CGFloat { keyboardHeight + 6 }
    private var keyFrames: [Int: CGRect] = [:]

    // MARK: Nodes
    private let laneLayer = SKNode()
    private let gridLayer = SKNode()
    private let noteLayer = SKNode()
    private let keyLayer = SKNode()
    private let fxLayer = SKNode()
    private let hitLine = SKSpriteNode(color: .white, size: .zero)
    private let streakLabel = SKLabelNode(fontNamed: "AvenirNext-Heavy")
    private var gridPool: [SKSpriteNode] = []
    private var noteSprites: [SKSpriteNode] = []
    private var keySprites: [Int: SKSpriteNode] = [:]
    private var fxPool: [SKEmitterNode] = []
    private var nextFx = 0

    // MARK: State
    private var notes: [Note] = []
    private var noteGrades: [Int: HitJudge.Grade] = [:]
    private var demoFired: Set<Int> = []
    private var held: Set<Int> = []

    // MARK: Palette
    private let bg = SKColor(red: 0.05, green: 0.06, blue: 0.10, alpha: 1)
    private let noteColor = SKColor(red: 0.98, green: 0.55, blue: 0.25, alpha: 1)
    private let blackNoteColor = SKColor(red: 0.85, green: 0.35, blue: 0.55, alpha: 1)
    private let perfectColor = SKColor(red: 0.35, green: 0.95, blue: 0.65, alpha: 1)
    private let goodColor = SKColor(red: 0.45, green: 0.75, blue: 1.0, alpha: 1)
    private let missColor = SKColor(white: 0.35, alpha: 0.6)

    init(clock: HighwayClock) {
        self.clock = clock
        super.init(size: CGSize(width: 1024, height: 400))
        scaleMode = .resizeFill
        backgroundColor = bg
        [laneLayer, gridLayer, noteLayer, keyLayer, fxLayer].enumerated().forEach { i, layer in
            layer.zPosition = CGFloat(i)
            addChild(layer)
        }
        hitLine.zPosition = 3.5
        addChild(hitLine)
        streakLabel.fontSize = 28
        streakLabel.zPosition = 10
        streakLabel.alpha = 0
        addChild(streakLabel)
        for _ in 0..<48 {
            let line = SKSpriteNode(color: .white, size: .zero)
            line.anchorPoint = CGPoint(x: 0, y: 0.5)
            line.isHidden = true
            gridLayer.addChild(line)
            gridPool.append(line)
        }
        buildFxPool()
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    // MARK: - Public API (called by the view model)

    func load(sequence: NoteSequence?) {
        notes = (sequence?.notes ?? []).sorted { $0.startTime < $1.startTime }
        noteGrades = [:]
        demoFired = []
        if let lo = notes.map(\.pitch).min(), let hi = notes.map(\.pitch).max() {
            // Pad to whole octaves, at least two, starting on C.
            var low = ((lo - 2) / 12) * 12
            var high = max(((hi + 2) / 12 + 1) * 12, low + 24)
            low = max(21, low); high = min(108, high)
            lowPitch = low; highPitch = high
        }
        noteLayer.removeAllChildren()
        noteSprites = notes.map { note in
            let s = SKSpriteNode(color: isBlack(note.pitch) ? blackNoteColor : noteColor, size: .zero)
            s.anchorPoint = CGPoint(x: 0.5, y: 0)
            noteLayer.addChild(s)
            return s
        }
        relayout()
    }

    func setMode(_ newMode: Mode) {
        mode = newMode
        noteGrades = [:]
        demoFired = []
        noteSprites.enumerated().forEach { i, s in s.color = baseColor(i); s.alpha = 1 }
    }

    func setHeld(_ pitches: Set<Int>) {
        held = pitches
        for (pitch, sprite) in keySprites {
            let on = pitches.contains(pitch)
            sprite.color = on ? noteColor : (isBlack(pitch) ? SKColor(white: 0.08, alpha: 1) : SKColor(white: 0.95, alpha: 1))
        }
    }

    func apply(_ judgment: HitJudge.Judgment, streak: Int) {
        if let i = judgment.noteIndex { noteGrades[i] = judgment.grade }
        if let i = judgment.noteIndex, i < noteSprites.count {
            noteSprites[i].color = color(for: judgment.grade)
            if judgment.grade == .miss { noteSprites[i].alpha = 0.5 }
        }
        switch judgment.grade {
        case .perfect: burst(at: judgment.pitch, color: perfectColor, intensity: 1.0)
        case .good: burst(at: judgment.pitch, color: goodColor, intensity: 0.6)
        case .miss, .extra: break
        }
        if streak >= 5, streak % 5 == 0 { showStreak(streak) }
    }

    // MARK: - Frame loop

    override func didChangeSize(_ oldSize: CGSize) { relayout() }

    override func update(_ currentTime: TimeInterval) {
        let t = clock.time
        let running = clock.isRunning
        let pxPerSec = (size.height - hitY) / CGFloat(lookahead)

        for (i, note) in notes.enumerated() {
            let sprite = noteSprites[i]
            guard running, let frame = keyFrames[note.pitch] else { sprite.isHidden = true; continue }
            let y = hitY + CGFloat(note.startTime - t) * pxPerSec
            let h = max(10, CGFloat(note.endTime - note.startTime) * pxPerSec)
            let visible = y < size.height && y + h > 0
            sprite.isHidden = !visible
            guard visible else { continue }
            sprite.position = CGPoint(x: frame.midX, y: y)
            sprite.size = CGSize(width: frame.width * (isBlack(note.pitch) ? 0.9 : 0.8), height: h)

            // Demo: notes "play themselves" when they reach the line.
            if mode == .demo, t >= note.startTime, !demoFired.contains(i) {
                demoFired.insert(i)
                sprite.color = perfectColor
                burst(at: note.pitch, color: perfectColor, intensity: 0.5)
            }
        }
        updateGrid(t: t, running: running, pxPerSec: pxPerSec)
    }

    private func updateGrid(t: Double, running: Bool, pxPerSec: CGFloat) {
        gridPool.forEach { $0.isHidden = true }
        guard running, bpm > 0 else { return }
        let beat = 60 / bpm
        var k = Int(floor(t / beat))
        var idx = 0
        while idx < gridPool.count {
            let bt = Double(k) * beat
            let y = hitY + CGFloat(bt - t) * pxPerSec
            if y > size.height { break }
            if y >= hitY {
                let line = gridPool[idx]
                let isBar = k % beatsPerBar == 0
                line.isHidden = false
                line.position = CGPoint(x: 0, y: y)
                line.size = CGSize(width: size.width, height: isBar ? 2 : 1)
                line.color = SKColor(white: 1, alpha: isBar ? 0.22 : 0.07)
                idx += 1
            }
            k += 1
        }
    }

    // MARK: - Layout

    private func relayout() {
        guard size.width > 0 else { return }
        keyLayer.removeAllChildren()
        laneLayer.removeAllChildren()
        keySprites = [:]
        keyFrames = [:]
        let whites = (lowPitch...highPitch).filter { !isBlack($0) }
        let whiteW = size.width / CGFloat(whites.count)
        var x: CGFloat = 0
        for pitch in lowPitch...highPitch {
            if isBlack(pitch) {
                let w = whiteW * 0.6
                let rect = CGRect(x: x - w / 2, y: keyboardHeight * 0.38, width: w, height: keyboardHeight * 0.62)
                keyFrames[pitch] = rect
                addKey(pitch: pitch, rect: rect, z: 1)
            } else {
                let rect = CGRect(x: x + 1, y: 0, width: whiteW - 2, height: keyboardHeight)
                keyFrames[pitch] = rect
                addKey(pitch: pitch, rect: rect, z: 0)
                // Subtle lane per white key, C lanes slightly brighter.
                let lane = SKSpriteNode(color: SKColor(white: 1, alpha: pitch % 12 == 0 ? 0.06 : 0.025),
                                        size: CGSize(width: 1, height: size.height - hitY))
                lane.anchorPoint = .zero
                lane.position = CGPoint(x: x, y: hitY)
                laneLayer.addChild(lane)
                x += whiteW
            }
        }
        hitLine.size = CGSize(width: size.width, height: 3)
        hitLine.position = CGPoint(x: size.width / 2, y: hitY)
        hitLine.color = SKColor(white: 1, alpha: 0.8)
        streakLabel.position = CGPoint(x: size.width / 2, y: size.height * 0.7)
        setHeld(held)
    }

    private func addKey(pitch: Int, rect: CGRect, z: CGFloat) {
        let key = SKSpriteNode(color: .white, size: rect.size)
        key.anchorPoint = .zero
        key.position = rect.origin
        key.zPosition = z
        keyLayer.addChild(key)
        keySprites[pitch] = key
    }

    // MARK: - Effects (pooled)

    private func buildFxPool() {
        let texture = Self.dotTexture()
        for _ in 0..<12 {
            let e = SKEmitterNode()
            e.particleTexture = texture
            e.particleBirthRate = 0
            e.numParticlesToEmit = 0
            e.particleLifetime = 0.45
            e.particleLifetimeRange = 0.15
            e.particleSpeed = 220
            e.particleSpeedRange = 120
            e.emissionAngle = .pi / 2
            e.emissionAngleRange = .pi * 0.8
            e.yAcceleration = -500
            e.particleScale = 0.35
            e.particleScaleRange = 0.2
            e.particleScaleSpeed = -0.6
            e.particleAlphaSpeed = -2
            e.particleColorBlendFactor = 1
            e.particleBlendMode = .add
            fxLayer.addChild(e)
            fxPool.append(e)
        }
    }

    private func burst(at pitch: Int, color: SKColor, intensity: CGFloat) {
        guard let frame = keyFrames[pitch], !fxPool.isEmpty else { return }
        let e = fxPool[nextFx]
        nextFx = (nextFx + 1) % fxPool.count
        e.resetSimulation()
        e.position = CGPoint(x: frame.midX, y: hitY)
        e.particleColor = color
        e.numParticlesToEmit = Int(30 * intensity)
        e.particleBirthRate = 600
        // Brief key glow.
        if let key = keySprites[pitch] {
            key.removeAction(forKey: "glow")
            let base = key.color
            key.color = color
            key.run(.sequence([.wait(forDuration: 0.12), .run { [weak self] in
                guard let self else { return }
                if !self.held.contains(pitch) { key.color = base == color ? key.color : base }
                self.setHeld(self.held)
            }]), withKey: "glow")
        }
    }

    private func showStreak(_ n: Int) {
        streakLabel.text = "\(n) streak!"
        streakLabel.fontColor = perfectColor
        streakLabel.removeAllActions()
        streakLabel.setScale(0.6)
        streakLabel.alpha = 1
        streakLabel.run(.group([.scale(to: 1.1, duration: 0.25), .sequence([.wait(forDuration: 0.5), .fadeOut(withDuration: 0.3)])]))
    }

    private static func dotTexture() -> SKTexture {
        let size = CGSize(width: 32, height: 32)
        let image = UIGraphicsImageRenderer(size: size).image { ctx in
            let colors = [UIColor.white.cgColor, UIColor.white.withAlphaComponent(0).cgColor] as CFArray
            let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1])!
            ctx.cgContext.drawRadialGradient(gradient, startCenter: CGPoint(x: 16, y: 16), startRadius: 0,
                                             endCenter: CGPoint(x: 16, y: 16), endRadius: 16, options: [])
        }
        return SKTexture(image: image)
    }

    // MARK: - Helpers

    private func isBlack(_ pitch: Int) -> Bool { [1, 3, 6, 8, 10].contains(pitch % 12) }
    private func baseColor(_ i: Int) -> SKColor { isBlack(notes[i].pitch) ? blackNoteColor : noteColor }
    private func color(for grade: HitJudge.Grade) -> SKColor {
        switch grade {
        case .perfect: return perfectColor
        case .good: return goodColor
        case .miss, .extra: return missColor
        }
    }
}
