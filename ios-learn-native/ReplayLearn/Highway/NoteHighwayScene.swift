import SpriteKit
import SwiftUI

/// Vertical Note Highway. Geometry is shared with the rail and touch keyboard.
/// All nodes, paths, labels and effects are prepared at load/layout, never in update.
@MainActor
final class NoteHighwayScene: SKScene {
    #if DEBUG
    var performanceFrame: (() -> Void)?
    var performanceUpdate: ((Double) -> Void)?
    #endif
    private(set) var isPresentationReady = false
    override func didMove(to view: SKView) { isPresentationReady = false }
    override func willMove(from view: SKView) { isPresentationReady = false }
    override func didFinishUpdate() {
        #if DEBUG
        performanceFrame?()
        #endif
        if view?.window != nil && size.width > 1 && size.height > bottomOcclusion + 1 { isPresentationReady = true }
    }
    enum Mode { case idle, demo, play }
    let clock: HighwayClock
    /// Covered distance below the musical play point, independent of clock/scoring.
    var bottomOcclusion: CGFloat = 0 { didSet { if oldValue != bottomOcclusion { relayout() } } }
    var bpm: Double = 90
    var beatsPerBar = 4
    var lookahead: Double = 6
    var visibleRange = 48...72 { didSet { if oldValue != visibleRange { relayout() } } }
    var reduceMotion = false
    var previewBeat: Double?
    var previewBotPitches: Set<Int> = []
    var onSoundingChange: ((Set<Int>) -> Void)?
    private var soundingFlags: [Bool] = []
    private var soundingDirty = false
    var onArmedChange: ((Set<Int>) -> Void)?
    private(set) var mode: Mode = .idle
    private var notes: [Note] = []
    private var grades: [HitJudge.Grade?] = []
    private var lanes: [SKSpriteNode] = [], octaveLabels: [SKLabelNode] = [], bars: [SKSpriteNode] = [], measureLabels: [SKLabelNode] = []
    private var pills: [SKShapeNode] = [], rings: [SKShapeNode] = [], beams: [SKSpriteNode] = [], sparks: [SKShapeNode] = [], labels: [SKLabelNode] = [], tags: [SKLabelNode] = []
    private var colors: [UIColor] = [], botColors: [UIColor] = []
    private var tagPlates: [SKShapeNode] = []
    private var frames: [CGRect] = [], tagTimes: [Double] = []
    private let crop = SKCropNode(), content = SKNode(), cropMask = SKSpriteNode(color: .white, size: .zero)
    private let hitLine = SKShapeNode()
    private let accent = UIColor(ReplayTheme.accent), ink = UIColor(ReplayTheme.ink), background = UIColor(ReplayTheme.background), surface = UIColor(ReplayTheme.surface), muted = UIColor(ReplayTheme.muted), border = UIColor(ReplayTheme.strongBorder)
    private var lastAnnouncementTime = -Double.infinity
    private var nextIndex: Int? = nil
    private var measureNumbers = Array(repeating: Int.min, count: 32)
    private var lastTime = -Double.infinity
    private let beamTexture: SKTexture
    init(clock: HighwayClock) {
        self.clock = clock
        beamTexture = SKTexture(image: UIGraphicsImageRenderer(size: CGSize(width: 1, height: 64)).image { context in
            let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: [UIColor.clear.cgColor, UIColor.white.withAlphaComponent(0.26).cgColor] as CFArray, locations: [0, 1])!
            context.cgContext.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: 0, y: 64), options: [])
        })
        super.init(size: CGSize(width: 1000, height: 520))
        scaleMode = .resizeFill; backgroundColor = background
        cropMask.anchorPoint = .zero; crop.maskNode = cropMask; crop.addChild(content); addChild(crop)
        for _ in 0..<88 {
            let lane = SKSpriteNode(); lane.anchorPoint = .zero; content.addChild(lane); lanes.append(lane)
            let label = SKLabelNode(fontNamed: "JetBrainsMono-Regular"); label.fontSize = 10; label.fontColor = muted; label.horizontalAlignmentMode = .left; label.zPosition = 1
            content.addChild(label); octaveLabels.append(label)
        }
        for _ in 0..<32 {
            let bar = SKSpriteNode(color: border, size: .zero); bar.zPosition = 1; content.addChild(bar); bars.append(bar)
            let label = SKLabelNode(fontNamed: "JetBrainsMono-Regular"); label.fontSize = 10; label.fontColor = muted; label.horizontalAlignmentMode = .left; label.zPosition = 2
            content.addChild(label); measureLabels.append(label)
        }
        hitLine.strokeColor = accent; hitLine.lineWidth = 2; hitLine.zPosition = 9; addChild(hitLine)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }
    func load(sequence: NoteSequence?) {
        for nodes in [pills, rings, sparks] { nodes.forEach { $0.removeFromParent() } }
        tagPlates.forEach { $0.removeFromParent() }; tagPlates = []
        beams.forEach { $0.removeFromParent() }; labels.forEach { $0.removeFromParent() }; tags.forEach { $0.removeFromParent() }
        pills = []; rings = []; sparks = []; beams = []; labels = []; tags = []
        notes = (sequence?.notes ?? []).sorted { $0.startTime < $1.startTime }
        soundingFlags = Array(repeating: false, count: notes.count); onSoundingChange?([])
        grades = Array(repeating: nil, count: notes.count); tagTimes = Array(repeating: -.infinity, count: notes.count)
        colors = notes.map { UIColor(ReplayTheme.pitch($0.pitch)) }; botColors = colors.map { $0.withAlphaComponent(0.14) }
        frames = Array(repeating: .zero, count: notes.count)
        for index in notes.indices {
            let pill = SKShapeNode(); pill.zPosition = 4; content.addChild(pill); pills.append(pill)
            let ring = SKShapeNode(); ring.zPosition = 3; ring.lineWidth = 2; ring.strokeColor = ink; ring.fillColor = background; content.addChild(ring); rings.append(ring)
            let beam = SKSpriteNode(texture: beamTexture); beam.anchorPoint = CGPoint(x: 0.5, y: 0); beam.color = colors[index]; beam.colorBlendFactor = 1; beam.zPosition = 2; content.addChild(beam); beams.append(beam)
            let spark = SKShapeNode(circleOfRadius: 5); spark.fillColor = colors[index]; spark.strokeColor = colors[index]; spark.glowWidth = 10; spark.zPosition = 7; content.addChild(spark); sparks.append(spark)
            let label = SKLabelNode(fontNamed: "JetBrainsMono-Regular"); label.text = PianoGeometry.label(notes[index].pitch); label.fontSize = 11; label.zPosition = 5; content.addChild(label); labels.append(label)
            let plate = SKShapeNode(rect: CGRect(x: -40, y: -5, width: 80, height: 25), cornerRadius: 4); plate.fillColor = background.withAlphaComponent(0.9); plate.strokeColor = border; plate.lineWidth = 1; plate.zPosition = 9; content.addChild(plate); tagPlates.append(plate)
            let tag = SKLabelNode(fontNamed: "JetBrainsMono-Regular"); tag.fontSize = 11; tag.zPosition = 10; content.addChild(tag); tags.append(tag)
        }
        nextIndex = nil; lastTime = -.infinity; relayout()
    }
    func setMode(_ newMode: Mode) {
        isPresentationReady = false
        mode = newMode; soundingFlags = Array(repeating: false, count: notes.count); onSoundingChange?([]); grades = Array(repeating: nil, count: notes.count); tagTimes = Array(repeating: -.infinity, count: notes.count)
        nextIndex = nil; lastTime = -.infinity; onArmedChange?([]); update(0)
    }
    func apply(_ result: HitJudge.Judgment, streak: Int) {
        guard let index = result.noteIndex, notes.indices.contains(index) else { return }
        grades[index] = result.grade; tagTimes[index] = previewBeat == nil ? clock.time : notes[index].startTime
        tags[index].text = result.grade == .perfect ? "PERFECT" : result.grade == .miss ? "MISS" : (result.timingOffset ?? 0) < 0 ? "EARLY" : "LATE"
        tags[index].fontColor = result.grade == .perfect ? accent : muted
        tagPlates[index].strokeColor = result.grade == .perfect ? accent : border
        if UIAccessibility.isVoiceOverRunning, clock.isRunning, clock.time - lastAnnouncementTime > 1 {
            lastAnnouncementTime = clock.time
            UIAccessibility.post(notification: .announcement, argument: "\(PianoGeometry.label(result.pitch)), \(tags[index].text ?? "")")
        }
    }
    override func didChangeSize(_ oldSize: CGSize) { relayout() }
    private var pixelsPerSecond: CGFloat { min(84, max(1, size.height - bottomOcclusion) / 4) * CGFloat(bpm / 60) }
    private func relayout() {
        isPresentationReady = false
        guard !lanes.isEmpty else { return }
        content.position.y = bottomOcclusion
        let geometry = PianoGeometry(range: visibleRange, width: size.width, height: 300)
        let low = notes.map(\.pitch).min() ?? 48, high = notes.map(\.pitch).max() ?? 72
        for index in lanes.indices {
            let pitch = 21 + index, visible = visibleRange.contains(pitch)
            lanes[index].isHidden = !visible; octaveLabels[index].isHidden = !visible || pitch % 12 != 0
            guard visible else { continue }
            let rect = geometry.keyRect(pitch), black = PianoGeometry.isBlack(pitch)
            lanes[index].position = CGPoint(x: rect.minX, y: -bottomOcclusion); lanes[index].size = CGSize(width: rect.width, height: size.height)
            lanes[index].color = black ? background : surface; lanes[index].alpha = (pitch < low || pitch > high) ? 0.3 : 0.85; lanes[index].zPosition = black ? 0.5 : 0
            octaveLabels[index].text = PianoGeometry.label(pitch); octaveLabels[index].position = CGPoint(x: rect.minX + 3, y: 14)
        }
        for (i, note) in notes.enumerated() {
            let key = geometry.keyRect(note.pitch), inset: CGFloat = PianoGeometry.isBlack(note.pitch) ? 1 : 2
            let frame = CGRect(x: key.minX + inset, y: 0, width: max(3, key.width - inset*2), height: max(6, (note.endTime-note.startTime)*pixelsPerSecond-2))
            frames[i] = frame
            pills[i].path = CGPath(roundedRect: CGRect(origin: .zero, size: frame.size), cornerWidth: 7, cornerHeight: 7, transform: nil)
            rings[i].path = CGPath(roundedRect: CGRect(origin: .zero, size: frame.size).insetBy(dx: -4, dy: -4), cornerWidth: 10, cornerHeight: 10, transform: nil)
        }
        cropMask.size = size
        let path = CGMutablePath(); path.move(to: CGPoint(x: 0, y: bottomOcclusion + 1)); path.addLine(to: CGPoint(x: size.width, y: bottomOcclusion + 1)); hitLine.path = path
        update(0)
    }
    override func update(_ currentTime: TimeInterval) {
        #if DEBUG
        let measuredStart = performanceUpdate == nil ? nil : CACurrentMediaTime()
        defer { if let measuredStart { performanceUpdate?((CACurrentMediaTime() - measuredStart) * 1000) } }
        #endif
        let time = previewBeat.map { $0 * 60 / bpm } ?? (clock.isRunning ? clock.time : 0)
        let beatDuration = 60 / max(1, bpm), firstBeat = floor(time / beatDuration)
        hitLine.glowWidth = reduceMotion ? 0 : 5
        for i in bars.indices {
            let beat = firstBeat + Double(i), y = CGFloat(beat*beatDuration-time)*pixelsPerSecond
            bars[i].position = CGPoint(x: size.width/2, y: y); bars[i].size = CGSize(width: size.width, height: Int(beat).isMultiple(of: beatsPerBar) ? 1.5 : 0.5)
            bars[i].isHidden = y < 0 || y > size.height - bottomOcclusion
            measureLabels[i].isHidden = bars[i].isHidden || !Int(beat).isMultiple(of: beatsPerBar)
            if !measureLabels[i].isHidden { let number = Int(beat)/beatsPerBar+1; if measureNumbers[i] != number { measureNumbers[i] = number; measureLabels[i].text = String(number) }; measureLabels[i].position = CGPoint(x: 6, y: y-14) }
        }
        let next = mode == .demo ? nil : notes.indices.first { grades[$0] == nil && !previewBotPitches.contains(notes[$0].pitch) && notes[$0].startTime >= time - 0.02 }
        if next != nextIndex || lastTime == -.infinity {
            nextIndex = next
            var pitches: Set<Int> = []
            if let next { for i in next..<notes.count { if notes[i].startTime > notes[next].startTime + 0.001 { break }; if grades[i] == nil && !previewBotPitches.contains(notes[i].pitch) { pitches.insert(notes[i].pitch) } } }
            onArmedChange?(pitches)
        }
        lastTime = time
        soundingDirty = false
        for (i, note) in notes.enumerated() {
            let judgedActive = note.startTime <= time && note.endTime > time && (grades[i] == .perfect || grades[i] == .good)
            if soundingFlags[i] != judgedActive { soundingFlags[i] = judgedActive; soundingDirty = true }
            let frame = frames[i], y = CGFloat(note.startTime-time)*pixelsPerSecond
            let visible = visibleRange.contains(note.pitch) && y + frame.height >= -bottomOcclusion && y <= size.height - bottomOcclusion
            pills[i].isHidden = !visible; labels[i].isHidden = true; rings[i].isHidden = true; beams[i].isHidden = true; sparks[i].isHidden = true
            let age = time-tagTimes[i]
            tags[i].isHidden = age < 0 || age > 0.75
            tagPlates[i].isHidden = tags[i].isHidden
            if !tags[i].isHidden { tags[i].position = CGPoint(x: frame.midX, y: 14 + (reduceMotion ? 0 : age/0.75*28)); tags[i].alpha = reduceMotion ? 1 : 1-age/0.75; tagPlates[i].position = tags[i].position; tagPlates[i].alpha = tags[i].alpha }
            guard visible else { continue }
            let isBot = mode == .demo || previewBotPitches.contains(note.pitch)
            let missed = grades[i] == .miss
            let active = note.startTime <= time && note.endTime > time && (isBot || grades[i] == .perfect || grades[i] == .good)
            let armed = next.map { !missed && grades[i] == nil && abs(notes[$0].startTime-note.startTime) < 0.001 } ?? false
            let point = CGPoint(x: frame.minX, y: y)
            pills[i].position = point; pills[i].fillColor = missed ? surface : isBot ? botColors[i] : colors[i]
            pills[i].strokeColor = missed ? border : colors[i]; pills[i].lineWidth = missed ? 1 : isBot ? 2 : 0
            pills[i].glowWidth = active && !reduceMotion ? 4 : 0
            labels[i].isHidden = missed || frame.height < 24 || y + frame.height < 18
            labels[i].fontColor = isBot ? colors[i] : background
            labels[i].position = CGPoint(x: frame.midX, y: max(0,y)+7)
            rings[i].position = point; rings[i].isHidden = !armed
            beams[i].isHidden = !armed || y <= 0; beams[i].position = CGPoint(x: frame.midX, y: 0); beams[i].size = CGSize(width: frame.width, height: max(0,y))
            sparks[i].isHidden = !active || reduceMotion; sparks[i].position = CGPoint(x: frame.midX, y: 3)
        }
        if soundingDirty { onSoundingChange?(Set(notes.indices.filter { soundingFlags[$0] }.map { notes[$0].pitch })) }
    }
}
