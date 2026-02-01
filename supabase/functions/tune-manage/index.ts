import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TuneManageRequest {
  action: "rename" | "delete";
  tuneKey: string;
  newTitle?: string; // For rename action
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { action, tuneKey, newTitle } = (await req.json()) as TuneManageRequest;

    console.log(`[tune-manage] Action: ${action}, tuneKey: ${tuneKey}`);

    if (!tuneKey) {
      return new Response(
        JSON.stringify({ success: false, error: "tuneKey is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (action === "delete") {
      // Delete all tune_assets with this tune_key
      const { error, count } = await supabase
        .from("tune_assets")
        .delete()
        .eq("tune_key", tuneKey);

      if (error) {
        console.error("[tune-manage] Delete error:", error);
        throw error;
      }

      console.log(`[tune-manage] Deleted ${count ?? "?"} records for tuneKey: ${tuneKey}`);

      return new Response(
        JSON.stringify({ success: true, deleted: count }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (action === "rename") {
      if (!newTitle?.trim()) {
        return new Response(
          JSON.stringify({ success: false, error: "newTitle is required for rename" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Get ALL tune records with this tune_key (there may be multiple versions)
      const { data: existingRecords, error: fetchError } = await supabase
        .from("tune_assets")
        .select("*")
        .eq("tune_key", tuneKey);

      if (fetchError) {
        console.error("[tune-manage] Fetch error:", fetchError);
        throw new Error(`Tune not found: ${tuneKey}`);
      }

      if (!existingRecords || existingRecords.length === 0) {
        throw new Error(`Tune not found: ${tuneKey}`);
      }

      console.log(`[tune-manage] Found ${existingRecords.length} records for tuneKey: ${tuneKey}`);

      // Since there's no UPDATE RLS policy, we delete and re-insert ALL records
      // Delete all records with this tune_key
      const { error: deleteError } = await supabase
        .from("tune_assets")
        .delete()
        .eq("tune_key", tuneKey);

      if (deleteError) {
        console.error("[tune-manage] Delete for rename error:", deleteError);
        throw deleteError;
      }

      // Re-insert all records with updated briefing title
      const recordsToInsert = existingRecords.map(existing => {
        const updatedBriefing = {
          ...(existing.briefing as object || {}),
          title: newTitle.trim(),
        };
        return {
          version_id: existing.version_id,
          tune_key: existing.tune_key,
          briefing: updatedBriefing,
          note_sequence: existing.note_sequence,
          left_hand_sequence: existing.left_hand_sequence,
          right_hand_sequence: existing.right_hand_sequence,
          nuggets: existing.nuggets,
          assemblies: existing.assemblies,
          tune_xml: existing.tune_xml,
          tune_dsp_xml: existing.tune_dsp_xml,
          nugget_xmls: existing.nugget_xmls,
          nugget_dsp_xmls: existing.nugget_dsp_xmls,
          assembly_xmls: existing.assembly_xmls,
          assembly_dsp_xmls: existing.assembly_dsp_xmls,
        };
      });

      const { error: insertError } = await supabase
        .from("tune_assets")
        .insert(recordsToInsert);

      if (insertError) {
        console.error("[tune-manage] Insert for rename error:", insertError);
        throw insertError;
      }

      console.log(`[tune-manage] Renamed ${existingRecords.length} records for tuneKey: ${tuneKey} to title: ${newTitle.trim()}`);

      return new Response(
        JSON.stringify({ success: true, updatedCount: existingRecords.length }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[tune-manage] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
