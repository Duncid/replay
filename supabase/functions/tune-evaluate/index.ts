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

type NoteLike = {
  pitch?: number;
  startTime?: number;
  endTime?: number;
};

type NoteSequenceLike = {
  notes?: NoteLike[];
} & Record<string, unknown>;

const sanitizeNoteSequence = (sequence: unknown): NoteSequenceLike | undefined => {
  if (!sequence || typeof sequence !== "object") return undefined;
  const noteSequence = sequence as NoteSequenceLike;
  const notes = (noteSequence.notes || []).map((note) => ({
    pitch: note.pitch,
    startTime: note.startTime,
    endTime: note.endTime,
  }));
  return { ...noteSequence, notes };
};

const getNoteCount = (sequence: unknown) => {
  return (sequence as NoteSequenceLike | undefined)?.notes?.length || 0;
};

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
      notationPreference: rawNotation = "auto",
      debug = false,
      evalIndex = null,
    } = await req.json();

    // Resolve effective notation (same as Piano: auto -> by language)
    const effectiveNotation =
      rawNotation === "auto"
        ? (language === "fr" ? "solfege" : "abc")
        : rawNotation;

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

    // 1. Fetch tune asset to get nugget data
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
    const sanitizedTargetSequence = sanitizeNoteSequence(targetSequence);
    const sanitizedUserSequence = sanitizeNoteSequence(userSequence);

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
    const isTier3OrFullTune = isAssembly && (assemblyTier === 3 || nuggetId === "FULL_TUNE");

    // Note-name convention for reasoning and feedback (never use MIDI numbers)
    const noteNameRule =
      "When referring to pitches in reasoning and feedback, ALWAYS use note names. NEVER use MIDI numbers (e.g. 60, 72).";
    const notationConvention =
      effectiveNotation === "abc"
        ? "Use letter names with octave, e.g. C4, D#5, G3."
        : language === "fr"
          ? "Use solfège: Do, Ré, Mi, Fa, Sol, La, Si (with octave), e.g. Do4, Ré5."
          : "Use solfège: Do, Re, Mi, Fa, Sol, La, Si (with octave), e.g. Do4, Re5.";
    const reasoningExample =
      effectiveNotation === "abc"
        ? "Segment [start-end]: Note 1: C4 vs C4 (good), Note 2: D4 vs D4 (good), Note 3: C4 vs D4 (mistake(D4)), Note 4: (addition), Note 5: (missing G3)"
        : language === "fr"
          ? "Segment [start-end]: Note 1: Do4 vs Do4 (good), Note 2: Ré4 vs Ré4 (good), Note 3: Do4 vs Ré4 (mistake(Ré4)), Note 4: (addition), Note 5: (missing Sol3)"
          : "Segment [start-end]: Note 1: Do4 vs Do4 (good), Note 2: Re4 vs Re4 (good), Note 3: Do4 vs Re4 (mistake(Re4)), Note 4: (addition), Note 5: (missing Sol3)";

    // 5. Build LLM prompt

    const systemPrompt = `You are a piano practice evaluator. Evaluate the student's performance on a small section (nugget) or assembly of a piece.

STUDENT CONTEXT:
${localUserId ? `- Student ID: ${localUserId}` : "- Anonymous student"}
- Language preference: ${language}
- Music notation: ${effectiveNotation}. ${notationConvention}
- ${noteNameRule}
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
TARGET SEQUENCE (${getNoteCount(sanitizedTargetSequence)} notes):
${JSON.stringify(sanitizedTargetSequence, null, 2)}

USER'S RECORDED SEQUENCE (${getNoteCount(sanitizedUserSequence)} notes):
${JSON.stringify(sanitizedUserSequence, null, 2)}

MATCHING GUIDANCE:
The recording may contain notes from earlier attempts or warm-up playing.
The targetSequence is the source of truth. Find the best matching contiguous segment within the userSequence.
If there are multiple strong matches, choose the one with the best pitch-order match; if comparable, prefer the later (more recent) segment.
Evaluate based on the best matching segment, not the entire recording.
You may notice multiple matching segments; you can reward several successes, but focus on the latest attempt for feedback.
Feedback should always refer to the most recent attempt (the last played notes), even if the best match is earlier.

REPEATED NOTE HANDLING:
Some scores place the same pitch back-to-back with note end and next note start at the exact same time (no gap).
That is not physically re-articulable.
Do NOT penalize the student if they the gap between notes is longer; be lenient on timing for these repeated-note boundaries.

EVALUATION CRITERIA:
1. PITCH ACCURACY (primary): Did they play the correct notes in the correct order?
2. TIMING (secondary): Did they stay close to targetSequence timing? A 30% tolerance is acceptable.

LENIENCY FOR ASSEMBLIES AND NUGGETS:
For assemblies and nuggets of all tiers: Extra notes outside the best matching segment should not penalize the evaluation if the target sequence is fully present in order with correct pitches and timing is reasonable.

GRADING:
- "pass": All target notes present in correct order with correct pitches; timing is within tolerance in the best matching segment.
- "close": Mostly correct but minor pitch/order issues (1-2 wrong notes) or timing slightly outside tolerance.
- "fail": Multiple wrong notes, missing notes, or major order/timing problems.

REASONING REQUIREMENT (CRITICAL):
Before giving your evaluation, you MUST show your note-by-note comparison in the "reasoning" field.
Use note names only (e.g. C4 or Do4). Do not use pitch numbers.
Format: "${reasoningExample}"
For each note, mark as:
- "good" if pitches match exactly
- "mistake([expected])" if pitch is wrong, showing what was expected (use note name)
- "(addition)" if user played an extra note not in target
- "(missing [note name])" if a target note was not played
Then briefly note timing observations.
Your evaluation grade MUST be consistent with this analysis. If all notes are marked "good", the evaluation MUST be "pass" (assuming timing is acceptable).

FEEDBACK STYLE:
- Be encouraging and constructive
- Reference the teacherHints when giving feedback
- Keep feedback brief (1-2 sentences)
- If they failed, mention what to focus on
- If they passed, acknowledge what they did well
- User is playing, the feedback MUST BE very brief and focused. A few words, referencing specific aspects of their performance.
- Focus on the one or two most important aspects to improve.
- If there is a problem with notes, mention which notes (by name and index number in the sample) were incorrect or missing. Always use note names (never MIDI numbers).
- Be factual, avoid judgemental language.
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
              reasoning: {
                type: "string",
                description: `REQUIRED FIRST: Show your work by comparing the chosen segment note-by-note.
Use note names only (e.g. C4 or Do4). Do not use pitch numbers.
Format: "${reasoningExample}"
Then briefly explain timing assessment.
This field MUST be completed before deciding the evaluation grade.
Your final evaluation MUST be consistent with this analysis.`,
              },
              evaluation: {
                type: "string",
                enum: ["pass", "close", "fail"],
                description: "Overall evaluation based on the reasoning above. MUST be consistent with the note-by-note analysis.",
              },
              feedbackText: {
                type: "string",
                description: "Focused, short feedback",
              },
              successCount: {
                type: "number",
                description:
                  "Number of complete matching segments found in the recording (0 for close/fail, minimum 1 for pass).",
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
            required: ["reasoning", "evaluation", "feedbackText", "successCount", "replayDemo"],
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
          targetSequence: sanitizedTargetSequence,
          userSequence: sanitizedUserSequence,
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
      reasoning: string;
      evaluation: "pass" | "close" | "fail";
      feedbackText: string;
      successCount: number;
      replayDemo: boolean;
      markTuneAcquired?: boolean;
      awardSkills?: boolean;
    };

    // 5. Update nugget state
    const normalizedSuccessCount =
    evalResult.evaluation === "pass"
      ? Math.max(1, Math.floor(evalResult.successCount || 1))
      : 0;
  const newStreak =
    evalResult.evaluation === "pass"
      ? currentStreak + normalizedSuccessCount
      : 0;
  const newPassCount =
    (existingState?.pass_count || 0) + normalizedSuccessCount;

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
        reasoning: evalResult.reasoning,
        currentStreak: newStreak,
        successCount: normalizedSuccessCount,
        suggestNewNugget,
        replayDemo: evalResult.replayDemo,
        tuneAcquired,
        awardedSkills,
        evalIndex,
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
