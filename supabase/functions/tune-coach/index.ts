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
  itemType: "nugget" | "assembly";
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

// Helper: Convert importance string to numeric value
function importanceToValue(importance: string): number {
  switch (importance) {
    case "high": return 1.0;
    case "medium": return 0.6;
    case "low": return 0.3;
    default: return 0.5;
  }
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

    // 2. Fetch user's nugget/assembly states for this tune
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

    // ============================================
    // COMPUTE MOTIF PASS STATUS
    // ============================================
    const motifStatus = new Map<string, {
      id: string;
      label: string;
      importance: number;
      totalNuggets: number;
      passedNuggets: number;
      avgStreak: number;
      isPassed: boolean;
    }>();

    for (const motif of briefing.motifs || []) {
      const containingNuggets = nuggets.filter((n) => n.dependsOn?.includes(motif.id));
      const passedCount = containingNuggets.filter((n) => {
        const state = statesMap.get(n.id);
        return state && state.current_streak >= 2; // 2+ streak = "passed"
      }).length;

      const totalStreaks = containingNuggets.reduce((sum, n) => {
        return sum + (statesMap.get(n.id)?.current_streak || 0);
      }, 0);
      const avgStreak = totalStreaks / Math.max(containingNuggets.length, 1);

      const importanceValue = importanceToValue(motif.importance);
      // High importance motifs need 70%+ pass rate, others 50%+
      const threshold = importanceValue >= 0.8 ? 0.7 : 0.5;
      const passRate = passedCount / Math.max(containingNuggets.length, 1);
      const isPassed = passRate >= threshold;

      motifStatus.set(motif.id, {
        id: motif.id,
        label: motif.label,
        importance: importanceValue,
        totalNuggets: containingNuggets.length,
        passedNuggets: passedCount,
        avgStreak,
        isPassed,
      });
    }

    // ============================================
    // COMPUTE ASSEMBLY READINESS
    // ============================================
    const assemblyReadiness = assemblies.map((a) => {
      // Get motifs required by this assembly's nuggets
      const requiredMotifs = new Set<string>();
      for (const nId of a.nuggetIds) {
        const nugget = nuggets.find((n) => n.id === nId);
        nugget?.dependsOn?.forEach((m) => requiredMotifs.add(m));
      }

      // Check if all required motifs are passed
      const allMotifsReady = [...requiredMotifs].every(
        (m) => motifStatus.get(m)?.isPassed ?? true // if no motif data, assume ready
      );

      // Check component nugget stability
      const nuggetStreaks = a.nuggetIds.map(
        (nId) => statesMap.get(nId)?.current_streak || 0
      );
      const avgNuggetStreak =
        nuggetStreaks.reduce((sum, s) => sum + s, 0) /
        Math.max(nuggetStreaks.length, 1);
      const allNuggetsStable = nuggetStreaks.every((s) => s >= 2);

      // Check own assembly streak
      const ownState = statesMap.get(a.id);
      const ownStreak = ownState?.current_streak || 0;

      // For Tier 2+, check if lower tier assemblies in same span are stable
      let lowerTierReady = true;
      if (a.tier >= 2) {
        const lowerTierAssemblies = assemblies.filter(
          (other) =>
            other.tier === a.tier - 1 &&
            a.nuggetIds.some((nId) => other.nuggetIds.includes(nId))
        );
        lowerTierReady = lowerTierAssemblies.every((lower) => {
          const lowerState = statesMap.get(lower.id);
          return lowerState && lowerState.current_streak >= 2;
        });
      }

      return {
        id: a.id,
        tier: a.tier,
        label: a.label || a.id,
        nuggetIds: a.nuggetIds,
        requiredMotifs: [...requiredMotifs],
        allMotifsReady,
        avgNuggetStreak,
        allNuggetsStable,
        ownStreak,
        lowerTierReady,
        isReady: allMotifsReady && (a.tier === 1 || lowerTierReady),
      };
    });

    // ============================================
    // BUILD PRACTICE HISTORY
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
        status: !state || state.attempt_count === 0
          ? "unseen"
          : state.current_streak >= 2
            ? "stable"
            : state.current_streak >= 1
              ? "building"
              : "struggling",
      };
    });

    // Assembly history
    const assemblyHistory = assemblies.map((a) => {
      const state = statesMap.get(a.id);
      const readiness = assemblyReadiness.find((r) => r.id === a.id);
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
        status: !state || state.attempt_count === 0
          ? "unseen"
          : state.current_streak >= 2
            ? "stable"
            : state.current_streak >= 1
              ? "building"
              : "struggling",
        isReady: readiness?.isReady ?? false,
        blockedBy: !readiness?.allMotifsReady
          ? "motifs"
          : !readiness?.lowerTierReady
            ? "lower_tier"
            : null,
      };
    });

    // Calculate overall proficiency
    const stableNuggets = practiceHistory.filter((h) => h.status === "stable").length;
    const stableAssemblies = assemblyHistory.filter((h) => h.status === "stable").length;
    const totalItems = nuggets.length + assemblies.length;
    const stableItems = stableNuggets + stableAssemblies;

    let proficiencyLevel: "beginner" | "intermediate" | "advanced" = "beginner";
    if (stableItems >= totalItems * 0.7) {
      proficiencyLevel = "advanced";
    } else if (stableItems >= totalItems * 0.3) {
      proficiencyLevel = "intermediate";
    }

    // ============================================
    // BUILD SYSTEM PROMPT
    // ============================================

    // Motif status section
    const motifStatusText = [...motifStatus.values()]
      .map((m) => `- ${m.id} "${m.label}" [importance: ${m.importance.toFixed(1)}]
    Status: ${m.isPassed ? "PASSED ✓" : "NOT PASSED"} (${m.passedNuggets}/${m.totalNuggets} nuggets at streak 2+, avg streak ${m.avgStreak.toFixed(1)})`)
      .join("\n");

    // Assembly readiness section
    const assemblyReadinessText = assemblyReadiness
      .map((a) => `- ${a.id} "${a.label}" (Tier ${a.tier})
    Required motifs: [${a.requiredMotifs.join(", ") || "none"}] - ${a.allMotifsReady ? "all passed ✓" : "BLOCKED"}
    Component stability: avg streak ${a.avgNuggetStreak.toFixed(1)}, ${a.allNuggetsStable ? "all stable ✓" : "building"}
    ${a.tier > 1 ? `Tier gate: ${a.lowerTierReady ? "lower tier ready ✓" : "BLOCKED by lower tier"}` : ""}
    Overall: ${a.isReady ? "READY to practice ✓" : "NOT READY - blocked"}`)
      .join("\n");

    // Nugget history section
    const nuggetHistoryText = practiceHistory
      .map((h) => `- ${h.nuggetId} "${h.label}" (${h.measureRange}) [motifs: ${h.dependsOn.join(", ") || "none"}]
    Status: ${h.status.toUpperCase()} | attempts: ${h.attemptCount}, passes: ${h.passCount}, streak: ${h.currentStreak}/${h.bestStreak}`)
      .join("\n");

    // Assembly history section
    const assemblyHistoryText = assemblyHistory
      .map((h) => `- ${h.assemblyId} "${h.label}" (Tier ${h.tier}, nuggets: ${h.nuggetIds.join("+")})
    Status: ${h.status.toUpperCase()} | attempts: ${h.attemptCount}, passes: ${h.passCount}, streak: ${h.currentStreak}/${h.bestStreak}
    Ready: ${h.isReady ? "YES ✓" : `NO - blocked by ${h.blockedBy}`}`)
      .join("\n");

    const systemPrompt = `You are a piano teacher AI building a short practice plan for a student learning "${briefing.title}".

STUDENT CONTEXT:
- ID: ${localUserId || "anonymous"}
- Language: ${language}
- Overall proficiency: ${proficiencyLevel}
- Stable nuggets: ${stableNuggets}/${nuggets.length}
- Stable assemblies: ${stableAssemblies}/${assemblies.length}

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

## MOTIF STATUS

${motifStatusText || "No motifs defined"}

---

## ASSEMBLY READINESS

${assemblyReadinessText || "No assemblies defined"}

---

## NUGGET PRACTICE HISTORY

${nuggetHistoryText || "No nuggets defined"}

---

## ASSEMBLY PRACTICE HISTORY

${assemblyHistoryText || "No assemblies defined"}

---

## CORE PRINCIPLES FOR CHOOSING NEXT ACTIVITIES

### 1) Prefer the smallest unit that unlocks progress
- If the learner is stuck (recent fails, low streak), go DOWN a level (assembly → nugget) to fix the blocker
- If the learner is stable (streak 2+), go UP one level (nugget → tier1, tier1 → tier2, etc.)

### 2) Motif gating: only require motifs that matter for the target
- Every assembly implicitly depends on the motifs present in its nugget span
- The learner can start assemblies early, BUT ONLY assemblies whose REQUIRED MOTIFS are already passed
- Do NOT require "all motifs in the tune", only motifs relevant to the chosen assembly
- Check the "ASSEMBLY READINESS" section - only suggest assemblies marked "READY to practice ✓"

### 3) Tier gating: don't skip the ladder
- Tier 2 activities should only be prioritized when Tier 1 assemblies inside that span are stable
- Tier 3 should only be prioritized when Tier 2 inside that span is stable
- If higher tier is tempting but foundations are weak, choose the foundation items first
- NEVER suggest an assembly that is "BLOCKED" in the readiness section

### 4) Balance forward progress and consolidation
In a short session plan, mix:
- 1 GROWTH target at the learner's current ceiling (next tier when allowed)
- 1-3 SUPPORT targets that reduce risk (weak motifs, recent failures, shaky transitions)

### 5) Use past activity signals
Prioritize items that are:
- Recently failed (needs immediate attention)
- Unseen but needed soon (prereq / motif unlock)
- Passed but with low confidence (low streak, few attempts, long time since last practice)

### 6) Keep the plan practical
- Target about 16 items early in learning, but allow more or less as needed
- As the learner nears full mastery, use far fewer items (short, focused plans)
- Don't flood with all possible nuggets/assemblies
- If full tune is not yet stable, prefer Tier 3 assemblies only when Tier 1 and Tier 2 are mastered
- Once ALL Tier 3 assemblies are stable, include an item to play the FULL TUNE end-to-end

---

## WHAT "MOTIF PASSED" MEANS

A motif is "passed" when the learner has succeeded on ENOUGH activities that contain it:
- High-importance motifs (0.8+): need 70%+ of containing nuggets at streak 2+
- Other motifs: need 50%+ of containing nuggets at streak 2+

Use the MOTIF STATUS section above - motifs marked "PASSED ✓" are ready.

---

## EXAMPLES

### Example 1: Motifs passed, no Tier 2 yet
- Plan: Tier 1 → Tier 2
- Pick 1-2 Tier 1 assemblies not yet solid, then introduce 1 Tier 2 assembly
- Don't add motif drills (motifs aren't the blocker)

### Example 2: User failing at Tier 2
- Plan: Tier 1 parts of that Tier 2 → retry Tier 2
- Pick the Tier 1 assemblies that sit inside (or overlap) the failed Tier 2 span
- After those stabilize, propose the same Tier 2 again

### Example 3: User completed some nuggets, but not all (starting Tier 1)
- Plan: finish key nuggets needed for Tier 1 + introduce Tier 1
- Pick missing/failed nuggets that unlock motifs used by Tier 1 assemblies
- In the same plan, introduce one easy Tier 1 assembly that only depends on already-passed motifs

---

Use the submit_practice_plan function to return a structured practice plan.`;

    const userPrompt = `Create a practice plan for this ${proficiencyLevel} student based on their history, motif status, and the progression principles above.

Remember:
- Only suggest READY assemblies (check ASSEMBLY READINESS)
- Balance 1 growth target + 1-3 support targets
- Target about 16 items, but it can be shorter and should taper as mastery increases
- Include brief, encouraging instructions for each item`;

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
                    instruction: { type: "string", description: "Brief instruction/goal for this item (1-2 sentences)" },
                    motifs: { type: "array", items: { type: "string" }, description: "Motif IDs this item practices" },
                  },
                  required: ["itemId", "itemType", "instruction", "motifs"],
                },
                description: "Ordered list of 3-6 items (nuggets and/or assemblies) to practice",
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
          proficiencyLevel,
          motifStatus: Object.fromEntries(motifStatus),
          assemblyReadiness,
          practiceHistory,
          assemblyHistory,
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
