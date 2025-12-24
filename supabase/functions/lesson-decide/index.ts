import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Types
type CoachNextAction = "RETRY_SAME" | "MAKE_EASIER" | "MAKE_HARDER" | "EXIT_TO_MAIN_TEACHER";

interface GraderOutput {
  evaluation: "pass" | "close" | "fail";
  diagnosis: string[];
  feedbackText: string;
  suggestedAdjustment: "easier" | "same" | "harder";
  nextSetup?: Record<string, unknown>;
}

interface CoachOutput {
  feedbackText: string;
  nextAction: CoachNextAction;
  setupDelta?: Record<string, unknown>;
  exitHint?: string;
}

interface LessonState {
  turn: number;
  passStreak: number;
  failStreak: number;
  lastDecision: CoachNextAction | null;
  phase: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Guardrail constants
const PASS_STREAK_THRESHOLD = 2; // Suggest harder/exit after 2 passes
const FAIL_STREAK_THRESHOLD = 3; // Suggest easier after 3 fails
const MAX_ATTEMPTS = 5; // Suggest exit after 5 attempts (fatigue)

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { lessonRunId, graderOutput, debug = false } = await req.json();

    if (!lessonRunId) {
      return new Response(
        JSON.stringify({ error: "lessonRunId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!graderOutput) {
      return new Response(
        JSON.stringify({ error: "graderOutput is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch lesson_run to get lesson_brief, state, setup
    const { data: lessonRun, error: runError } = await supabase
      .from("lesson_runs")
      .select("*")
      .eq("id", lessonRunId)
      .single();

    if (runError || !lessonRun) {
      console.error("Error fetching lesson run:", runError);
      return new Response(
        JSON.stringify({ error: "Lesson run not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const lessonBrief = lessonRun.lesson_brief as Record<string, unknown>;
    const setup = lessonRun.setup as Record<string, unknown>;
    const currentState = (lessonRun.state as LessonState) || {
      turn: 0,
      passStreak: 0,
      failStreak: 0,
      lastDecision: null,
      phase: "feedback",
    };

    // 2. Update streaks based on evaluation
    const newState: LessonState = {
      turn: currentState.turn + 1,
      passStreak: graderOutput.evaluation === "pass" ? currentState.passStreak + 1 : 0,
      failStreak: graderOutput.evaluation === "fail" ? currentState.failStreak + 1 : 
                  graderOutput.evaluation === "close" ? currentState.failStreak + 1 : 0,
      lastDecision: null, // Will be set after coach decides
      phase: "feedback",
    };

    // 3. Apply guardrails (deterministic suggestions for the coach)
    let guardrailHint = "";
    let suggestedAction: CoachNextAction | null = null;

    if (lessonRun.attempt_count >= MAX_ATTEMPTS) {
      guardrailHint = "Student has made many attempts. Consider suggesting a break.";
      suggestedAction = "EXIT_TO_MAIN_TEACHER";
    } else if (newState.passStreak >= PASS_STREAK_THRESHOLD) {
      guardrailHint = `Student has passed ${newState.passStreak} times in a row. Consider making it harder or moving on.`;
      suggestedAction = "MAKE_HARDER";
    } else if (newState.failStreak >= FAIL_STREAK_THRESHOLD) {
      guardrailHint = `Student has struggled ${newState.failStreak} times. Consider making it easier.`;
      suggestedAction = "MAKE_EASIER";
    }

    // 4. Build Coach prompt
    const systemPrompt = `You are a supportive piano lesson coach. Your job is to give encouraging feedback and decide what happens next.
You trust the grader's assessment completely - do NOT re-evaluate the performance.

LESSON BRIEF:
- Key: ${lessonBrief.lessonKey}
- Title: ${lessonBrief.title}
- Goal: ${lessonBrief.goal}

CURRENT SETUP:
- BPM: ${setup.bpm || 80}
- Meter: ${setup.meter || "4/4"}
- Bars: ${setup.bars || 2}

LESSON STATE:
- Turn: ${newState.turn}
- Total attempts: ${lessonRun.attempt_count || 0}
- Pass streak: ${newState.passStreak}
- Fail streak: ${newState.failStreak}

GRADER'S ASSESSMENT:
- Evaluation: ${graderOutput.evaluation}
- Diagnosis: ${graderOutput.diagnosis.join(", ")}
- Grader feedback: ${graderOutput.feedbackText}
- Grader suggestion: ${graderOutput.suggestedAdjustment}
${graderOutput.nextSetup ? `- Suggested setup: ${JSON.stringify(graderOutput.nextSetup)}` : ""}

${guardrailHint ? `GUARDRAIL HINT: ${guardrailHint}` : ""}

YOUR AVAILABLE ACTIONS:
- RETRY_SAME: Have them try again with the same setup
- MAKE_EASIER: Reduce difficulty (slower BPM, fewer bars, etc.)
- MAKE_HARDER: Increase difficulty (faster BPM, more bars, etc.)
- EXIT_TO_MAIN_TEACHER: End this lesson, return to lesson selection

COACHING STYLE:
- Be encouraging but honest
- Keep feedback brief (2-3 sentences max)
- Focus on what they did well AND what to improve
- If suggesting MAKE_EASIER, frame it positively ("Let's build up to this")
- If suggesting EXIT, make it feel like progress, not failure`;

    const userPrompt = `Based on the grader's assessment, provide your coaching feedback and decide the next action.

Use the provided function to submit your decision.`;

    const composedPrompt = `SYSTEM:\n${systemPrompt}\n\nUSER:\n${userPrompt}`;

    // If debug mode, return the prompt without calling LLM
    if (debug) {
      return new Response(
        JSON.stringify({ 
          prompt: composedPrompt, 
          lessonBrief, 
          setup, 
          state: newState, 
          graderOutput,
          guardrailHint,
          suggestedAction,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Call LLM with tool calling for structured output
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const llmResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "coach_decision",
              description: "Submit the coaching feedback and next action decision",
              parameters: {
                type: "object",
                properties: {
                  feedbackText: {
                    type: "string",
                    description: "Encouraging, constructive feedback for the student (2-3 sentences)",
                  },
                  nextAction: {
                    type: "string",
                    enum: ["RETRY_SAME", "MAKE_EASIER", "MAKE_HARDER", "EXIT_TO_MAIN_TEACHER"],
                    description: "What should happen next in the lesson",
                  },
                  setupDelta: {
                    type: "object",
                    description: "Setup changes if making easier/harder (e.g., { bpm: 70 })",
                    properties: {
                      bpm: { type: "number" },
                      bars: { type: "number" },
                      meter: { type: "string" },
                      feel: { type: "string" },
                    },
                  },
                  exitHint: {
                    type: "string",
                    description: "If exiting, a hint for the main teacher about what to suggest next",
                  },
                },
                required: ["feedbackText", "nextAction"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "coach_decision" } },
      }),
    });

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      console.error("LLM API error:", llmResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to generate coach decision" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const llmData = await llmResponse.json();
    console.log("Coach LLM response:", JSON.stringify(llmData, null, 2));

    // Extract the tool call result
    let coachOutput: CoachOutput;

    try {
      const toolCall = llmData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        coachOutput = JSON.parse(toolCall.function.arguments);
      } else {
        throw new Error("No tool call in response");
      }
    } catch (e) {
      console.error("Failed to parse LLM response:", e);
      // Fallback based on guardrails or grader suggestion
      coachOutput = {
        feedbackText: graderOutput.evaluation === "pass" 
          ? "Good job! Let's keep going." 
          : "Nice try! Let's give it another shot.",
        nextAction: suggestedAction || "RETRY_SAME",
      };
    }

    // 6. Update lesson state with decision
    newState.lastDecision = coachOutput.nextAction;
    newState.phase = coachOutput.nextAction === "EXIT_TO_MAIN_TEACHER" ? "exit" : 
                     coachOutput.nextAction === "RETRY_SAME" ? "practice" : "intro";

    // Apply setup delta if provided
    let newSetup = setup;
    if (coachOutput.setupDelta && (coachOutput.nextAction === "MAKE_EASIER" || coachOutput.nextAction === "MAKE_HARDER")) {
      newSetup = { ...setup, ...coachOutput.setupDelta };
    }

    // Update the lesson run
    const updateData: Record<string, unknown> = {
      state: newState,
      ai_feedback: coachOutput.feedbackText,
    };

    if (coachOutput.nextAction === "EXIT_TO_MAIN_TEACHER") {
      updateData.ended_at = new Date().toISOString();
    }

    if (newSetup !== setup) {
      updateData.setup = newSetup;
    }

    const { error: updateError } = await supabase
      .from("lesson_runs")
      .update(updateData)
      .eq("id", lessonRunId);

    if (updateError) {
      console.error("Error updating lesson run:", updateError);
    }

    console.log("Coach decision:", lessonRunId, coachOutput.nextAction);

    return new Response(JSON.stringify({
      ...coachOutput,
      state: newState,
      setup: newSetup,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in lesson-decide:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
