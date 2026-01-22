import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const STREAK_THRESHOLD_FOR_NEW_NUGGET = 3;

interface TuneItem {
  id: string;
  label?: string;
  tier?: number; // For assemblies
  teacherHints?: {
    goal?: string;
    counting?: string;
    commonMistakes?: string;
    whatToListenFor?: string;
  };
  noteSequence?: unknown;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      tuneKey,
      nuggetId,
      userSequence,
      localUserId = null,
      language = "en",
      debug = false,
    } = await req.json();

    if (!tuneKey || !nuggetId || !userSequence) {
      return new Response(
        JSON.stringify({ error: "tuneKey, nuggetId, and userSequence are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[tune-evaluate] Request - tuneKey: ${tuneKey}, nuggetId: ${nuggetId}, user: ${localUserId}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch tune asset from the latest PUBLISHED curriculum version
    // This ensures we use assets from a successfully published version, not failed/partial publishes
    let tuneAsset;
    const { data: publishedAsset, error: tuneError } = await supabase
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

    if (tuneError || !publishedAsset) {
      console.warn(`[tune-evaluate] No published version found for ${tuneKey}, trying fallback`);
      // Fallback: try without version filter in case of migration issues
      const { data: fallbackAsset, error: fallbackError } = await supabase
        .from("tune_assets")
        .select("*")
        .eq("tune_key", tuneKey)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (fallbackError || !fallbackAsset) {
        console.error("Error fetching tune asset:", fallbackError);
        return new Response(
          JSON.stringify({ error: "Tune not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      tuneAsset = fallbackAsset;
      console.warn(`[tune-evaluate] Using fallback query for ${tuneKey} - no published version found`);
    } else {
      tuneAsset = publishedAsset;
      console.log(`[tune-evaluate] Using published version ${publishedAsset.curriculum_versions?.id} for ${tuneKey}`);
    }

    const briefing = (tuneAsset.briefing || {}) as Record<string, unknown>;

    // Look in both nuggets and assemblies for the item
    const nuggets = (tuneAsset.nuggets || []) as TuneItem[];
    const assemblies = (tuneAsset.assemblies || []) as TuneItem[];
    
    let targetItem: TuneItem | undefined = nuggets.find((n) => n.id === nuggetId);
    let isAssembly = false;
    
    if (!targetItem) {
      targetItem = assemblies.find((a) => a.id === nuggetId);
      isAssembly = true;
    }

    if (!targetItem && nuggetId === "FULL_TUNE" && tuneAsset.note_sequence) {
      targetItem = {
        id: "FULL_TUNE",
        label: `${(briefing.title as string) || tuneKey} (full tune)`,
        tier: 3,
        noteSequence: tuneAsset.note_sequence,
      };
      isAssembly = true;
    }

    if (!targetItem) {
      return new Response(
        JSON.stringify({ error: `Item ${nuggetId} not found in tune (checked nuggets and assemblies)` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const targetSequence = targetItem.noteSequence;
    const teacherHints = targetItem.teacherHints || {};
    const assemblyTier = isAssembly ? (targetItem.tier || 1) : null;
    
    // Extract tune-level evaluation guidance from briefing
    const evaluationGuidance = briefing.evaluationGuidance as string | null;

    // 2. Fetch current nugget state
    let nuggetStateQuery = supabase
      .from("tune_nugget_state")
      .select("*")
      .eq("tune_key", tuneKey)
      .eq("nugget_id", nuggetId);

    if (localUserId) {
      nuggetStateQuery = nuggetStateQuery.eq("local_user_id", localUserId);
    }

    const { data: existingState } = await nuggetStateQuery.maybeSingle();

    const currentStreak = existingState?.current_streak || 0;
    const attemptCount = existingState?.attempt_count || 0;

    // 3. Fetch recent practice activity (last 20 runs)
    let recentRunsQuery = supabase
      .from("tune_practice_runs")
      .select("nugget_id, evaluation, ended_at, ai_feedback")
      .eq("tune_key", tuneKey)
      .order("ended_at", { ascending: false })
      .limit(20);

    if (localUserId) {
      recentRunsQuery = recentRunsQuery.eq("local_user_id", localUserId);
    }

    const { data: recentRuns } = await recentRunsQuery;

    // Fetch all nugget/assembly states for this tune
    let allStatesQuery = supabase
      .from("tune_nugget_state")
      .select("nugget_id, attempt_count, pass_count, current_streak, best_streak, last_practiced_at")
      .eq("tune_key", tuneKey);

    if (localUserId) {
      allStatesQuery = allStatesQuery.eq("local_user_id", localUserId);
    }

    const { data: allStates } = await allStatesQuery;
    const statesMap = new Map(
      (allStates || []).map((s: {
        nugget_id: string;
        attempt_count?: number;
        pass_count?: number;
        current_streak?: number;
        best_streak?: number;
        last_practiced_at?: string | null;
      }) => [s.nugget_id, s])
    );

    // Calculate progress indicators
    const allStateItems = allStates || [];
    const totalAttempts = allStateItems.reduce((sum, s) => sum + (s.attempt_count || 0), 0);
    const totalPasses = allStateItems.reduce((sum, s) => sum + (s.pass_count || 0), 0);
    const overallPassRate = totalAttempts > 0 ? totalPasses / totalAttempts : 0;
    const stableItems = allStateItems.filter((s) => (s.current_streak || 0) >= 2).length;
    const totalItems = nuggets.length + assemblies.length;

    // Calculate assembly states by tier
    const assemblyStatesByTier = new Map<number, number>();
    for (const assembly of assemblies) {
      const state = statesMap.get(assembly.id);
      const tier = assembly.tier || 1;
      const current = assemblyStatesByTier.get(tier) || 0;
      const stateStreak = (state as { current_streak?: number } | undefined)?.current_streak || 0;
      assemblyStatesByTier.set(tier, current + (stateStreak >= 2 ? 1 : 0));
    }

    // 4. Check acquisition and skill status (idempotency)
    let alreadyAcquired = false;
    let acquisitionQuery = supabase
      .from("user_tune_acquisition")
      .select("id")
      .eq("tune_key", tuneKey);

    if (localUserId) {
      acquisitionQuery = acquisitionQuery.eq("local_user_id", localUserId);
    }

    const { data: existingAcquisition } = await acquisitionQuery.maybeSingle();
    alreadyAcquired = !!existingAcquisition;

    // Fetch available skills from curriculum_edges
    const { data: skillEdges } = await supabase
      .from("curriculum_edges")
      .select("target_key")
      .eq("source_key", tuneKey)
      .eq("edge_type", "tune_awards_skill");

    const availableSkills = (skillEdges || []).map((e) => e.target_key);

    // Check which skills are already unlocked
    let unlockedSkills: string[] = [];
    if (availableSkills.length > 0 && localUserId) {
      const { data: skillStates } = await supabase
        .from("user_skill_state")
        .select("skill_key")
        .in("skill_key", availableSkills)
        .eq("local_user_id", localUserId)
        .eq("unlocked", true);

      unlockedSkills = (skillStates || []).map((s) => s.skill_key);
    }

    const skillsToAward = availableSkills.filter((sk) => !unlockedSkills.includes(sk));

    // 5. Build LLM prompt
    const isTier3OrFullTune = isAssembly && (assemblyTier === 3 || nuggetId === "FULL_TUNE");
    
    // Build recent activity summary
    const recentActivitySummary = recentRuns && recentRuns.length > 0
      ? recentRuns.slice(0, 10).map((run, idx) => {
          const evalStatus = run.evaluation || "unknown";
          const timeAgo = run.ended_at 
            ? `${Math.round((Date.now() - new Date(run.ended_at).getTime()) / (1000 * 60))} minutes ago`
            : "unknown time";
          return `  ${idx + 1}. ${run.nugget_id}: ${evalStatus} (${timeAgo})`;
        }).join("\n")
      : "  No recent practice runs";

    // Build progress summary
    const progressSummary = `- Total items practiced: ${totalItems}
- Stable items (streak >= 2): ${stableItems} (${Math.round((stableItems / Math.max(totalItems, 1)) * 100)}%)
- Overall pass rate: ${Math.round(overallPassRate * 100)}%
- Stable assemblies by tier: ${Array.from(assemblyStatesByTier.entries())
      .map(([tier, count]) => `Tier ${tier}: ${count}`)
      .join(", ") || "none"}`;

    const tier3Context = isTier3OrFullTune
      ? `\n\nTIER 3 ASSEMBLY / FULL TUNE - TUNE MASTERY:
This is ${nuggetId === "FULL_TUNE" ? "the full tune" : "a Tier 3 (final) assembly"} combining all nuggets of the tune.
Successfully passing this demonstrates mastery of the ENTIRE tune.
You may decide to mark the tune as "Acquired" and unlock associated skills if mastery is demonstrated.
Be appropriately celebratory if they pass and you decide to acquire the tune!`
      : "";

    const acquisitionContext = isTier3OrFullTune
      ? `\n\nTUNE ACQUISITION CONTEXT:
${alreadyAcquired ? "⚠️ WARNING: This tune is ALREADY acquired. You CANNOT acquire it again." : "This tune has NOT been acquired yet. You may acquire it if mastery is demonstrated."}
- Available skills to award: ${availableSkills.length > 0 ? availableSkills.join(", ") : "none"}
- Already unlocked skills: ${unlockedSkills.length > 0 ? unlockedSkills.join(", ") : "none"}
- Skills that can still be unlocked: ${skillsToAward.length > 0 ? skillsToAward.join(", ") : "none"}

ACQUISITION DECISION CRITERIA:
- You can only decide to acquire when practicing Tier 3 assemblies or Full Tune (current item: ${isTier3OrFullTune ? "YES" : "NO"})
- Consider sustained mastery: multiple passes, stable streaks, overall proficiency
- Look for consistent performance across recent practice runs
- Consider overall progress: ${Math.round((stableItems / Math.max(totalItems, 1)) * 100)}% stable items, ${Math.round(overallPassRate * 100)}% pass rate
- Only award skills if the tune is being acquired AND demonstrating competency`
      : "";

    const notationInstruction = language === "fr"
      ? "NOTE NOTATION: When mentioning notes, use solfège (Do, Ré, Mi, Fa, Sol, La, Si). Do not use ABC letter names."
      : "NOTE NOTATION: When mentioning notes, use letter names (C, D, E, F, G, A, B).";

    const systemPrompt = `You are a piano practice evaluator. Evaluate the student's performance on a small section (nugget) or assembly of a piece.

RECENT PRACTICE ACTIVITY (last 10 runs):
${recentActivitySummary}

OVERALL PROGRESS:
${progressSummary}
${tier3Context}
${acquisitionContext}

STUDENT CONTEXT:
${localUserId ? `- Student ID: ${localUserId}` : "- Anonymous student"}
- Language preference: ${language}
LANGUAGE INSTRUCTION:
- Respond in ${language}. Do not mix languages.
- Keep feedback brief.
${notationInstruction}
${evaluationGuidance ? `
TUNE-LEVEL EVALUATION GUIDANCE:
${evaluationGuidance}
` : ""}
${isAssembly ? `ASSEMBLY (Tier ${assemblyTier})` : "NUGGET"} BEING PRACTICED:
- ID: ${nuggetId}
- Label: ${targetItem.label || nuggetId}
- Goal: ${teacherHints.goal || "Play this section accurately"}
${teacherHints.counting ? `- Counting guide: ${teacherHints.counting}` : ""}
${teacherHints.commonMistakes ? `- Common mistakes to watch for: ${teacherHints.commonMistakes}` : ""}
${teacherHints.whatToListenFor ? `- What to listen for: ${teacherHints.whatToListenFor}` : ""}

CURRENT ITEM PROGRESS:
- Item ID: ${nuggetId}
- Previous attempts: ${attemptCount}
- Current streak: ${currentStreak}
- Best streak: ${existingState?.best_streak || 0}
- Streak threshold for moving on: ${STREAK_THRESHOLD_FOR_NEW_NUGGET}

TARGET SEQUENCE (${(targetSequence as any)?.notes?.length || 0} notes):
${JSON.stringify(targetSequence, null, 2)}

USER'S RECORDED SEQUENCE (${(userSequence as any)?.notes?.length || 0} notes):
${JSON.stringify(userSequence, null, 2)}

CONTINUOUS RECORDING MATCHING:
The recording may contain multiple attempts, warm-ups, or partial phrases.
Search the FULL recording for one or more occurrences of the target sequence (or a close variant).
Prioritize segments toward the end, but do not ignore earlier complete matches.
Evaluate the performance based on:
1) The best matching segment (for grading), AND
2) Overall consistency across attempts (for feedback).
If there are multiple valid matches, consider it a stronger pass and mention consistency in feedback.
IMPORTANT: For assemblies and nuggets, if the recording has exactly N+1 notes (where N is the target count) and the first N notes match the target perfectly in pitch and order, this should still be considered a valid performance even with the extra note at the end.

REPEATED NOTE HANDLING:
Some scores place the same pitch back-to-back with note end and next note start at the exact same time (no gap).
That is not physically re-articulable; treat consecutive identical pitches with zero-gap boundaries as a single sustained note for matching.
Do NOT penalize the student if they:
- Hold a single note across those boundaries, OR
- Re-articulate with a tiny gap or overlap.
Focus on pitch order and overall rhythm; be lenient on timing for these repeated-note boundaries.

EVALUATION CRITERIA:
1. PITCH ACCURACY: Did they play the correct notes?
2. TIMING: Were notes played at approximately the right times?
3. COMPLETENESS: Did they play all required notes?

LENIENCY FOR ASSEMBLIES AND NUGGETS:
For assemblies and nuggets of all tiers: If all target notes are played correctly in order with correct pitch, and there is exactly one extra note at the end, this should still be considered a "pass" (assuming timing is reasonable). The key is that the target sequence must be present in full, in the correct order, with correct pitches - an additional note at the end is acceptable.

GRADING:
- "pass": At least one complete matching segment with good pitch accuracy (80%+), reasonable timing, and all notes present. For assemblies and nuggets: If all target notes are present in correct order with correct pitches, and there is exactly one or two extra notes at the end, this qualifies as "pass" (assuming timing is reasonable).
- "close": No complete match, but there is a near match (mostly correct with 1-2 wrong notes or slight timing issues).
- "fail": No meaningful match found, or multiple wrong/missing notes with significant timing problems.

SUCCESS COUNT:
- If evaluation is "pass", return successCount = number of complete matching segments you found (minimum 1).
- If evaluation is "close" or "fail", return successCount = 0.

FEEDBACK STYLE:
- Be encouraging and constructive
- Reference the teacherHints when giving feedback
- Keep feedback brief (1-2 sentences)
- If they failed, mention what to focus on
- If they passed, acknowledge what they did well
- If there were multiple attempts, mention consistency (or inconsistency) briefly`;

    const userPrompt = `Evaluate this performance and provide feedback.`;

    const composedPrompt = `SYSTEM:\n${systemPrompt}\n\nUSER:\n${userPrompt}`;

    const toolsDefinition = [
      {
        type: "function",
        function: {
          name: "submit_evaluation",
          description: "Submit the evaluation result and feedback",
          parameters: {
            type: "object",
            properties: {
              evaluation: {
                type: "string",
                enum: ["pass", "close", "fail"],
                description: "Overall evaluation of the performance",
              },
              feedbackText: {
                type: "string",
                description: "Encouraging, constructive feedback (1-2 sentences)",
              },
              successCount: {
                type: "number",
                description: "Number of complete matching segments found in the recording (0 for close/fail, minimum 1 for pass).",
              },
              replayDemo: {
                type: "boolean",
                description: "Whether to replay the demo after this evaluation (usually on fail)",
              },
              markTuneAcquired: {
                type: "boolean",
                description: `Whether to mark this tune as acquired. Only set to true if practicing Tier 3 assembly or Full Tune AND demonstrating sustained mastery. Cannot set if already acquired.${alreadyAcquired ? " (TUNE IS ALREADY ACQUIRED - DO NOT SET TO TRUE)" : ""}`,
              },
              awardSkills: {
                type: "boolean",
                description: `Whether to award skills associated with this tune. Only set if markTuneAcquired is true AND demonstrating competency. Skills are automatically fetched from tune_awards_skill edges. Available skills: ${availableSkills.length > 0 ? availableSkills.join(", ") : "none"}. Already unlocked: ${unlockedSkills.length > 0 ? unlockedSkills.join(", ") : "none"}.`,
              },
            },
            required: ["evaluation", "feedbackText", "successCount", "replayDemo"],
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
      tool_choice: { type: "function", function: { name: "submit_evaluation" } },
    };

    // Debug mode
    if (debug) {
      return new Response(
        JSON.stringify({
          request: debugRequest,
          prompt: composedPrompt,
          tuneKey,
          nuggetId,
          itemLabel: targetItem.label || nuggetId,
          targetSequence,
          userSequence,
          currentStreak,
          attemptCount,
          isAssembly,
          assemblyTier,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Call LLM
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
    console.log("[tune-evaluate] LLM response received");

    const toolCall = llmData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== "submit_evaluation") {
      throw new Error("Invalid LLM response structure");
    }

    const evalResult = JSON.parse(toolCall.function.arguments) as {
      evaluation: "pass" | "close" | "fail";
      feedbackText: string;
      successCount: number;
      replayDemo: boolean;
      markTuneAcquired?: boolean;
      awardSkills?: boolean;
    };

    // 5. Update nugget state
    const normalizedSuccessCount = evalResult.evaluation === "pass"
      ? Math.max(1, Math.floor(evalResult.successCount || 1))
      : 0;
    const newStreak = evalResult.evaluation === "pass" ? currentStreak + normalizedSuccessCount : 0;
    const newPassCount = (existingState?.pass_count || 0) + normalizedSuccessCount;
    const newBestStreak = Math.max(existingState?.best_streak || 0, newStreak);

    if (existingState) {
      await supabase
        .from("tune_nugget_state")
        .update({
          attempt_count: attemptCount + 1,
          pass_count: newPassCount,
          current_streak: newStreak,
          best_streak: newBestStreak,
          last_practiced_at: new Date().toISOString(),
        })
        .eq("id", existingState.id);
    } else {
      await supabase.from("tune_nugget_state").insert({
        tune_key: tuneKey,
        nugget_id: nuggetId,
        local_user_id: localUserId,
        attempt_count: 1,
        pass_count: normalizedSuccessCount,
        current_streak: newStreak,
        best_streak: newStreak,
        last_practiced_at: new Date().toISOString(),
      });
    }

    // 6. Record practice run
    await supabase.from("tune_practice_runs").insert({
      tune_key: tuneKey,
      nugget_id: nuggetId,
      local_user_id: localUserId,
      evaluation: evalResult.evaluation,
      user_recording: userSequence,
      ai_feedback: evalResult.feedbackText,
      ended_at: new Date().toISOString(),
    });

    // 7. Determine if should suggest new nugget
    const suggestNewNugget = newStreak >= STREAK_THRESHOLD_FOR_NEW_NUGGET;

    // 8. Process LLM decision for tune acquisition and skill unlocking
    let tuneAcquired = false;
    const awardedSkills: string[] = [];

    // Only process acquisition if LLM decided to acquire AND idempotency checks pass
    if (evalResult.markTuneAcquired === true && !alreadyAcquired && isTier3OrFullTune && localUserId) {
      console.log(`[tune-evaluate] LLM decided to acquire tune ${tuneKey} for user ${localUserId}`);
      
      // Mark tune as acquired
      const { error: acquisitionError } = await supabase
        .from("user_tune_acquisition")
        .insert({
          local_user_id: localUserId,
          tune_key: tuneKey,
          acquired_at: new Date().toISOString(),
        });
      
      if (!acquisitionError) {
        tuneAcquired = true;
        console.log(`[tune-evaluate] Tune ${tuneKey} acquired by user ${localUserId}`);
      } else {
        console.error("[tune-evaluate] Error inserting tune acquisition:", acquisitionError);
      }
    } else if (evalResult.markTuneAcquired === true && alreadyAcquired) {
      console.log(`[tune-evaluate] LLM attempted to acquire already-acquired tune ${tuneKey} - ignoring (idempotency)`);
    } else if (evalResult.markTuneAcquired === true && !isTier3OrFullTune) {
      console.log(`[tune-evaluate] LLM attempted to acquire tune ${tuneKey} while not practicing Tier 3/Full Tune - ignoring`);
    }

    // Process skill unlocking if LLM decided to award skills AND tune is being acquired or already acquired
    if (evalResult.awardSkills === true && (tuneAcquired || alreadyAcquired) && localUserId) {
      console.log(`[tune-evaluate] LLM decided to award skills for tune ${tuneKey}`);
      
      // Only unlock skills that aren't already unlocked (idempotency per skill)
      for (const skillKey of skillsToAward) {
        const { error: skillError } = await supabase
          .from("user_skill_state")
          .upsert(
            {
              skill_key: skillKey,
              local_user_id: localUserId,
              unlocked: true,
              mastery: 1,
              last_practiced_at: new Date().toISOString(),
            },
            { onConflict: "skill_key,local_user_id" }
          );
        
        if (!skillError) {
          awardedSkills.push(skillKey);
          console.log(`[tune-evaluate] Skill ${skillKey} awarded to user ${localUserId}`);
        } else {
          console.error(`[tune-evaluate] Error upserting skill ${skillKey}:`, skillError);
        }
      }
      
      // Warn if trying to unlock already-unlocked skills
      if (skillsToAward.length === 0 && availableSkills.length > 0) {
        console.log(`[tune-evaluate] All skills already unlocked for tune ${tuneKey}`);
      }
    }

    return new Response(
      JSON.stringify({
        evaluation: evalResult.evaluation,
        feedbackText: evalResult.feedbackText,
        currentStreak: newStreak,
        successCount: normalizedSuccessCount,
        suggestNewNugget,
        replayDemo: evalResult.replayDemo,
        tuneAcquired,
        awardedSkills,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[tune-evaluate] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
