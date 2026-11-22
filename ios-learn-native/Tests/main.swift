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
