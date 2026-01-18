import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface TuneMotif {
  id: string;
  label: string;
  importance: number;
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

interface TuneHints {
  goal?: string;
  counting?: string;
  commonMistakes?: string[];
  whatToListenFor?: string[];
}

// Helper to extract measure range from nugget location
function getMeasureRange(n: TuneNugget): string {
  if (n.location.startMeasure !== undefined) {
    return `${n.location.startMeasure}-${n.location.endMeasure || n.location.startMeasure}`;
  }
  return "unknown";
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
  itemType: "nugget" | "assembly";
  instruction: string;
  motifs: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      tuneKey,
      localUserId = null,
      language = "en",
      debug = false,
    } = await req.json();

    if (!tuneKey) {
      return new Response(
        JSON.stringify({ error: "tuneKey is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[tune-coach] Request - tuneKey: ${tuneKey}, user: ${localUserId}, debug: ${debug}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch tune asset
    const { data: tuneAsset, error: tuneError } = await supabase
      .from("tune_assets")
      .select("*")
      .eq("tune_key", tuneKey)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tuneError || !tuneAsset) {
      console.error("Error fetching tune asset:", tuneError);
      return new Response(
        JSON.stringify({ error: "Tune not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const briefing = tuneAsset.briefing as TuneBriefing;
    const nuggets = (tuneAsset.nuggets || []) as TuneNugget[];
    const assemblies = (tuneAsset.assemblies || []) as TuneAssembly[];
    const tuneHints = briefing?.tuneHints;

    console.log(`[tune-coach] Loaded tune: ${briefing.title}, ${nuggets.length} nuggets, ${assemblies.length} assemblies`);

    // 2. Fetch user's nugget states for this tune
    let nuggetStatesQuery = supabase
      .from("tune_nugget_state")
      .select("*")
      .eq("tune_key", tuneKey);

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

    // 3. Build practice history
    const practiceHistory = nuggets.map((n) => {
      const state = statesMap.get(n.id);
      return {
        nuggetId: n.id,
        attemptCount: state?.attempt_count || 0,
        passCount: state?.pass_count || 0,
        currentStreak: state?.current_streak || 0,
        bestStreak: state?.best_streak || 0,
        lastPracticedAt: state?.last_practiced_at || null,
      };
    });

    // Calculate overall proficiency metrics
    const totalNuggets = nuggets.length;
    const nuggetsWithStreak3Plus = practiceHistory.filter(h => h.currentStreak >= 3).length;
    const nuggetsWithStreak2Plus = practiceHistory.filter(h => h.currentStreak >= 2).length;
    const averageStreak = practiceHistory.reduce((sum, h) => sum + h.currentStreak, 0) / Math.max(totalNuggets, 1);
    
    const proficiencyLevel = nuggetsWithStreak3Plus >= totalNuggets * 0.7 ? "advanced" :
                            nuggetsWithStreak2Plus >= totalNuggets * 0.5 ? "intermediate" : "beginner";

    // 4. Build LLM prompt
    const systemPrompt = `You are a piano practice coach. Your job is to create a personalized practice plan for a student working on "${briefing.title}".

STUDENT CONTEXT:
${localUserId ? `- Student ID: ${localUserId}` : "- New student (no ID)"}
- Language preference: ${language}
- Proficiency level: ${proficiencyLevel}
- Average nugget streak: ${averageStreak.toFixed(1)}
- Nuggets mastered (streak 3+): ${nuggetsWithStreak3Plus}/${totalNuggets}

TUNE OVERVIEW:
- Title: ${briefing.title}
- Total nuggets: ${nuggets.length}
- Total assemblies: ${assemblies.length}
- Teaching order (nuggets): ${briefing.teachingOrder?.join(", ") || "N1, N2, N3..."}
- Assembly order: ${briefing.assemblyOrder?.join(", ") || "A1, A2, B1..."}

TUNE-LEVEL HINTS:
- Goal: ${tuneHints?.goal || "Practice this piece with musicality"}
- Counting: ${tuneHints?.counting || "Standard counting"}
- Common Mistakes: ${tuneHints?.commonMistakes?.join("; ") || "None specified"}
- What to Listen For: ${tuneHints?.whatToListenFor?.join("; ") || "None specified"}

MOTIFS IN THIS TUNE:
${(briefing.motifs || []).map((m) => `- ${m.id} (${m.label}): ${m.description} [Importance: ${m.importance}]`).join("\n")}

AVAILABLE NUGGETS:
${nuggets.map((n) => {
  const state = statesMap.get(n.id);
  const motifLabels = n.dependsOn?.join(", ") || "none";
  const measureRange = getMeasureRange(n);
  return `- ${n.id} "${n.label || n.id}" (measures ${measureRange})
    Motifs: [${motifLabels}], Modes: ${n.modes?.join(", ") || "all"}
    Practice history: ${state ? `${state.attempt_count} attempts, ${state.pass_count} passes, streak: ${state.current_streak}` : "Never practiced"}`;
}).join("\n")}

AVAILABLE ASSEMBLIES (groupings of nuggets for progressive practice):
${assemblies.map((a) => {
  // Calculate average streak for nuggets in this assembly
  const assemblyNuggetStreaks = a.nuggetIds.map(nId => statesMap.get(nId)?.current_streak || 0);
  const avgAssemblyStreak = assemblyNuggetStreaks.reduce((sum, s) => sum + s, 0) / Math.max(assemblyNuggetStreaks.length, 1);
  const allMastered = assemblyNuggetStreaks.every(s => s >= 3);
  
  return `- ${a.id} "${a.label || a.id}" (tier ${a.tier}, difficulty ${a.difficulty?.level || 1})
    Groups: [${a.nuggetIds.join(", ")}]
    Modes: ${a.modes?.join(", ") || "HandsTogether"}
    Readiness: avg nugget streak ${avgAssemblyStreak.toFixed(1)}, ${allMastered ? "all nuggets mastered ✓" : "still building"}`;
}).join("\n")}

## Practice Plan Guidelines

Create a prioritized list of 4-6 items mixing NUGGETS and ASSEMBLIES.

**Progression Strategy:**

1. **For beginners** (proficiency: beginner):
   - Focus primarily on individual nuggets first
   - After a student masters 2-3 sequential nuggets (streak 3+), introduce the tier-1 assembly that groups them
   - Pattern: Nugget → Nugget → Assembly (grouping those nuggets)
   
2. **For intermediate** (proficiency: intermediate):
   - Alternate between nuggets needing work and assemblies for reinforcement
   - Use tier-1 and tier-2 assemblies to practice transitions
   - Pattern: Nugget → Assembly → Nugget → Assembly
   
3. **For advanced** (proficiency: advanced):
   - Focus primarily on assemblies, especially tier-2 and tier-3
   - Only return to individual nuggets if specific weak spots remain
   - Grow assembly size progressively: tier-1 → tier-2 → tier-3
   - Pattern: Assembly → Assembly → (weak Nugget if any) → Assembly

**Sequencing Rules:**
1. PREFER sequential nuggets (e.g., N1 then N2) for musical flow
2. AVOID consecutive items with the same primary motif for variety
3. When suggesting an assembly, ensure its component nuggets have some practice history
4. Follow teachingOrder for nuggets and assemblyOrder for assemblies as general guides

RESPONSE:
Return a practice plan with 4-6 items (mix of nuggets and assemblies) and an encouraging message.`;

    const userPrompt = `Create a practice plan for this ${proficiencyLevel} student based on their history and the progression strategy above.`;

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
                    itemId: { type: "string", description: "The nugget or assembly ID (e.g., N1, A2, B1)" },
                    itemType: { type: "string", enum: ["nugget", "assembly"], description: "Whether this is a nugget or assembly" },
                    instruction: { type: "string", description: "Brief instruction/goal for this item" },
                    motifs: { type: "array", items: { type: "string" }, description: "Motif IDs this item teaches" },
                  },
                  required: ["itemId", "itemType", "instruction", "motifs"],
                },
                description: "Ordered list of 4-6 items (nuggets and/or assemblies) to practice",
              },
              encouragement: {
                type: "string",
                description: "Brief encouraging message for the student (1-2 sentences)",
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
          proficiencyLevel,
          practiceHistory,
          nuggets: nuggets.map((n) => ({
            id: n.id,
            label: n.label,
            noteSequence: n.noteSequence,
            dependsOn: n.dependsOn,
          })),
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
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
    const enrichedPlan = planResult.practicePlan.map((item) => {
      if (item.itemType === "nugget") {
        const nugget = nuggets.find((n) => n.id === item.itemId);
        return {
          itemId: item.itemId,
          itemType: item.itemType,
          nugget: nugget || null,
          assembly: null,
          instruction: item.instruction,
          motifs: item.motifs,
        };
      } else {
        const assembly = assemblies.find((a) => a.id === item.itemId);
        return {
          itemId: item.itemId,
          itemType: item.itemType,
          nugget: null,
          assembly: assembly || null,
          instruction: item.instruction,
          motifs: item.motifs,
        };
      }
    }).filter((item) => item.nugget !== null || item.assembly !== null);

    return new Response(
      JSON.stringify({
        practicePlan: enrichedPlan,
        encouragement: planResult.encouragement,
        tuneTitle: briefing.title,
        motifsSummary: briefing.motifs || [],
        tuneHints,
        practiceHistory,
        proficiencyLevel,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[tune-coach] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
