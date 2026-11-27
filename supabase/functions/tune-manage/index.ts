import { requireUser, authErrorResponse } from "../_shared/auth.ts";
import { canManageTune, canReplaceSystemTune, type TuneAction } from "../_shared/tune-rules.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const Body = z.object({
  action: z.enum(["rename", "delete", "promote", "demote", "replace-system"]),
  tuneKey: z.string().min(1).max(200),
  newTitle: z.string().trim().min(1).max(200).optional(),
  sourceTuneKey: z.string().min(1).max(200).optional(),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const COPY_FIELDS = ["note_sequence", "left_hand_sequence", "right_hand_sequence", "nuggets", "assemblies", "tune_xml",
  "tune_dsp_xml", "nugget_xmls", "nugget_dsp_xmls", "assembly_xmls", "assembly_dsp_xmls"] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { userId, admin: db } = await requireUser(req);
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ success: false, error: parsed.error.flatten().fieldErrors }, 400);
    const { action, tuneKey, newTitle, sourceTuneKey } = parsed.data;
    const { data: role } = await db.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    const isAdmin = !!role;

    const { data: rows, error: fetchError } = await db.from("tune_assets")
      .select("*, curriculum_versions(published_at)").eq("tune_key", tuneKey);
    if (fetchError) throw fetchError;
    if (!rows?.length) return json({ success: false, error: `Tune not found: ${tuneKey}` }, 404);
    // Every version of a tune shares owner and visibility.
    const tune = { owner_user_id: rows[0].owner_user_id, is_global: rows.some((r) => r.is_global) };
    if (!canManageTune(action as TuneAction, tune, userId, isAdmin)) {
      return json({ success: false, error: tune.is_global ? "Only admins can change Noodlyn tunes" : "This tune belongs to another account" }, 403);
    }

    if (action === "delete") {
      const { error } = await db.from("tune_assets").delete().eq("tune_key", tuneKey);
      if (error) throw error;
      await db.from("tune_list_positions").delete().eq("tune_key", tuneKey);
      await db.from("hidden_system_tunes").delete().eq("tune_key", tuneKey);
      return json({ success: true, deleted: rows.length });
    }

    if (action === "promote" || action === "demote") {
      const { error } = await db.from("tune_assets").update({ is_global: action === "promote" }).eq("tune_key", tuneKey);
      if (error) throw error;
      return json({ success: true });
    }

    if (action === "rename") {
      if (!newTitle) return json({ success: false, error: "newTitle is required for rename" }, 400);
      for (const row of rows) {
        const { error } = await db.from("tune_assets")
          .update({ briefing: { ...(row.briefing as object ?? {}), title: newTitle } }).eq("id", row.id);
        if (error) throw error;
      }
      return json({ success: true, updatedCount: rows.length });
    }

    // replace-system: the System tune keeps its key, title, composer and list places but plays the source's music.
    if (!sourceTuneKey) return json({ success: false, error: "sourceTuneKey is required" }, 400);
    const { data: sources, error: sourceError } = await db.from("tune_assets")
      .select("*, curriculum_versions(published_at)").eq("tune_key", sourceTuneKey);
    if (sourceError) throw sourceError;
    if (!sources?.length) return json({ success: false, error: `Tune not found: ${sourceTuneKey}` }, 404);
    if (!canReplaceSystemTune(tune, { owner_user_id: sources[0].owner_user_id, is_global: sources.some((s) => s.is_global) }, userId, isAdmin)) {
      return json({ success: false, error: "Pick a Noodlyn tune and a tune from your own library" }, 403);
    }
    const newest = <T extends { curriculum_versions: { published_at: string | null } | null }>(list: T[]) =>
      [...list].sort((a, b) => (b.curriculum_versions?.published_at ?? "").localeCompare(a.curriculum_versions?.published_at ?? ""))[0];
    const source = newest(sources), target = newest(rows);
    const update: Record<string, unknown> = {};
    for (const f of COPY_FIELDS) update[f] = source[f];
    const { error } = await db.from("tune_assets").update(update).eq("id", target.id);
    if (error) throw error;
    return json({ success: true });
  } catch (error) {
    const authRes = authErrorResponse(error, corsHeaders);
    if (authRes) return authRes;
    console.error("[tune-manage] Error:", error);
    return json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
