import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { buildFallbackPlan, equivalentPracticeItems, parsePracticePlan, practiceMusicSignature } from "../tune-coach/fallback.ts";
import { evaluateFallback, parseEvaluation } from "../tune-evaluate/fallback.ts";
import { withTuneAiFallback } from "../_shared/tune-ai.ts";

const sequence = (pitches = [60, 62, 64, 65], offset = 0, pace = 0.5) => ({
  notes: pitches.map((pitch, i) => ({ pitch, startTime: offset + i * pace, endTime: offset + i * pace + 0.4 })),
});
const nugget = (id, measure) => ({ id, location: { startMeasure: measure }, dependsOn: [],
  noteSequence: sequence([60, 62, 64, 65].map(pitch => pitch + measure - 1)) });
const nuggets = [nugget("N1", 1), nugget("N2", 3), nugget("N3", 5), nugget("N4", 7)];
const assemblies = [
  { id: "A1", tier: 1, nuggetIds: ["N1", "N2"], noteSequence: sequence([48, 50, 52, 53]) },
  { id: "A2", tier: 1, nuggetIds: ["N3", "N4"], noteSequence: sequence([50, 52, 54, 55]) },
  { id: "A3", tier: 2, nuggetIds: ["N1", "N2", "N3", "N4"], noteSequence: sequence([48, 50, 52, 53, 50, 52, 54, 55]) },
];
const state = (id, streak = 2) => ({ nugget_id: id, attempt_count: 3, current_streak: streak,
  best_streak: 2, pass_count: 2, last_practiced_at: "2026-11-20T12:00:00Z" });
const context = (extra = {}) => ({ nuggets, assemblies, states: [], hasFullTune: true, fullTuneSequence: sequence(), ...extra });
const ids = plan => plan.practicePlan.map(p => p.itemId);
const evaluate = (userSequence, extra = {}) => evaluateFallback({ targetSequence: sequence(), userSequence,
  currentStreak: 0, isFullTune: false, alreadyAcquired: false, ...extra });

test("beginner plan follows teaching order, appending missing items in score order", () => {
  assert.deepEqual(ids(buildFallbackPlan(context({ nuggets: [...nuggets].reverse(), teachingOrder: ["missing", "N2"] }))), ["N2", "N1"]);
});
test("review is unique and precedes new work; scheduled work does not unlock an assembly", () => {
  const plan = buildFallbackPlan(context({ states: [state("N1", 0)] }));
  assert.deepEqual(ids(plan), ["N1", "N2", "N3"]);
  assert.ok(plan.practicePlan.every(p => p.itemType === "nugget"));
});
test("stable components unlock small assemblies before larger ones", () => {
  const readyNuggets = nuggets.map(n => state(n.id));
  assert.deepEqual(ids(buildFallbackPlan(context({ states: readyNuggets }))), ["A1", "A2"]);
  assert.deepEqual(ids(buildFallbackPlan(context({ states: [...readyNuggets, state("A1"), state("A2")] }))), ["A3"]);
  assert.deepEqual(ids(buildFallbackPlan(context({ states: [...readyNuggets, ...assemblies.map(a => state(a.id))] }))), ["FULL_TUNE"]);
});
test("mastering the opening alone never unlocks the full tune", () => {
  const plan = buildFallbackPlan(context({ states: [state("N1"), state("N2"), state("A1"), state("A3")] }));
  assert.ok(!ids(plan).includes("FULL_TUNE"));
});
test("explicit repeats share readiness, but motif references do not block learning", () => {
  const repeated = [{ ...nuggets[0], dependsOn: ["M1"] }, { ...nuggets[1], sameAs: "N1" }];
  assert.deepEqual(ids(buildFallbackPlan(context({ nuggets: repeated, assemblies: [] }))), ["N1"]);
  assert.deepEqual(ids(buildFallbackPlan(context({ nuggets: repeated, assemblies: [], states: [state("N1")] }))), ["FULL_TUNE"]);
});
test("dependencies and broken/cyclic metadata cannot trap a learner in an empty plan", () => {
  const ns = [{ ...nuggets[0], dependsOn: ["N2"] }, nuggets[1]];
  assert.deepEqual(ids(buildFallbackPlan(context({ nuggets: ns, assemblies: [] }))), ["N2"]);
  assert.ok(buildFallbackPlan(context({ nuggets: [ns[0], { ...ns[1], dependsOn: ["N1"] }] })).practicePlan.length);
});
test("small scores work without assemblies and use French instructions", () => {
  const plan = buildFallbackPlan(context({ nuggets: [nuggets[0]], assemblies: [], language: "fr" }));
  assert.match(plan.encouragement, /phrase par phrase/);
  assert.doesNotMatch(plan.practicePlan[0].instruction, /N1/);
  assert.deepEqual(ids(buildFallbackPlan(context({ nuggets: [], assemblies: [] }))), ["FULL_TUNE"]);
  assert.throws(() => buildFallbackPlan(context({ nuggets: [], assemblies: [], hasFullTune: false })));
});
test("AI plans with missing items, empty output or malformed fields are rejected", () => {
  assert.throws(() => parsePracticePlan({ practicePlan: [], encouragement: "" }, context()));
  assert.throws(() => parsePracticePlan({ practicePlan: [{ itemId: "N999", itemType: "nugget", instruction: "", motifs: [] }], encouragement: "" }, context()));
  assert.deepEqual(parsePracticePlan(buildFallbackPlan(context()), context()), buildFallbackPlan(context()));
});

const planItem = (itemId, itemType = "nugget", instruction = "Practice this phrase.") =>
  ({ itemId, itemType, instruction, motifs: [] });
const planOf = (...items) => ({ practicePlan: items, encouragement: "Keep going." });
function assertUnique(plan, ctx) {
  assert.equal(new Set(ids(plan)).size, plan.practicePlan.length);
  const signatures = plan.practicePlan.map(item => practiceMusicSignature(item.itemType === "full_tune"
    ? ctx.fullTuneSequence : (item.itemType === "nugget" ? ctx.nuggets : ctx.assemblies).find(n => n.id === item.itemId).noteSequence));
  assert.ok(signatures.every(Boolean));
  assert.equal(new Set(signatures).size, signatures.length);
}

test("AI rejects repeated IDs anywhere, even with different instructions", () => {
  for (const middle of [[], [planItem("N2")]]) {
    assert.throws(() => parsePracticePlan(planOf(planItem("N1"), ...middle, planItem("N1", "nugget", "Review it.")), context()), /Duplicate practice item ID/);
  }
  const ctx = context({ assemblies: [{ ...assemblies[0], id: "N1" }] });
  assert.throws(() => parsePracticePlan(planOf(planItem("N1"), planItem("N1", "assembly")), ctx), /Duplicate practice item ID/);
});

test("musical signatures ignore export ordering, silence, metadata and doubled unisons", () => {
  const original = sequence();
  const shifted = sequence(undefined, 12);
  shifted.notes = [...shifted.notes.reverse(), { ...shifted.notes[0] }].map(n => ({ ...n, instrument: 4, velocity: 12 }));
  shifted.totalTime = 100;
  assert.equal(practiceMusicSignature(original), practiceMusicSignature(shifted));
  const noise = { notes: original.notes.map(n => ({ ...n, startTime: n.startTime + 1e-9, endTime: n.endTime + 2e-9 })) };
  assert.equal(practiceMusicSignature(original), practiceMusicSignature(noise));
  for (const changed of [sequence([60, 62, 63, 65]), sequence(undefined, 0, 0.6),
    { notes: original.notes.map(n => ({ ...n, endTime: n.endTime + 0.1 })) }]) {
    assert.notEqual(practiceMusicSignature(original), practiceMusicSignature(changed));
  }
});

test("AI rejects identical content across IDs and types, including separated duplicates", () => {
  const ctx = context({ nuggets: [nuggets[0], { ...nuggets[1], noteSequence: sequence(undefined, 9) }, nuggets[2]],
    assemblies: [{ ...assemblies[0], noteSequence: sequence() }] });
  for (const duplicate of [planItem("N2"), planItem("A1", "assembly"), planItem("FULL_TUNE", "full_tune")]) {
    for (const middle of [[], [planItem("N3")]]) {
      assert.throws(() => parsePracticePlan(planOf(planItem("N1"), ...middle, duplicate), ctx), /Duplicate practice music/);
    }
  }
  assert.deepEqual(equivalentPracticeItems(ctx), [["N1", "N2", "A1", "FULL_TUNE"]]);
});

test("larger assemblies containing an earlier nugget remain distinct", () => {
  const ctx = context({ assemblies: [{ ...assemblies[0], noteSequence: {
    notes: [...sequence().notes, ...sequence([67, 69], 3).notes],
  } }] });
  const plan = planOf(planItem("N1"), planItem("A1", "assembly"));
  assert.deepEqual(parsePracticePlan(plan, ctx), plan);
});

test("heuristic skips duplicate IDs and music without consuming learning slots", () => {
  const ctx = context({ nuggets: [nuggets[0], nuggets[0], { ...nuggets[1], noteSequence: sequence() }, nuggets[2], nuggets[3]] });
  assert.deepEqual(ids(buildFallbackPlan(ctx)), ["N1", "N3"]);
  const reviewCtx = { ...ctx, states: [state("N1", 0)] };
  const plan = buildFallbackPlan(reviewCtx);
  assert.deepEqual(ids(plan), ["N1", "N3", "N4"]);
  assertUnique(plan, reviewCtx);
});

test("heuristic skips duplicate assemblies and duplicates shared with review", () => {
  const ctx = context({ states: [state("N1", 0), state("N2"), state("N3"), state("N4")],
    assemblies: [
      { ...assemblies[0], nuggetIds: ["N2", "N3"], noteSequence: sequence() },
      { ...assemblies[1], noteSequence: sequence([48, 50]) },
      { ...assemblies[1], id: "A4", noteSequence: sequence([48, 50]) },
      { ...assemblies[1], id: "A5", noteSequence: sequence([51, 53]) },
    ] });
  const plan = buildFallbackPlan(ctx);
  assert.deepEqual(ids(plan), ["N1", "A2", "A5"]);
  assertUnique(plan, ctx);
});

test("full tune replacement clears prior signatures and all-identical candidates yield one item", () => {
  const ctx = context({ nuggets: nuggets.map(n => ({ ...n, noteSequence: sequence() })), assemblies: [] });
  assert.deepEqual(ids(buildFallbackPlan(ctx)), ["N1"]);
  const ready = context({ states: [...nuggets.map(n => state(n.id)), state("A3")],
    fullTuneSequence: assemblies[0].noteSequence });
  assert.deepEqual(ids(buildFallbackPlan(ready)), ["FULL_TUNE"]);
  assertUnique(buildFallbackPlan(ready), ready);
});

test("invalid music is rejected by AI validation and excluded from heuristic candidates", () => {
  for (const invalid of [undefined, null, {}, { notes: [] }, { notes: [null] },
    { notes: [{ pitch: 60, startTime: NaN, endTime: 1 }] },
    { notes: [{ pitch: 60, startTime: 1, endTime: 0 }] }]) {
    assert.equal(practiceMusicSignature(invalid), null);
    const ctx = context({ nuggets: [{ ...nuggets[0], noteSequence: invalid }, nuggets[1]],
      assemblies: [], fullTuneSequence: invalid });
    assert.throws(() => parsePracticePlan(planOf(planItem("N1")), ctx), /no valid playable music/);
    assert.throws(() => parsePracticePlan(planOf(planItem("FULL_TUNE", "full_tune")), ctx), /no valid playable music/);
    assert.deepEqual(ids(buildFallbackPlan(ctx)), ["N2"]);
    assert.throws(() => buildFallbackPlan({ ...ctx, nuggets: [ctx.nuggets[0]] }), /no playable practice items/);
    const withInvalidAssembly = context({ states: nuggets.map(n => state(n.id)), assemblies: [{ ...assemblies[0], noteSequence: invalid }], fullTuneSequence: invalid });
    assertUnique(buildFallbackPlan(withInvalidAssembly), withInvalidAssembly);
  }
});

test("matching tolerates leading silence and unrelated warm-up and trailing notes", () => {
  const played = { notes: [...sequence([40, 41]).notes, ...sequence(undefined, 4).notes, ...sequence([80], 8).notes] };
  assert.equal(evaluate(played).evaluation, "pass");
});
test("missing, additional and swapped notes within a phrase never pass", () => {
  for (const notes of [[60, 62, 65], [60, 62, 70, 64, 65], [60, 64, 62, 65]]) {
    const result = evaluate(sequence(notes));
    assert.notEqual(result.evaluation, "pass");
    assert.equal(result.successCount, 0);
  }
  assert.equal(evaluate(sequence([60, 62, 63, 65])).evaluation, "close");
  assert.equal(evaluate(sequence([48, 49, 50, 51])).evaluation, "fail");
});
test("an empty recording fails; malformed notes and empty targets are errors", () => {
  assert.equal(evaluate({ notes: [] }).evaluation, "fail");
  for (const userSequence of [{}, { notes: [null] }, { notes: [{ pitch: 60, startTime: NaN, endTime: 1 }] }]) {
    assert.throws(() => evaluate(userSequence));
  }
  assert.throws(() => evaluate(sequence(), { targetSequence: { notes: [] } }));
});
test("30 percent onset tolerance, moderate rhythm errors, and major timing errors", () => {
  assert.equal(evaluate(sequence(undefined, 2, 0.65)).evaluation, "pass");
  assert.equal(evaluate(sequence(undefined, 2, 0.72)).evaluation, "close");
  assert.equal(evaluate(sequence(undefined, 2, 1.2)).evaluation, "fail");
});
test("chords tolerate small hand offsets and doubled unisons but require every pitch", () => {
  const target = { notes: [60, 64, 67, 60].map(pitch => ({ pitch, startTime: 0, endTime: 1 })) };
  const played = { notes: [67, 60, 64].map((pitch, i) => ({ pitch, startTime: 3 + i * 0.02, endTime: 4 })) };
  assert.equal(evaluate(played, { targetSequence: target }).evaluation, "pass");
  assert.notEqual(evaluate({ notes: played.notes.slice(1) }, { targetSequence: target }).evaluation, "pass");
});
test("repeated notes allow rearticulation but one held note cannot replace several", () => {
  const target = sequence([60, 60, 60], 0, 0.25);
  assert.equal(evaluate(sequence([60, 60, 60], 0, 0.4), { targetSequence: target }).evaluation, "pass");
  assert.notEqual(evaluate(sequence([60]), { targetSequence: target }).evaluation, "pass");
});
test("a short tap cannot pass a long sustained single note", () => {
  assert.equal(evaluate(sequence([60]), { targetSequence: { notes: [{ pitch: 60, startTime: 0, endTime: 3 }] } }).evaluation, "fail");
});
test("fast melodic notes are not incorrectly grouped into chords", () => {
  const fast = sequence([60, 62, 64, 65], 0, 0.04);
  assert.equal(evaluate(fast, { targetSequence: fast }).evaluation, "pass");
});
test("published score fixtures, including combined piano parts, pass when played exactly", async () => {
  for (const [tune, files] of [
    ["intro", ["tune.ns.json"]],
    ["st-louis-blues", ["tune.ns.json"]],
    ["gymnopdie", ["tune.inst1.ns.json", "tune.inst2.ns.json"]],
  ]) {
    const parts = await Promise.all(files.map(file => readFile(new URL(`../../../src/music/${tune}/output/${file}`, import.meta.url), "utf8").then(JSON.parse)));
    const targetSequence = { notes: parts.flatMap(part => part.notes) };
    assert.equal(evaluate(targetSequence, { targetSequence }).evaluation, "pass", tune);
  }
});
test("best timed complete segment wins, with one success per submission", () => {
  const played = { notes: [...sequence().notes, ...sequence(undefined, 8, 2).notes] };
  const result = evaluate(played);
  assert.equal(result.evaluation, "pass");
  assert.equal(result.successCount, 1);
});
test("only sustained full-tune success acquires a tune; retries can award missing skills", () => {
  assert.equal(evaluate(sequence(), { currentStreak: 2 }).markTuneAcquired, false);
  assert.equal(evaluate(sequence(), { isFullTune: true, currentStreak: 1 }).markTuneAcquired, false);
  const acquired = evaluate(sequence(), { isFullTune: true, currentStreak: 2 });
  assert.equal(acquired.markTuneAcquired, true);
  assert.equal(acquired.awardSkills, true);
  const retry = evaluate(sequence(), { isFullTune: true, currentStreak: 2, alreadyAcquired: true });
  assert.equal(retry.markTuneAcquired, false);
  assert.equal(retry.awardSkills, true);
  assert.equal(evaluate(sequence([40]), { isFullTune: true, currentStreak: 2 }).markTuneAcquired, false);
});
test("French evaluation and semantic AI validation", () => {
  const result = evaluate(sequence(), { language: "fr" });
  assert.match(result.feedbackText, /pulsation/);
  assert.deepEqual(parseEvaluation(result), result);
  for (const invalid of [{}, { ...result, evaluation: "perfect" }, { ...result, successCount: Infinity },
    { ...result, evaluation: "fail", successCount: 0, markTuneAcquired: true }]) assert.throws(() => parseEvaluation(invalid));
});

// Load the actual Deno handlers with only their platform boundaries substituted.
// No credentials, network service or deployment are needed for these integration tests.
async function handler(name, options = {}) {
  const writes = [];
  let assetReads = 0;
  const asset = options.asset ?? { briefing: { title: "Example", motifs: [], teachingOrder: nuggets.map(n => n.id) },
    nuggets, assemblies, note_sequence: sequence() };
  const db = { from(table) {
    let operation = "select", payload, single = false;
    const filters = [];
    const query = new Proxy({}, { get(_, key) {
      if (key === "then") return (resolve, reject) => {
        if (operation !== "select") writes.push({ table, operation, payload, filters });
        let data = null;
        if (operation === "select") {
          if (table === "tune_assets") data = options.missingAsset || (options.legacyAsset && assetReads++ === 0) ? null : asset;
          if (table === "tune_nugget_state") data = single ? options.existingState ?? null : options.states ?? [];
          if (table === "user_tune_acquisition") data = options.alreadyAcquired ? { id: "acquired" } : null;
          if (table === "curriculum_edges") data = [{ target_key: "skill1" }];
          if (table === "user_skill_state") data = [];
        }
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      };
      return (...args) => {
        if (["insert", "update", "upsert"].includes(key)) { operation = key; payload = args[0]; }
        if (["single", "maybeSingle"].includes(key)) single = true;
        if (["eq", "is"].includes(key)) filters.push(args);
        return query;
      };
    } });
    return query;
  } };
  let serveHandler;
  let aiCalls = 0;
  const sandbox = vm.createContext({
    console, Response, Request, AbortSignal, setTimeout, clearTimeout,
    Deno: { env: { get: key => key === "LOVABLE_API_KEY" ? options.apiKey : "test" } },
    fetch: async (...args) => { aiCalls++; return options.fetch(...args); },
  });
  const exportsModule = values => new vm.SyntheticModule(Object.keys(values), function () {
    for (const [key, value] of Object.entries(values)) this.setExport(key, value);
  }, { context: sandbox });
  const cache = new Map();
  const load = async url => {
    if (cache.has(url.href)) return cache.get(url.href);
    const source = await readFile(url, "utf8");
    const mod = new vm.SourceTextModule(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext } }).outputText, { context: sandbox, identifier: url.href });
    cache.set(url.href, mod);
    await mod.link(async (specifier, parent) => {
      if (specifier.endsWith("/_shared/auth.ts")) return exportsModule({
        requireUser: async () => { if (options.unauthorized) throw new Error("Unauthorized"); return { userId: "owner1", admin: db }; },
        resolveProfile: async () => "profile1",
        authErrorResponse: error => error.message === "Unauthorized" ? new Response("Unauthorized", { status: 401 }) : null,
      });
      if (specifier.startsWith("https://deno.land")) return exportsModule({ serve: callback => { serveHandler = callback; } });
      if (specifier.startsWith("https://esm.sh")) return exportsModule({ createClient: () => db });
      return load(new URL(specifier, parent.identifier));
    });
    return mod;
  };
  await (await load(new URL(`../${name}/index.ts`, import.meta.url))).evaluate();
  return { writes, aiCalls: () => aiCalls, async invoke(body = {}) {
    const response = await serveHandler(new Request("https://test.local", { method: "POST",
      body: JSON.stringify({ tuneKey: "example", nuggetId: "N1", userSequence: sequence(), ...body }) }));
    const data = await response.json().catch(() => null);
    return { response, data };
  } };
}

test("coach handler without AI returns enriched practice items and profile-scoped history", async () => {
  const app = await handler("tune-coach");
  const { response, data } = await app.invoke();
  assert.equal(response.status, 200);
  assert.equal(data.tuneTitle, "Example");
  assert.equal(data.practicePlan[0].nugget.id, "N1");
  assert.equal(data.practicePlan[0].assembly, null);
  assert.equal(app.aiCalls(), 0);
  assertUnique(data, context());
});

const aiPlanResponse = plan => Response.json({ choices: [{ message: { tool_calls: [{ function: {
  name: "submit_practice_plan", arguments: JSON.stringify(plan),
} }] } }] });

for (const [label, invalidPlan] of [
  ["repeated ID", planOf(planItem("N1"), planItem("N3"), planItem("N1", "nugget", "Review"))],
  ["identical music", planOf(planItem("N1"), planItem("N3"), planItem("N2"))],
  ["full tune duplicate", planOf(planItem("N1"), planItem("FULL_TUNE", "full_tune"))],
]) test(`coach handler replaces AI ${label} with a unique heuristic plan`, async () => {
  const ctx = context({ nuggets: [nuggets[0], { ...nuggets[1], noteSequence: sequence(undefined, 10) }, nuggets[2]] });
  const app = await handler("tune-coach", { apiKey: "test", fetch: async () => aiPlanResponse(invalidPlan),
    asset: { briefing: { title: "Example" }, nuggets: ctx.nuggets, assemblies: ctx.assemblies, note_sequence: ctx.fullTuneSequence } });
  const { response, data } = await app.invoke();
  assert.equal(response.status, 200);
  assert.equal(app.aiCalls(), 1);
  assert.deepEqual(ids(data), ["N1", "N3"]);
  assertUnique(data, ctx);
});

test("coach handler keeps a valid AI plan unchanged", async () => {
  const plan = planOf(planItem("N4"), planItem("N2"));
  const app = await handler("tune-coach", { apiKey: "test", fetch: async () => aiPlanResponse(plan) });
  const { response, data } = await app.invoke();
  assert.equal(response.status, 200);
  assert.deepEqual(ids(data), ["N4", "N2"]);
  assertUnique(data, context());
});

test("coach without AI deduplicates music and explains equivalent IDs in its prompt", async () => {
  const ctx = context({ nuggets: nuggets.map(n => ({ ...n, noteSequence: sequence() })), assemblies: [] });
  const app = await handler("tune-coach", { asset: { briefing: { title: "Example" },
    nuggets: ctx.nuggets, assemblies: [], note_sequence: ctx.fullTuneSequence } });
  const { response, data } = await app.invoke();
  assert.equal(response.status, 200);
  assert.deepEqual(ids(data), ["N1"]);
  assertUnique(data, ctx);
  const debug = (await app.invoke({ debug: true })).data;
  assert.match(debug.prompt, /student repeats until they get it right before pressing Next/);
  assert.match(debug.prompt, /entire plan, not just consecutive entries/);
  assert.match(debug.prompt, /N1, N2, N3, N4, FULL_TUNE/);
  assert.doesNotMatch(debug.prompt, /target about 16/);
  assert.equal(app.aiCalls(), 0);
});
test("coach handles a legacy asset when the published-version lookup has no result", async () => {
  const app = await handler("tune-coach", { legacyAsset: true });
  assert.equal((await app.invoke()).response.status, 200);
});
test("evaluate handler without AI saves the run and advances streak/acquisition/skills", async () => {
  const app = await handler("tune-evaluate", { existingState: { ...state("FULL_TUNE"), id: "state1" } });
  const { response, data } = await app.invoke({ nuggetId: "FULL_TUNE", evalIndex: 7 });
  assert.equal(response.status, 200);
  assert.equal(data.currentStreak, 3);
  assert.equal(data.suggestNewNugget, true);
  assert.equal(data.tuneAcquired, true);
  assert.deepEqual(data.awardedSkills, ["skill1"]);
  assert.equal(data.evalIndex, 7);
  assert.ok(app.writes.some(w => w.table === "tune_nugget_state" && w.payload.current_streak === 3));
  assert.ok(app.writes.some(w => w.table === "tune_practice_runs" && w.payload.local_user_id === "profile1"));
  assert.equal(app.aiCalls(), 0);
});
test("fallback failures reset streak without awarding progress", async () => {
  const app = await handler("tune-evaluate", { existingState: { ...state("N1"), id: "state1" } });
  const { data } = await app.invoke({ userSequence: sequence([40, 41]) });
  assert.equal(data.currentStreak, 0);
  assert.equal(data.successCount, 0);
  assert.equal(data.tuneAcquired, false);
  assert.equal(app.writes.some(w => w.table === "user_tune_acquisition"), false);
});
for (const name of ["tune-coach", "tune-evaluate"]) {
  for (const [failure, fetch] of [
    ["rate limit", async () => new Response("rate limited", { status: 429 })],
    ["server failure", async () => new Response("unavailable", { status: 503 })],
    ["network failure", async () => { throw new Error("network unavailable"); }],
    ["invalid JSON", async () => new Response("broken")],
    ["invalid tool result", async () => Response.json({ choices: [{ message: { tool_calls: [{ function: {
      name: name === "tune-coach" ? "submit_practice_plan" : "submit_evaluation", arguments: "{}",
    } }] } }] })],
  ]) test(`${name} returns a successful fallback after ${failure}`, async () => {
    const app = await handler(name, { apiKey: "test", fetch });
    assert.equal((await app.invoke()).response.status, 200);
    assert.equal(app.aiCalls(), 1);
  });
  test(`${name} preserves auth and missing-score errors; debug avoids AI and writes`, async () => {
    const unauthorized = await handler(name, { unauthorized: true });
    assert.equal((await unauthorized.invoke()).response.status, 401);
    assert.equal(unauthorized.writes.length, 0);
    const missing = await handler(name, { missingAsset: true });
    assert.equal((await missing.invoke()).response.status, 404);
    const debug = await handler(name);
    assert.ok((await debug.invoke({ debug: true })).data.prompt);
    assert.equal(debug.writes.length, 0);
  });
}
test("invalid recordings still return a real 400, without saving progress", async () => {
  const app = await handler("tune-evaluate");
  assert.equal((await app.invoke({ userSequence: { notes: "invalid" } })).response.status, 400);
  assert.equal(app.writes.length, 0);
});
test("AI timeout aborts the request and returns the fallback", async t => {
  t.mock.method(globalThis, "fetch", (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  }));
  // AbortSignal.timeout's timer is unref'ed; keep this mocked request alive until abort.
  const keepAlive = setTimeout(() => {}, 1_000);
  try {
    assert.equal(await withTuneAiFallback({ apiKey: "test", request: {}, toolName: "test", parse: () => "ai",
      fallback: () => "fallback", timeoutMs: 10 }), "fallback");
  } finally { clearTimeout(keepAlive); }
});
test("valid AI responses retain priority", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ choices: [{ message: { tool_calls: [{ function: {
    name: "test", arguments: JSON.stringify({ value: "AI result" }),
  } }] } }] }));
  assert.equal(await withTuneAiFallback({ apiKey: "test", request: {}, toolName: "test", parse: value => value.value,
    fallback: () => assert.fail("should use valid AI result") }), "AI result");
});
