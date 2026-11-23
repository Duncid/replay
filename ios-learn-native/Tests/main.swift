import Foundation
import CoreGraphics

func check(_ condition: @autoclosure () -> Bool, _ rule: String) {
    guard condition() else { fatalError(rule) }
    print("PASS: \(rule)")
}

let snapshot = TuneCurriculumSnapshot(tunes: [
    .init(tuneKey: "first-node", musicRef: "intro"),
    .init(tuneKey: "second-node", musicRef: "st-louis-blues")
], edges: [.init(source_key: "first-node", target_key: "second-node", edge_type: "tune_next")])
check(TuneAvailability.resolve("intro", snapshot: snapshot, acquired: []).unlocked, "Intro starts unlocked")
let locked = TuneAvailability.resolve("st-louis-blues", snapshot: snapshot, acquired: [])
check(!locked.unlocked && locked.prerequisites == ["intro"], "St Louis Blues requires intro")
check(TuneAvailability.resolve("st-louis-blues", snapshot: snapshot, acquired: ["intro"]).unlocked, "Completing intro unlocks St Louis Blues")
check(TuneAvailability.resolve("st-louis-blues", snapshot: snapshot, acquired: ["first-node"]).unlocked, "Legacy node-key completion unlocks its successor")
check(TuneAvailability.resolve("st-louis-blues", snapshot: snapshot, acquired: ["st-louis-blues"]).unlocked, "Completed tunes remain unlocked")
check(TuneAvailability.resolve("new-tune", snapshot: snapshot, acquired: []).unlocked, "Published tunes outside progression start unlocked")
let skillSnapshot = TuneCurriculumSnapshot(tunes: [
    .init(tuneKey: "first-node", musicRef: "intro")
], edges: [.init(source_key: "first-node", target_key: "skill", edge_type: "tune_requires_skill")])
check(TuneAvailability.resolve("intro", snapshot: skillSnapshot, acquired: []).unlocked,
      "Tune-only entry ignores lesson and skill requirements")

let geometry = PianoGeometry(range: 48...72, width: 1180, height: 300)
check(geometry.whites.count == 15 && geometry.blacks.count == 10, "Wide keyboard has 15 white and 10 black keys")
check(abs(geometry.keyRect(49).width / geometry.whiteWidth - 0.58) < 0.0001, "Black key width is 58 percent")
check(abs(geometry.keyRect(49).height / 248 - 0.58) < 0.0001, "Black key height is 58 percent")
for pitch in 48...72 {
    let key = geometry.keyRect(pitch), rail = geometry.railRect(pitch)
    check(key.minX == rail.minX && key.width == rail.width, "Rail and key align for \(pitch)")
    let point = CGPoint(x: key.midX, y: PianoGeometry.isBlack(pitch) ? key.midY : key.maxY-10)
    check(geometry.key(at: point) == pitch, "Hit test resolves \(pitch)")
}
check(geometry.key(at: CGPoint(x: geometry.keyRect(49).midX, y: 60)) == 49, "Black wins over overlapping white key")
check(geometry.key(at: CGPoint(x: 10, y: 20)) == nil, "Rail never plays notes")
check(geometry.key(at: CGPoint(x: -1, y: 150)) == nil, "Outside left edge releases")
check(geometry.key(at: CGPoint(x: 10, y: 301)) == nil, "Outside bottom edge releases")
var touches = PianoTouchState<Int>()
check(touches.move(1, to: 60).on == 60, "First finger sends note on")
check(touches.move(2, to: 60).on == nil, "Second finger on same pitch does not retrigger")
check(touches.move(1, to: nil).off == nil, "Lifting one shared finger keeps pitch held")
let slide = touches.move(2, to: 64)
check(slide.off == 60 && slide.on == 64, "Glissando releases previous and starts next pitch")
for index in 0..<10 { _ = touches.move(index+10, to: 48+index) }
check(touches.cancel().count == 11 && touches.touches.isEmpty, "Cancellation releases every chord pitch")
let midi = MIDIByteParser.parse([0x90,60,100,64,90,0xF8,67,80,0x80,60,0,0x90,64,0])
check(midi == [.init(pitch:60,velocity:100),.init(pitch:64,velocity:90),.init(pitch:67,velocity:80),.init(pitch:60,velocity:0),.init(pitch:64,velocity:0)], "MIDI parses chords, running status, real-time bytes and releases")
var judge = HitJudge()
judge.reset(targets: [Note(pitch:60,startTime:0,endTime:0.5,velocity:nil),Note(pitch:64,startTime:0,endTime:0.5,velocity:nil),Note(pitch:67,startTime:1,endTime:1.5,velocity:nil)])
check(judge.noteOn(pitch:60,at:0).grade == .perfect && judge.noteOn(pitch:64,at:0.04).grade == .perfect, "Judge scores simultaneous chord notes independently")
check(judge.noteOn(pitch:60,at:0.05).grade == .extra, "Judge never awards the same note twice")
check(judge.sweepMisses(now:1.3).count == 1, "Miss sweep resolves the unplayed note")
check(TuneAvailability.resolve("intro", snapshot:snapshot, acquired:["intro"]).acquired, "Acquired state survives library mapping")

var timingJudge = HitJudge()
timingJudge.reset(targets: [Note(pitch: 60, startTime: 1, endTime: 2, velocity: 90)])
let earlyHit = timingJudge.noteOn(pitch: 60, at: 0.9)
assert(earlyHit.grade == .good && (earlyHit.timingOffset ?? 0) < 0)
timingJudge.reset(targets: [Note(pitch: 60, startTime: 1, endTime: 2, velocity: 90)])
let lateHit = timingJudge.noteOn(pitch: 60, at: 1.1)
assert(lateHit.grade == .good && (lateHit.timingOffset ?? 0) > 0)
print("PASS: signed early/late feedback preserves scoring windows")

let normalKeys = PianoGeometry(range: 48...72, width: 1200, height: 300)
let compactKeys = PianoGeometry(range: 48...72, width: 1200, height: PianoGeometry.panelHeight(300, midiConnected: true))
for pitch in [60, 61] {
    check(compactKeys.keyRect(pitch).height == normalKeys.keyRect(pitch).height / 2, "MIDI halves key height for \(pitch)")
    check(compactKeys.railRect(pitch) == normalKeys.railRect(pitch), "MIDI preserves rail geometry for \(pitch)")
    check(compactKeys.key(at: CGPoint(x: compactKeys.keyRect(pitch).midX, y: compactKeys.keyRect(pitch).maxY - 1)) == pitch, "Compact key hit testing for \(pitch)")
}
check(PianoGeometry.panelHeight(300, midiConnected: false) == 300, "Disconnect restores normal key height")
