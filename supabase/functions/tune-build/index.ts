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
  const nuggets = plan?.nuggets;
  if (!Array.isArray(nuggets) || !nuggets.length) throw new Error("plan has no nuggets");
  const ids = new Set<string>();
  // Measure numbers can skip (pickups, repeats); only reject locations outside the score.
  const nums = analysis.measures.map((m) => m.measure);
  const first = Math.min(...nums), last = Math.max(...nums);
  for (const n of nuggets) {
    const l = n?.location;
    if (typeof n?.id !== "string" || !l || ![l.startMeasure, l.startBeat, l.endMeasure, l.endBeat].every((v) => typeof v === "number"))
      throw new Error("nugget missing id or location");
    if (l.startMeasure < first || l.endMeasure > last + 1 || l.endMeasure < l.startMeasure)
      throw new Error(`nugget ${n.id} is outside the score (measures ${l.startMeasure}-${l.endMeasure} of ${first}-${last})`);
    ids.add(n.id);
  }
  const assemblies = Array.isArray(plan.assemblies) ? plan.assemblies : [];
  for (const a of assemblies) {
    if (!Array.isArray(a?.nuggetIds) || !a.nuggetIds.every((id: string) => ids.has(id))) throw new Error(`assembly ${a?.id} references unknown nuggets`);
  }
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

    let job: { id: string; source_path: string; filename: string; title: string | null };
    if (parsed.data.action === "start") {
      const d = parsed.data;
      const { data, error } = await admin.from("tune_build_jobs").insert({
        created_by: userId, source_path: d.sourcePath, filename: d.filename, tune_key: d.tuneKey, title: d.title ?? null,
      }).select("id, source_path, filename, title").single();
      if (error) throw error;
      job = data;
    } else {
      const { data, error } = await admin.from("tune_build_jobs").select("id, source_path, filename, title").eq("id", parsed.data.jobId).single();
      if (error || !data) return json({ error: "Job not found" }, 404);
      job = data;
    }

    await admin.from("tune_build_jobs").update({ status: "running", error: null }).eq("id", job.id);
    const { data: signed, error: signErr } = await admin.storage.from("tune-sources").createSignedUrl(job.source_path, 900);
    if (signErr || !signed) {
      await admin.from("tune_build_jobs").update({ status: "failed", error: "Uploaded file not found" }).eq("id", job.id);
      return json({ jobId: job.id, status: "failed", error: "Uploaded file not found" });
    }

    // The AI plan can take minutes: answer now, finish in the background; the UI polls tune_build_jobs.
    const run = async () => {
    const base = { fileUrl: signed.signedUrl, filename: job.filename, title: job.title };
    let status = "failed", errorMsg: string | null = null, result: Record<string, unknown> | null = null;
    try {
      // 1. Worker extracts a compact note/measure view of the score.
      const prep = await callWorker(workerUrl, workerSecret, { ...base, action: "prepare" }, 60_000);
      // 2. TuneMaster (LLM) plans nuggets + assemblies; fall back to the pipeline heuristic on failure.
      let teacher: Record<string, unknown> | null = null, planNote: string | null = null;
      try {
        teacher = await planWithTuneMaster(prep.analysis, job.title ?? job.filename);
      } catch (e) {
        planNote = `TuneMaster plan unavailable, used automatic split: ${e instanceof Error ? e.message : e}`;
        console.error(planNote);
      }
      // 3. Worker slices the score with that plan.
      let built;
      try {
        built = await callWorker(workerUrl, workerSecret, { ...base, action: "build", teacher }, 140_000);
      } catch (e) {
        if (!teacher) throw e;
        planNote = `TuneMaster plan could not be built, used automatic split: ${e instanceof Error ? e.message : e}`;
        console.error(planNote);
        built = await callWorker(workerUrl, workerSecret, { ...base, action: "build" }, 140_000);
        teacher = null;
      }
      result = built.bundle;
      (result!.briefing as Record<string, unknown>).planner = teacher ? "tunemaster" : "heuristic";
      status = "succeeded";
      errorMsg = planNote;
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : "Builder unreachable";
    }
    await admin.from("tune_build_jobs").update({ status, error: errorMsg, result }).eq("id", job.id);
    };
    // @ts-ignore EdgeRuntime is provided by the edge runtime
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(run()); else await run();
    return json({ jobId: job.id, status: "running" });
  } catch (err) {
    return authErrorResponse(err, corsHeaders) ?? json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
