import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface TuneAssetBundle {
  briefing?: {
    schemaVersion?: string;
    title?: string;
    pipelineSettings?: Record<string, unknown>;
    motifs?: unknown;
    motifOccurrences?: Array<Record<string, unknown>>;
    tuneHints?: unknown;
    teachingOrder?: string[];
    assemblyOrder?: string[];
  };
  nuggets?: Array<{
    id: string;
    label?: string;
    location?: Record<string, unknown>;
    dependsOn?: string[];
    modes?: string[];
    noteSequence?: object;
    leftHandSequence?: object;
    rightHandSequence?: object;
  }>;
  assemblies?: Array<{
    id: string;
    tier?: number;
    label?: string;
    nuggetIds?: string[];
    difficulty?: { level: number };
    modes?: string[];
    noteSequence?: object;
    leftHandSequence?: object;
    rightHandSequence?: object;
  }>;
  noteSequence: Record<string, unknown>;
  leftHandSequence?: Record<string, unknown>;
  rightHandSequence?: Record<string, unknown>;
  tuneXml?: string;
  nuggetXmls?: Record<string, string>;
  assemblyXmls?: Record<string, string>;
  tuneDspXml?: string;
  nuggetDspXmls?: Record<string, string>;
  assemblyDspXmls?: Record<string, string>;
}

interface TunePublishRequest {
  tuneKey: string;
  title?: string;
  tuneAssets: TuneAssetBundle;
  mode: "create" | "update";
  existingTuneKey?: string; // When mode is "update", this is the tune_key to update
}

interface TunePublishResponse {
  success: boolean;
  tuneKey?: string;
  versionId?: string;
  publishedAt?: string;
  error?: string;
}

// Reserved quest_graph for standalone tune publishing
const STANDALONE_QUEST_GRAPH_ID = "00000000-0000-0000-0000-000000000001";
const STANDALONE_QUEST_GRAPH_TITLE = "Standalone Tune Assets";

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body: TunePublishRequest = await req.json();
    const { tuneKey, title, tuneAssets, mode, existingTuneKey } = body;

    console.log(`[tune-publish] Request received:`, {
      tuneKey,
      title,
      mode,
      existingTuneKey,
      hasNoteSequence: !!tuneAssets?.noteSequence,
      noteCount: (tuneAssets?.noteSequence as { notes?: unknown[] })?.notes
        ?.length,
    });

    // Validation
    if (!tuneKey || !tuneAssets) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields: tuneKey and tuneAssets",
        } as TunePublishResponse),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!tuneAssets.noteSequence) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "tuneAssets.noteSequence is required",
        } as TunePublishResponse),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ensure standalone quest_graph exists
    const { data: existingGraph } = await supabase
      .from("quest_graphs")
      .select("id")
      .eq("id", STANDALONE_QUEST_GRAPH_ID)
      .maybeSingle();

    if (!existingGraph) {
      console.log("[tune-publish] Creating standalone quest_graph");
      const { error: graphError } = await supabase
        .from("quest_graphs")
        .insert({
          id: STANDALONE_QUEST_GRAPH_ID,
          title: STANDALONE_QUEST_GRAPH_TITLE,
          data: { nodes: [], edges: [] },
        });

      if (graphError) {
        console.error("[tune-publish] Failed to create quest_graph:", graphError);
        throw new Error("Failed to create standalone quest_graph");
      }
    }

    // Get or create a curriculum_version for standalone tunes
    let versionId: string;

    // Check for existing version
    const { data: existingVersion } = await supabase
      .from("curriculum_versions")
      .select("id")
      .eq("quest_graph_id", STANDALONE_QUEST_GRAPH_ID)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingVersion) {
      versionId = existingVersion.id;
      console.log("[tune-publish] Using existing standalone version:", versionId);
    } else {
      // Create new version
      const { data: newVersion, error: versionError } = await supabase
        .from("curriculum_versions")
        .insert({
          quest_graph_id: STANDALONE_QUEST_GRAPH_ID,
          title: STANDALONE_QUEST_GRAPH_TITLE,
          version_number: 1,
          status: "published",
          published_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (versionError || !newVersion) {
        console.error("[tune-publish] Failed to create version:", versionError);
        throw new Error("Failed to create curriculum version");
      }

      versionId = newVersion.id;
      console.log("[tune-publish] Created new standalone version:", versionId);
    }

    // Determine the final tune_key
    const finalTuneKey = mode === "update" && existingTuneKey 
      ? existingTuneKey 
      : tuneKey;

    // Check if tune already exists in this version
    const { data: existingTune } = await supabase
      .from("tune_assets")
      .select("id")
      .eq("version_id", versionId)
      .eq("tune_key", finalTuneKey)
      .maybeSingle();

    // Prepare the tune_assets record
    const tuneAssetsRecord = {
      version_id: versionId,
      tune_key: finalTuneKey,
      briefing: tuneAssets.briefing
        ? {
            ...tuneAssets.briefing,
            title: title || tuneAssets.briefing.title || finalTuneKey,
          }
        : { title: title || finalTuneKey },
      note_sequence: tuneAssets.noteSequence,
      left_hand_sequence: tuneAssets.leftHandSequence || null,
      right_hand_sequence: tuneAssets.rightHandSequence || null,
      nuggets: tuneAssets.nuggets || null,
      assemblies: tuneAssets.assemblies || null,
      tune_xml: tuneAssets.tuneXml || null,
      nugget_xmls: tuneAssets.nuggetXmls || null,
      assembly_xmls: tuneAssets.assemblyXmls || null,
      tune_dsp_xml: tuneAssets.tuneDspXml || null,
      nugget_dsp_xmls: tuneAssets.nuggetDspXmls || null,
      assembly_dsp_xmls: tuneAssets.assemblyDspXmls || null,
    };

    if (existingTune) {
      // Delete and re-insert (no UPDATE RLS policy)
      console.log("[tune-publish] Deleting existing tune_assets for update");
      const { error: deleteError } = await supabase
        .from("tune_assets")
        .delete()
        .eq("id", existingTune.id);

      if (deleteError) {
        console.error("[tune-publish] Failed to delete existing tune:", deleteError);
        throw new Error("Failed to update tune assets");
      }
    }

    // Insert the new/updated tune_assets
    const { error: insertError } = await supabase
      .from("tune_assets")
      .insert(tuneAssetsRecord);

    if (insertError) {
      console.error("[tune-publish] Failed to insert tune_assets:", insertError);
      throw new Error(`Failed to publish tune: ${insertError.message}`);
    }

    console.log(`[tune-publish] Successfully published tune: ${finalTuneKey}`, {
      versionId,
      nuggetCount: tuneAssets.nuggets?.length || 0,
      assemblyCount: tuneAssets.assemblies?.length || 0,
      hasXml: !!tuneAssets.tuneXml,
      hasDspXml: !!tuneAssets.tuneDspXml,
    });

    return new Response(
      JSON.stringify({
        success: true,
        tuneKey: finalTuneKey,
        versionId,
        publishedAt: new Date().toISOString(),
      } as TunePublishResponse),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[tune-publish] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      } as TunePublishResponse),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
