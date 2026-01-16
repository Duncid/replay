import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const STREAK_THRESHOLD_FOR_NEW_NUGGET = 3;

interface TuneNugget {
  id: string;
  label: string;
  teacherHints: {
    goal: string;
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

    const nuggets = (tuneAsset.nuggets || []) as TuneNugget[];
    const nugget = nuggets.find((n) => n.id === nuggetId);

    if (!nugget) {
      return new Response(
        JSON.stringify({ error: `Nugget ${nuggetId} not found in tune` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const targetSequence = nugget.noteSequence;
    const teacherHints = nugget.teacherHints || {};
    
    // Extract tune-level evaluation guidance from briefing
    const briefing = (tuneAsset.briefing || {}) as Record<string, unknown>;
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

    // 3. Build LLM prompt
    const systemPrompt = `You are a piano practice evaluator. Evaluate the student's performance on a small section (nugget) of a piece.

STUDENT CONTEXT:
${localUserId ? `- Student ID: ${localUserId}` : "- Anonymous student"}
- Language preference: ${language}
${evaluationGuidance ? `
TUNE-LEVEL EVALUATION GUIDANCE:
${evaluationGuidance}
` : ""}
NUGGET BEING PRACTICED:
- ID: ${nuggetId}
- Label: ${nugget.label}
- Goal: ${teacherHints.goal || "Play this section accurately"}
${teacherHints.counting ? `- Counting guide: ${teacherHints.counting}` : ""}
${teacherHints.commonMistakes ? `- Common mistakes to watch for: ${teacherHints.commonMistakes}` : ""}
${teacherHints.whatToListenFor ? `- What to listen for: ${teacherHints.whatToListenFor}` : ""}

CURRENT PROGRESS:
- Previous attempts: ${attemptCount}
- Current streak: ${currentStreak}
- Streak threshold for moving on: ${STREAK_THRESHOLD_FOR_NEW_NUGGET}

TARGET SEQUENCE (${(targetSequence as any)?.notes?.length || 0} notes):
${JSON.stringify(targetSequence, null, 2)}

USER'S RECORDED SEQUENCE (${(userSequence as any)?.notes?.length || 0} notes):
${JSON.stringify(userSequence, null, 2)}

FOCUS ON LAST NOTES:
The recording may contain notes from earlier attempts or warm-up playing.
Focus on the LAST notes of their recording - this is their most recent attempt.
If the target has N notes and the recording has M notes (where M > N), look at the final ~N notes.
Try to find where the target sequence best matches within the recording, prioritizing the end.
Evaluate based on the best matching section, not the entire recording.

EVALUATION CRITERIA:
1. PITCH ACCURACY: Did they play the correct notes?
2. TIMING: Were notes played at approximately the right times?
3. COMPLETENESS: Did they play all required notes?

GRADING:
- "pass": Good pitch accuracy (80%+), reasonable timing, all notes present
- "close": Mostly correct but minor issues (1-2 wrong notes, slight timing issues)
- "fail": Multiple wrong notes, missing notes, or significant timing problems

FEEDBACK STYLE:
- Be encouraging and constructive
- Reference the teacherHints when giving feedback
- Keep feedback brief (1-2 sentences)
- If they failed, mention what to focus on
- If they passed, acknowledge what they did well`;

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
              replayDemo: {
                type: "boolean",
                description: "Whether to replay the demo after this evaluation (usually on fail)",
              },
            },
            required: ["evaluation", "feedbackText", "replayDemo"],
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
          nuggetLabel: nugget.label,
          targetSequence,
          userSequence,
          currentStreak,
          attemptCount,
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
      replayDemo: boolean;
    };

    // 5. Update nugget state
    const newStreak = evalResult.evaluation === "pass" ? currentStreak + 1 : 0;
    const newPassCount = (existingState?.pass_count || 0) + (evalResult.evaluation === "pass" ? 1 : 0);
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
        pass_count: evalResult.evaluation === "pass" ? 1 : 0,
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

    return new Response(
      JSON.stringify({
        evaluation: evalResult.evaluation,
        feedbackText: evalResult.feedbackText,
        currentStreak: newStreak,
        suggestNewNugget,
        replayDemo: evalResult.replayDemo,
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
