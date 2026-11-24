import { requireAdmin, authErrorResponse } from "../_shared/auth.ts";
import { z } from "npm:zod@3";

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
    const { data: signed, error: signErr } = await admin.storage.from("tune-sources").createSignedUrl(job.source_path, 300);
    if (signErr || !signed) {
      await admin.from("tune_build_jobs").update({ status: "failed", error: "Uploaded file not found" }).eq("id", job.id);
      return json({ jobId: job.id, status: "failed", error: "Uploaded file not found" });
    }

    const raw = JSON.stringify({ fileUrl: signed.signedUrl, filename: job.filename, title: job.title });
    const ts = Math.floor(Date.now() / 1000).toString();
    let status = "failed", errorMsg: string | null = null, result: unknown = null;
    try {
      const res = await fetch(workerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-timestamp": ts, "x-signature": await sign(workerSecret, ts, raw) },
        body: raw,
        signal: AbortSignal.timeout(140_000),
      });
      const payload = await res.json().catch(() => ({}));
      if (res.ok && payload.bundle) { status = "succeeded"; result = payload.bundle; }
      else errorMsg = payload.error ?? `Builder error (${res.status})`;
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : "Builder unreachable";
    }
    await admin.from("tune_build_jobs").update({ status, error: errorMsg, result }).eq("id", job.id);
    return json({ jobId: job.id, status, error: errorMsg });
  } catch (err) {
    return authErrorResponse(err, corsHeaders) ?? json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
