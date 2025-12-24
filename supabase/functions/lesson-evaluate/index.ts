import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Types
interface Note {
  pitch: number;
  startTime: number;
  endTime: number;
  velocity?: number;
}

interface NoteSequence {
  notes: Note[];
  totalTime: number;
}

interface MetronomeContext {
  t0: number; // Timestamp when metronome started
  bpm: number;
  meter: string;
  feel?: string;
  countInBars?: number;
}

interface GraderOutput {
  evaluation: "pass" | "close" | "fail";
  diagnosis: string[];
  feedbackText: string;
  suggestedAdjustment: "easier" | "same" | "harder";
  nextSetup?: Record<string, unknown>;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { lessonRunId, userSequence, metronomeContext, debug = false } = await req.json();

    if (!lessonRunId) {
      return new Response(
        JSON.stringify({ error: "lessonRunId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!userSequence) {
      return new Response(
        JSON.stringify({ error: "userSequence is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch lesson_run to get lesson_brief, demo_sequence, setup, state
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
    const demoSequence = lessonRun.demo_sequence as NoteSequence | null;
    const setup = lessonRun.setup as Record<string, unknown>;
    const state = lessonRun.state as Record<string, unknown>;

    // 2. Build Grader prompt
    const systemPrompt = `You are a piano lesson grader. Your ONLY job is to assess the student's performance objectively.
You do NOT provide encouragement or coaching - just pure assessment.

LESSON BRIEF:
- Key: ${lessonBrief.lessonKey}
- Title: ${lessonBrief.title}
- Goal: ${lessonBrief.goal}
${lessonBrief.evaluationGuidance ? `- Evaluation Guidance: ${lessonBrief.evaluationGuidance}` : ""}

CURRENT SETUP:
- BPM: ${setup.bpm || 80}
- Meter: ${setup.meter || "4/4"}
- Feel: ${setup.feel || "straight_beats"}
- Bars: ${setup.bars || 2}

${metronomeContext ? `METRONOME CONTEXT:
- Start time (t0): ${metronomeContext.t0}
- BPM: ${metronomeContext.bpm}
- Meter: ${metronomeContext.meter}
- Feel: ${metronomeContext.feel || "straight_beats"}
- Count-in bars: ${metronomeContext.countInBars || 1}` : "No metronome context provided."}

${demoSequence ? `EXPECTED DEMO SEQUENCE:
${JSON.stringify(demoSequence, null, 2)}` : "No demo sequence - evaluate based on lesson goal."}

USER'S RECORDED SEQUENCE:
${JSON.stringify(userSequence, null, 2)}

GRADING CRITERIA:
1. PITCH ACCURACY: Did they play the correct notes?
2. TIMING ACCURACY: Were notes played at the right times relative to the beat?
3. RHYTHM: Was the rhythm pattern correct?
4. COMPLETENESS: Did they play all required notes?

EVALUATION LEVELS:
- "pass": 80%+ accuracy on all criteria, good timing
- "close": 50-80% accuracy, minor timing issues, almost there
- "fail": <50% accuracy, significant errors, needs more practice

DIAGNOSIS TAGS (use these exactly):
- pitch_correct, pitch_wrong, pitch_partial
- timing_early, timing_late, timing_good
- rhythm_correct, rhythm_inconsistent, rhythm_wrong
- notes_complete, notes_missing, notes_extra
- velocity_good, velocity_weak, velocity_strong`;

    const userPrompt = `Evaluate the student's performance and return your assessment using the provided function.

Be objective and precise. Focus on what they did right and wrong.`;

    const composedPrompt = `SYSTEM:\n${systemPrompt}\n\nUSER:\n${userPrompt}`;

    // If debug mode, return the prompt without calling LLM
    if (debug) {
      return new Response(
        JSON.stringify({ prompt: composedPrompt, lessonBrief, setup, demoSequence, userSequence }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Call LLM with tool calling for structured output
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
              name: "submit_evaluation",
              description: "Submit the grading evaluation for the student's performance",
              parameters: {
                type: "object",
                properties: {
                  evaluation: {
                    type: "string",
                    enum: ["pass", "close", "fail"],
                    description: "Overall evaluation: pass (80%+), close (50-80%), fail (<50%)",
                  },
                  diagnosis: {
                    type: "array",
                    items: { type: "string" },
                    description: "Array of diagnosis tags describing what went right/wrong",
                  },
                  feedbackText: {
                    type: "string",
                    description: "Brief factual feedback (1-2 sentences) about the performance",
                  },
                  suggestedAdjustment: {
                    type: "string",
                    enum: ["easier", "same", "harder"],
                    description: "Suggested difficulty adjustment based on performance",
                  },
                  nextSetup: {
                    type: "object",
                    description: "Optional setup changes if suggesting easier/harder",
                    properties: {
                      bpm: { type: "number" },
                      bars: { type: "number" },
                    },
                  },
                },
                required: ["evaluation", "diagnosis", "feedbackText", "suggestedAdjustment"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "submit_evaluation" } },
      }),
    });

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      console.error("LLM API error:", llmResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to evaluate performance" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const llmData = await llmResponse.json();
    console.log("Grader LLM response:", JSON.stringify(llmData, null, 2));

    // Extract the tool call result
    let graderOutput: GraderOutput;

    try {
      const toolCall = llmData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        graderOutput = JSON.parse(toolCall.function.arguments);
      } else {
        throw new Error("No tool call in response");
      }
    } catch (e) {
      console.error("Failed to parse LLM response:", e);
      // Fallback to a conservative evaluation
      graderOutput = {
        evaluation: "close",
        diagnosis: ["evaluation_error"],
        feedbackText: "Unable to fully evaluate the performance. Please try again.",
        suggestedAdjustment: "same",
      };
    }

    // 4. Update lesson_run with evaluation results
    const { error: updateError } = await supabase
      .from("lesson_runs")
      .update({
        user_recording: userSequence,
        metronome_context: metronomeContext,
        evaluation: graderOutput.evaluation,
        diagnosis: graderOutput.diagnosis,
        attempt_count: (lessonRun.attempt_count || 0) + 1,
      })
      .eq("id", lessonRunId);

    if (updateError) {
      console.error("Error updating lesson run:", updateError);
    }

    console.log("Evaluation complete:", lessonRunId, graderOutput.evaluation);

    return new Response(JSON.stringify(graderOutput), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in lesson-evaluate:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
