import { requireAdmin, authErrorResponse } from "../_shared/auth.ts";
import { z } from "npm:zod@3";
import { generateChatCompletion, GatewayError } from "npm:@lovable.dev/ai-gateway@0.1.13";
import { TUNE_MASTER_PROMPT } from "./tuneMaster.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const Body = z.union([
  z.object({
    action: z.literal("start"),
    sourcePath: z.string().min(1).max(300).regex(/^[\w\-./]+$/),
    filename: z.string().min(1).max(200).regex(/\.(mxl|xml|musicxml)$/i, "Use a MusicXML file (.mxl or .xml)"),
    tuneKey: z.string().min(1).max(80).regex(/^[a-z0-9][a-z0-9-]*$/, "Key: lowercase letters, numbers and dashes"),
    title: z.string().max(120).optional(),
  }),
  z.object({ action: z.literal("retry"), jobId: z.string().uuid() }),
]);

async function sign(secret: string, ts: string, raw: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}.${raw}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function callWorker(url: string, secret: string, body: unknown, timeoutMs: number) {
  const raw = JSON.stringify(body);
  const ts = Math.floor(Date.now() / 1000).toString();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-timestamp": ts, "x-signature": await sign(secret, ts, raw) },
    body: raw,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload.error) throw new Error(payload.error ?? `Builder error (${res.status})${payload.detail ? ": " + JSON.stringify(payload.detail).slice(0, 200) : ""}`);
  return payload;
}

type Analysis = { measures: { measure: number; startTime: number; beats: number }[]; instruments: { id: string; notes: number[][] }[] };

async function planWithTuneMaster(analysis: Analysis, title: string) {
  const input = [
    `Title: ${title}`,
    "The ns.json is given in compact form to save space:",
    "- measures: [{measure, startTime (seconds), beats}] — use these to express locations as measure/beat (endBeat = beats+1 means end of measure).",
    "- instruments: [{id, notes: [[pitch, startTime, endTime], ...]}] — use these ids in instrumentPlans and instrumentToHand (higher register = RH).",
    JSON.stringify(analysis),
  ].join("\n");
  let completion;
  try {
    completion = await generateChatCompletion({
      model: "openai/gpt-6.2-sol",
      messages: [{ role: "system", content: TUNE_MASTER_PROMPT }, { role: "user", content: input }],
      response_format: { type: "json_object" },
    });
  } catch (e) {
    if (e instanceof GatewayError) throw new Error(`AI ${e.code}`);
    throw e;
  }
  const text = String(completion.choices?.[0]?.message?.content ?? "").replace(/^```(?:json)?\s*|\s*```$/g, "");
  return checkPlan(JSON.parse(text), analysis);
}

function checkPlan(plan: Record<string, any>, analysis: Analysis) {
  if (!Array.isArray(plan?.nuggets) || !plan.nuggets.length) throw new Error("plan has no nuggets");
  // Measure numbers can skip (pickups, repeats). Nuggets past the end are dropped and
  // overhanging ones trimmed to the last measure, rather than discarding the whole plan.
  const nums = analysis.measures.map((m) => m.measure);
  const first = Math.min(...nums), last = Math.max(...nums);
  const beatsOf = (m: number) => analysis.measures.find((x) => x.measure === m)?.beats ?? 4;
  const nuggets: any[] = [];
  for (const n of plan.nuggets) {
    const l = n?.location;
    if (typeof n?.id !== "string" || !l || ![l.startMeasure, l.startBeat, l.endMeasure, l.endBeat].every((v) => typeof v === "number"))
      throw new Error("nugget missing id or location");
    if (l.startMeasure > last || l.endMeasure < first) continue;
    if (l.startMeasure < first) Object.assign(l, { startMeasure: first, startBeat: 1 });
    if (l.endMeasure > last) Object.assign(l, { endMeasure: last, endBeat: beatsOf(last) + 1 });
    nuggets.push(n);
  }
  if (!nuggets.length) throw new Error("no nugget falls inside the score");
  const ids = new Set(nuggets.map((n) => n.id));
  const assemblies = (Array.isArray(plan.assemblies) ? plan.assemblies : [])
    .filter((a: any) => Array.isArray(a?.nuggetIds) && a.nuggetIds.length && a.nuggetIds.every((id: string) => ids.has(id)));
  const keepIds = (list: unknown) => Array.isArray(list) ? list.filter((id) => ids.has(id as string) || assemblies.some((a: any) => a.id === id)) : list;
  plan = { ...plan, nuggets, teachingOrder: keepIds(plan.teachingOrder), assemblyOrder: keepIds(plan.assemblyOrder) };
  const instIds = analysis.instruments.map((i) => i.id);
  const map = plan.pipelineSettings?.handAssignmentPolicy?.instrumentToHand ?? {};
  if (!instIds.every((id) => map[id] === "RH" || map[id] === "LH")) {
    plan.pipelineSettings = { ...(plan.pipelineSettings ?? {}), handAssignmentPolicy: {
      mode: "byInstrument",
      instrumentToHand: Object.fromEntries(instIds.map((id, i) => [id, i === 0 ? "RH" : "LH"])),
    } };
  }
  return { ...plan, schemaVersion: "teacher.v2", assemblies };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { userId, admin } = await requireAdmin(req);
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);

    const workerUrl = Deno.env.get("TUNE_WORKER_URL");
    const workerSecret = Deno.env.get("TUNE_WORKER_SECRET");
    if (!workerUrl || !workerSecret) return json({ error: "Tune builder is not connected yet" }, 503);

    let job: { id: string; source_path: string; filename: string; title: string | null; tune_key: string };
    if (parsed.data.action === "start") {
      const d = parsed.data;
      const { data, error } = await admin.from("tune_build_jobs").insert({
        created_by: userId, source_path: d.sourcePath, filename: d.filename, tune_key: d.tuneKey, title: d.title ?? null,
      }).select("id, source_path, filename, title, tune_key").single();
      if (error) throw error;
      job = data;
      // Only successful uploads are kept in the history.
      await admin.from("tune_build_jobs").delete().eq("created_by", userId).eq("status", "failed");
    } else {
      const { data, error } = await admin.from("tune_build_jobs").select("id, source_path, filename, title, tune_key").eq("id", parsed.data.jobId).single();
      if (error || !data) return json({ error: "Job not found" }, 404);
      job = data;
    }

    await admin.from("tune_build_jobs").update({ status: "running", error: null, progress: [] }).eq("id", job.id);
    const { data: signed, error: signErr } = await admin.storage.from("tune-sources").createSignedUrl(job.source_path, 900);
    if (signErr || !signed) {
      await admin.from("tune_build_jobs").update({ status: "failed", error: "Uploaded file not found" }).eq("id", job.id);
      return json({ jobId: job.id, status: "failed", error: "Uploaded file not found" });
    }

    // The AI plan can take minutes: answer now, finish in the background; the UI polls tune_build_jobs.
    const run = async () => {
    const base = { fileUrl: signed.signedUrl, filename: job.filename, title: job.title };
    // Progress log read by the upload dialog: each step is running → done | failed | skipped.
    type Step = { key: string; label: string; state: string; detail?: string; startedAt: string; endedAt?: string };
    const steps: Step[] = [];
    const save = (extra: Record<string, unknown> = {}) =>
      admin.from("tune_build_jobs").update({ progress: steps, ...extra }).eq("id", job.id);
    const begin = async (key: string, label: string) => {
      steps.push({ key, label, state: "running", startedAt: new Date().toISOString() });
      await save();
    };
    const end = async (state: string, detail?: string) => {
      const s = steps[steps.length - 1];
      Object.assign(s, { state, detail, endedAt: new Date().toISOString() });
      await save();
    };
    const secs = (s: Step) => Math.round((Date.now() - Date.parse(s.startedAt)) / 1000);
    try {
      await begin("read", "Reading the score");
      const prep = await callWorker(workerUrl, workerSecret, { ...base, action: "prepare" }, 60_000);
      const a = prep.analysis as Analysis;
      const noteCount = a.instruments.reduce((n, i) => n + i.notes.length, 0);
      await end("done", `${a.measures.length} measures · ${noteCount} notes · ${a.instruments.length} hand${a.instruments.length > 1 ? "s" : ""}`);

      await begin("plan", "TuneMaster is planning nuggets & assemblies");
      let teacher: Record<string, any> | null = null, note: string | null = null;
      try {
        teacher = await planWithTuneMaster(a, job.title ?? job.filename);
        await end("done", `${teacher.nuggets.length} nuggets · ${teacher.assemblies.length} assemblies · ${secs(steps[steps.length - 1])}s`);
      } catch (e) {
        note = `TuneMaster plan unavailable, used automatic split: ${e instanceof Error ? e.message : e}`;
        console.error(note);
        await end("failed", `${e instanceof Error ? e.message : e} — using automatic split`);
      }

      await begin("cut", "Cutting notes, sheets and hand parts");
      let built;
      try {
        built = await callWorker(workerUrl, workerSecret, { ...base, action: "build", teacher }, 140_000);
      } catch (e) {
        if (!teacher) throw e;
        note = `TuneMaster plan could not be built, used automatic split: ${e instanceof Error ? e.message : e}`;
        console.error(note);
        await end("failed", `Plan could not be built (${e instanceof Error ? e.message : e})`);
        await begin("cut", "Cutting with the automatic split");
        built = await callWorker(workerUrl, workerSecret, { ...base, action: "build" }, 140_000);
        teacher = null;
      }
      const result = built.bundle as Record<string, any>;
      result.briefing.planner = teacher ? "tunemaster" : "heuristic";
      await end("done", `${result.nuggets?.length ?? 0} nuggets · ${result.assemblies?.length ?? 0} assemblies`);
      await begin("publish", "Adding to your tunes");
      const { data: existing } = await admin.from("tune_assets").select("tune_key").eq("tune_key", job.tune_key).limit(1);
      const isUpdate = !!existing?.length;
      const pub = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/tune-publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: req.headers.get("Authorization") ?? "", apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "" },
        body: JSON.stringify({ tuneKey: job.tune_key, title: job.title ?? job.tune_key, tuneAssets: result, mode: isUpdate ? "update" : "create",
          existingTuneKey: isUpdate ? job.tune_key : undefined, isGlobal: isUpdate ? undefined : false }),
      }).then((r) => r.json()).catch((e) => ({ success: false, error: String(e) }));
      if (!pub?.success) throw new Error(`Could not add the tune: ${pub?.error ?? "publish failed"}`);
      await end("done", isUpdate ? "Updated the existing tune" : "Added to your account's tunes");
      await save({ status: "succeeded", error: note, result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Builder unreachable";
      if (steps.length && steps[steps.length - 1].state === "running") await end("failed", msg);
      await save({ status: "failed", error: msg });
    }
    };
    // @ts-ignore EdgeRuntime is provided by the edge runtime
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(run()); else await run();
    return json({ jobId: job.id, status: "running" });
  } catch (err) {
    return authErrorResponse(err, corsHeaders) ?? json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
