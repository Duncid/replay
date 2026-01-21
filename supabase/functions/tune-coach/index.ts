import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TuneMotif {
  id: string;
  label: string;
  importance: "high" | "medium" | "low";
  description: string;
}

interface TuneNugget {
  id: string;
  label?: string;
  location: {
    startMeasure?: number;
    endMeasure?: number;
    startBeat?: number;
    endBeat?: number;
  };
  dependsOn: string[];
  modes?: string[];
  noteSequence?: unknown;
  leftHandSequence?: unknown;
  rightHandSequence?: unknown;
}

interface TuneAssembly {
  id: string;
  tier: number;
  label?: string;
  nuggetIds: string[];
  difficulty?: { level: number };
  modes?: string[];
  noteSequence?: unknown;
  leftHandSequence?: unknown;
  rightHandSequence?: unknown;
}

interface TuneFullTune {
  id: string;
  label: string;
  noteSequence?: unknown;
  leftHandSequence?: unknown;
  rightHandSequence?: unknown;
}

interface TuneHints {
  goal?: string;
  counting?: string;
  commonMistakes?: string[];
  whatToListenFor?: string[];
}

interface TuneBriefing {
  title: string;
  schemaVersion: string;
  motifs: TuneMotif[];
  tuneHints?: TuneHints;
  teachingOrder: string[];
  assemblyOrder?: string[];
}

interface NuggetState {
  nugget_id: string;
  attempt_count: number;
  pass_count: number;
  current_streak: number;
  best_streak: number;
  last_practiced_at: string | null;
}

interface PracticePlanItem {
  itemId: string;
  itemType: "nugget" | "assembly" | "full_tune";
  instruction: string;
  motifs: string[];
}

// Helper to extract measure range from nugget location
function getMeasureRange(n: TuneNugget): string {
  if (n.location?.startMeasure !== undefined) {
    return `${n.location.startMeasure}-${n.location.endMeasure || n.location.startMeasure}`;
  }
  return "unknown";
}


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tuneKey, localUserId = null, language = "en", debug = false } = await req.json();

    if (!tuneKey) {
      return new Response(JSON.stringify({ error: "tuneKey is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[tune-coach] Request - tuneKey: ${tuneKey}, user: ${localUserId}, debug: ${debug}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch tune asset from the latest PUBLISHED curriculum version
    // This ensures we use assets from a successfully published version, not failed/partial publishes
    const { data: tuneAsset, error: tuneError } = await supabase
      .from("tune_assets")
      .select(`
        *,
        curriculum_versions!inner (
          id,
          status,
          published_at
        )
      `)
      .eq("tune_key", tuneKey)
      .eq("curriculum_versions.status", "published")
      .order("curriculum_versions(published_at)", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tuneError || !tuneAsset) {
      console.error("Error fetching tune asset:", tuneError);
      // Fallback: try without version filter in case of migration issues
      const { data: fallbackAsset, error: fallbackError } = await supabase
        .from("tune_assets")
        .select("*")
        .eq("tune_key", tuneKey)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (fallbackError || !fallbackAsset) {
        return new Response(JSON.stringify({ error: "Tune not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.warn(`[tune-coach] Using fallback query for ${tuneKey} - no published version found`);
    }

    const briefing = tuneAsset.briefing as TuneBriefing;
    const nuggets = (tuneAsset.nuggets || []) as TuneNugget[];
    const assemblies = (tuneAsset.assemblies || []) as TuneAssembly[];
    const fullTune: TuneFullTune = {
      id: "FULL_TUNE",
      label: `${briefing.title} (full tune)`,
      noteSequence: tuneAsset.note_sequence,
      leftHandSequence: tuneAsset.left_hand_sequence || undefined,
      rightHandSequence: tuneAsset.right_hand_sequence || undefined,
    };
    const tuneHints = briefing?.tuneHints;

    console.log(
      `[tune-coach] Loaded tune: ${briefing.title}, ${nuggets.length} nuggets, ${assemblies.length} assemblies`,
    );

    // 2. Fetch user's nugget/assembly states for this tune
    let nuggetStatesQuery = supabase.from("tune_nugget_state").select("*").eq("tune_key", tuneKey);

    if (localUserId) {
      nuggetStatesQuery = nuggetStatesQuery.eq("local_user_id", localUserId);
    }

    const { data: nuggetStates, error: statesError } = await nuggetStatesQuery;

    if (statesError) {
      console.error("Error fetching nugget states:", statesError);
    }

    const statesMap = new Map<string, NuggetState>();
    for (const state of (nuggetStates || []) as NuggetState[]) {
      statesMap.set(state.nugget_id, state);
    }

    // ============================================
    // BUILD PRACTICE HISTORY (raw data for LLM to reason about)
    // ============================================
    const practiceHistory = nuggets.map((n) => {
      const state = statesMap.get(n.id);
      return {
        nuggetId: n.id,
        label: n.label || n.id,
        measureRange: getMeasureRange(n),
        dependsOn: n.dependsOn || [],
        attemptCount: state?.attempt_count || 0,
        passCount: state?.pass_count || 0,
        currentStreak: state?.current_streak || 0,
        bestStreak: state?.best_streak || 0,
        lastPracticedAt: state?.last_practiced_at || null,
      };
    });

    // Assembly history (raw data for LLM to reason about)
    const assemblyHistory = assemblies.map((a) => {
      const state = statesMap.get(a.id);
      return {
        assemblyId: a.id,
        label: a.label || a.id,
        tier: a.tier,
        nuggetIds: a.nuggetIds,
        attemptCount: state?.attempt_count || 0,
        passCount: state?.pass_count || 0,
        currentStreak: state?.current_streak || 0,
        bestStreak: state?.best_streak || 0,
        lastPracticedAt: state?.last_practiced_at || null,
      };
    });

    // Full tune history (raw data for LLM to reason about)
    const fullTuneState = statesMap.get("FULL_TUNE");
    const fullTuneHistory = {
      attemptCount: fullTuneState?.attempt_count || 0,
      passCount: fullTuneState?.pass_count || 0,
      currentStreak: fullTuneState?.current_streak || 0,
      bestStreak: fullTuneState?.best_streak || 0,
      lastPracticedAt: fullTuneState?.last_practiced_at || null,
    };

    // ============================================
    // BUILD SYSTEM PROMPT
    // ============================================

    // Motifs info section (raw data, no pass/fail flags)
    const motifsInfoText = (briefing.motifs || [])
      .map((m) => `- ${m.id} "${m.label}" [importance: ${m.importance}]: ${m.description}`)
      .join("\n");

    // Nugget history section (raw data)
    const nuggetHistoryText = practiceHistory
      .map(
        (h) => `- ${h.nuggetId} "${h.label}" (measures ${h.measureRange}) [motifs: ${h.dependsOn.join(", ") || "none"}]
    attempts: ${h.attemptCount}, passes: ${h.passCount}, streak: ${h.currentStreak}/${h.bestStreak}, last practiced: ${h.lastPracticedAt || "never"}`,
      )
      .join("\n");

    // Assembly history section (raw data)
    const assemblyHistoryText = assemblyHistory
      .map(
        (h) => `- ${h.assemblyId} "${h.label}" (Tier ${h.tier}, nuggets: ${h.nuggetIds.join("+")})
    attempts: ${h.attemptCount}, passes: ${h.passCount}, streak: ${h.currentStreak}/${h.bestStreak}, last practiced: ${h.lastPracticedAt || "never"}`,
      )
      .join("\n");

    // Full tune history section (raw data)
    const fullTuneHistoryText = `- FULL_TUNE "${fullTune.label}"
    attempts: ${fullTuneHistory.attemptCount}, passes: ${fullTuneHistory.passCount}, streak: ${fullTuneHistory.currentStreak}/${fullTuneHistory.bestStreak}, last practiced: ${fullTuneHistory.lastPracticedAt || "never"}`;

    const systemPrompt = `You are a piano teacher planning the next practice session for a student learning "${briefing.title}".

GOAL: Plan a growth path that moves this student from their current state (point A) toward playing the full tune (point B). The full tune is the ultimate destination - it's fine if the plan doesn't reach it, just plan in that direction.

PLAN LENGTH:
- For beginners (far from full tune): plan up to ~16 activities
- As the student approaches mastery: use fewer activities
- Near full tune: just a few focused activities
- The closer to the goal, the shorter the plan should be

---

## STUDENT CONTEXT

- ID: ${localUserId || "anonymous"}
- Language: ${language}
LANGUAGE INSTRUCTION:
- Respond in ${language}. Do not mix languages.
- Keep instructions and encouragement brief.

---

## TUNE OVERVIEW

Title: ${briefing.title}
Total nuggets: ${nuggets.length}
Total assemblies: ${assemblies.length}
Teaching order: ${briefing.teachingOrder?.join(" → ") || "not specified"}
Assembly order: ${briefing.assemblyOrder?.join(" → ") || "not specified"}

---

## TUNE-LEVEL HINTS

${tuneHints?.goal ? `Goal: ${tuneHints.goal}` : ""}
${tuneHints?.counting ? `Counting: ${tuneHints.counting}` : ""}
${tuneHints?.commonMistakes?.length ? `Common mistakes: ${tuneHints.commonMistakes.join("; ")}` : ""}
${tuneHints?.whatToListenFor?.length ? `Listen for: ${tuneHints.whatToListenFor.join("; ")}` : ""}

---

## MOTIFS (musical concepts in this piece)

${motifsInfoText || "No motifs defined"}

---

## AVAILABLE PRACTICE ITEMS

### Nuggets (small focused sections)
${nuggetHistoryText || "No nuggets defined"}

### Assemblies (combinations of nuggets at different tiers)
Tier 1 = small combos, Tier 2 = larger sections, Tier 3 = near full tune

${assemblyHistoryText || "No assemblies defined"}

### Full Tune
${fullTuneHistoryText}

---

## YOUR TASK

Based on this student's practice history, plan a logical growth path toward the full tune. Use your pedagogical judgment to decide:

- What foundations need strengthening
- When to introduce new challenges
- How to sequence activities for effective learning
- When the student is ready to attempt larger sections
- How many activities are appropriate given their current progress

Consider factors like:
- Recent failures (may need attention)
- Items never attempted (gaps in coverage)
- Low streaks on previously passed items (may need reinforcement)
- Time since last practice (memory decay)
- Logical musical progression through the piece

Use the submit_practice_plan function to return a structured practice plan.`;

    const userPrompt = `Create a practice plan that forms a growth path from this student's current abilities toward playing the full tune.

Plan length guidance:
- For beginners: plan up to ~16 activities
- As they approach mastery: fewer activities
- The closer to full tune, the shorter the plan

Use your pedagogical judgment about what activities will help them progress. Include brief, encouraging instructions for each item.

Use itemType "full_tune" with itemId "FULL_TUNE" when proposing full-tune practice.`;

    const composedPrompt = `SYSTEM:\n${systemPrompt}\n\nUSER:\n${userPrompt}`;

    const toolsDefinition = [
      {
        type: "function",
        function: {
          name: "submit_practice_plan",
          description: "Submit the practice plan with prioritized items (nuggets and assemblies)",
          parameters: {
            type: "object",
            properties: {
              practicePlan: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    itemId: {
                      type: "string",
                      description: "The nugget/assembly ID (e.g., N1, A2, B1) or FULL_TUNE for full-tune practice",
                    },
                    itemType: {
                      type: "string",
                      enum: ["nugget", "assembly", "full_tune"],
                      description: "Whether this is a nugget, assembly, or full tune",
                    },
                    instruction: {
                      type: "string",
                      description: "Brief instruction/goal for this item (1-2 sentences)",
                    },
                    motifs: { type: "array", items: { type: "string" }, description: "Motif IDs this item practices" },
                  },
                  required: ["itemId", "itemType", "instruction", "motifs"],
                },
                description: "Ordered list of practice items - target about 16 items early in learning, fewer if full tune is included or learner is near mastery",
              },
              encouragement: {
                type: "string",
                description: "Brief encouraging message for the student (1 sentence)",
              },
            },
            required: ["practicePlan", "encouragement"],
          },
        },
      },
    ];

    const debugRequest = {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: toolsDefinition,
      tool_choice: { type: "function", function: { name: "submit_practice_plan" } },
    };

    // Debug mode: return prompt without LLM call
    if (debug) {
      return new Response(
        JSON.stringify({
          request: debugRequest,
          prompt: composedPrompt,
          tuneTitle: briefing.title,
          motifsCount: briefing.motifs?.length || 0,
          nuggetsCount: nuggets.length,
          assembliesCount: assemblies.length,
          practiceHistory,
          assemblyHistory,
          fullTuneHistory,
          nuggets: nuggets.map((n) => ({
            id: n.id,
            label: n.label,
            noteSequence: n.noteSequence,
            dependsOn: n.dependsOn,
          })),
          fullTune,
          assemblies: assemblies.map((a) => ({
            id: a.id,
            tier: a.tier,
            label: a.label,
            nuggetIds: a.nuggetIds,
            noteSequence: a.noteSequence,
          })),
          motifsSummary: briefing.motifs || [],
          tuneHints,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 5. Call LLM
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const llmResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(debugRequest),
    });

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      console.error("LLM error:", llmResponse.status, errorText);
      throw new Error(`LLM call failed: ${llmResponse.status}`);
    }

    const llmData = await llmResponse.json();
    console.log("[tune-coach] LLM response received");

    // Parse tool call response
    const toolCall = llmData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== "submit_practice_plan") {
      throw new Error("Invalid LLM response structure");
    }

    const planResult = JSON.parse(toolCall.function.arguments) as {
      practicePlan: PracticePlanItem[];
      encouragement: string;
    };

    // Enrich practice plan with full nugget/assembly data
    const enrichedPlan = planResult.practicePlan
      .map((item) => {
        if (item.itemType === "nugget") {
          const nugget = nuggets.find((n) => n.id === item.itemId);
          return {
            itemId: item.itemId,
            itemType: item.itemType,
            nugget: nugget || null,
            assembly: null,
            fullTune: null,
            instruction: item.instruction,
            motifs: item.motifs,
          };
        }
        if (item.itemType === "assembly") {
          const assembly = assemblies.find((a) => a.id === item.itemId);
          return {
            itemId: item.itemId,
            itemType: item.itemType,
            nugget: null,
            assembly: assembly || null,
            fullTune: null,
            instruction: item.instruction,
            motifs: item.motifs,
          };
        }
        if (item.itemType === "full_tune") {
          return {
            itemId: item.itemId,
            itemType: item.itemType,
            nugget: null,
            assembly: null,
            fullTune,
            instruction: item.instruction,
            motifs: item.motifs,
          };
        }
        return null;
      })
      .filter((item) => item !== null);

    return new Response(
      JSON.stringify({
        practicePlan: enrichedPlan,
        encouragement: planResult.encouragement,
        tuneTitle: briefing.title,
        motifsSummary: briefing.motifs || [],
        tuneHints,
        practiceHistory,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[tune-coach] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
