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
  awardSkills?: boolean;
}

interface LessonBrief {
  lessonKey: string;
  title: string;
  goal: string;
  awardedSkills: string[];
  [key: string]: unknown;
}

interface LessonState {
  turn: number;
  passStreak: number;
  failStreak: number;
  lastDecision: CoachNextAction | null;
  phase: string;
}

interface SkillUnlockGuidance {
  skillKey: string;
  guidance: string;
}

interface CurriculumNodeData {
  title?: string;
  awardedSkills?: string[];
  skillUnlockGuidance?: Record<string, string>;
  [key: string]: unknown;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Guardrail constants
const PASS_STREAK_THRESHOLD = 2; // Suggest harder/exit after 2 passes
const FAIL_STREAK_THRESHOLD = 3; // Suggest easier after 3 fails
const MAX_ATTEMPTS = 5; // Suggest exit after 5 attempts (fatigue)
const SKILL_UNLOCK_MIN_DIFFICULTY = 6; // Minimum difficulty for skill unlock
const SKILL_UNLOCK_CONSECUTIVE_PASSES = 3; // Number of consecutive passes needed

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

    const lessonBrief = lessonRun.lesson_brief as LessonBrief | null;
    const setup = (lessonRun.setup || {}) as Record<string, unknown>;
    const currentState = (lessonRun.state as LessonState) || {
      turn: 0,
      passStreak: 0,
      failStreak: 0,
      lastDecision: null,
      phase: "feedback",
    };
    const currentDifficulty = (lessonRun.difficulty || 1) as number;
    const localUserId = lessonRun.local_user_id as string | null;

    // Handle case where lesson_brief is not populated (free-form lessons from piano-learn)
    const lessonKey = lessonBrief?.lessonKey || lessonRun.lesson_node_key || "unknown";
    const lessonTitle = lessonBrief?.title || "Practice Exercise";
    const lessonGoal = lessonBrief?.goal || "Play the demonstrated sequence accurately";
    const awardedSkills = lessonBrief?.awardedSkills || [];

    // 2. Fetch skill unlock guidance from curriculum_nodes (if this is a curriculum lesson)
    let skillUnlockGuidance: SkillUnlockGuidance[] = [];
    if (awardedSkills.length > 0 && lessonRun.version_id) {
      const { data: nodeData } = await supabase
        .from("curriculum_nodes")
        .select("data")
        .eq("version_id", lessonRun.version_id)
        .eq("node_key", lessonKey)
        .maybeSingle();
      
      if (nodeData?.data) {
        const currData = nodeData.data as CurriculumNodeData;
        if (currData.skillUnlockGuidance) {
          skillUnlockGuidance = Object.entries(currData.skillUnlockGuidance).map(([skillKey, guidance]) => ({
            skillKey,
            guidance,
          }));
        }
      }
    }

    // 3. Check consecutive passes at difficulty >= SKILL_UNLOCK_MIN_DIFFICULTY for this lesson
    let consecutiveHighDiffPasses = 0;
    if (awardedSkills.length > 0 && localUserId) {
      // Query recent lesson_runs for this lesson and user, ordered by started_at desc
      const { data: recentRuns } = await supabase
        .from("lesson_runs")
        .select("id, difficulty, evaluation")
        .eq("lesson_node_key", lessonKey)
        .eq("local_user_id", localUserId)
        .order("started_at", { ascending: false })
        .limit(10);
      
      if (recentRuns) {
        // Count consecutive passes at high difficulty, starting from most recent
        // Include the current attempt if it passed
        const allRuns = [...recentRuns];
        
        for (const run of allRuns) {
          // Skip the current run (we'll add current attempt separately)
          if (run.id === lessonRunId) continue;
          
          const runDifficulty = (run.difficulty || 1) as number;
          const runEval = run.evaluation as string | null;
          
          if (runDifficulty >= SKILL_UNLOCK_MIN_DIFFICULTY && runEval === "pass") {
            consecutiveHighDiffPasses++;
          } else {
            break; // Stop counting at first non-qualifying run
          }
        }
      }
      
      // Add current attempt if it qualifies
      if (currentDifficulty >= SKILL_UNLOCK_MIN_DIFFICULTY && graderOutput.evaluation === "pass") {
        consecutiveHighDiffPasses++;
      }
    }

    // 4. Update streaks based on evaluation
    const newState: LessonState = {
      turn: currentState.turn + 1,
      passStreak: graderOutput.evaluation === "pass" ? currentState.passStreak + 1 : 0,
      failStreak: graderOutput.evaluation === "fail" ? currentState.failStreak + 1 : 
                  graderOutput.evaluation === "close" ? currentState.failStreak + 1 : 0,
      lastDecision: null, // Will be set after coach decides
      phase: "feedback",
    };

    // 5. Apply guardrails (deterministic suggestions for the coach)
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

    // 6. Build skill unlock status for the prompt
    const skillUnlockStatus = awardedSkills.length > 0 ? `
SKILL UNLOCK CRITERIA:
- General rule: ${SKILL_UNLOCK_CONSECUTIVE_PASSES} consecutive passes at difficulty ${SKILL_UNLOCK_MIN_DIFFICULTY}+ required to unlock skills
- Current difficulty: ${currentDifficulty}
- Consecutive high-difficulty passes: ${consecutiveHighDiffPasses}/${SKILL_UNLOCK_CONSECUTIVE_PASSES}
- Qualifies for unlock: ${consecutiveHighDiffPasses >= SKILL_UNLOCK_CONSECUTIVE_PASSES ? "YES" : "NO"}

SKILLS THAT CAN BE AWARDED:
${awardedSkills.map(sk => {
  const guidance = skillUnlockGuidance.find(g => g.skillKey === sk);
  return `- ${sk}${guidance ? `: ${guidance.guidance}` : ""}`;
}).join("\n")}

DECISION GUIDANCE:
- Set awardSkills to TRUE only if the student has ${SKILL_UNLOCK_CONSECUTIVE_PASSES}+ consecutive passes at difficulty ${SKILL_UNLOCK_MIN_DIFFICULTY}+
- Current status: ${consecutiveHighDiffPasses >= SKILL_UNLOCK_CONSECUTIVE_PASSES 
    ? "AWARD SKILLS - Criteria met!" 
    : `NOT YET - Need ${SKILL_UNLOCK_CONSECUTIVE_PASSES - consecutiveHighDiffPasses} more consecutive passes at difficulty ${SKILL_UNLOCK_MIN_DIFFICULTY}+`}` 
    : "";

    // 7. Build Coach prompt
    const systemPrompt = `You are a supportive piano lesson coach. Your job is to give encouraging feedback and decide what happens next.
You trust the grader's assessment completely - do NOT re-evaluate the performance.

LESSON BRIEF:
- Key: ${lessonKey}
- Title: ${lessonTitle}
- Goal: ${lessonGoal}
${awardedSkills.length > 0 ? `- Skills that can be awarded: ${awardedSkills.join(", ")}` : "- No skills are awarded by this lesson"}

CURRENT SETUP:
- BPM: ${setup.bpm || 80}
- Meter: ${setup.meter || "4/4"}
- Bars: ${setup.bars || 2}
- Difficulty: ${currentDifficulty}

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
${skillUnlockStatus}

YOUR AVAILABLE ACTIONS:
- RETRY_SAME: Have them try again with the same setup
- MAKE_EASIER: Reduce difficulty (slower BPM, fewer bars, etc.)
- MAKE_HARDER: Increase difficulty (faster BPM, more bars, etc.)
- EXIT_TO_MAIN_TEACHER: End this lesson, return to lesson selection

SKILL AWARD GUIDANCE:

General Rule: Only award a skill if the user has been successful on an exercise with a difficulty at or above 6 for 3 consecutive times.

Current Status:
- Has 3 consecutive passes at difficulty >= 6: ${hasThreeConsecutivePassesAtDifficulty6 ? "YES" : "NO"}
- Current difficulty: ${lessonRun.difficulty || 1}
- Current evaluation: ${graderOutput.evaluation}
- Pass streak: ${newState.passStreak}

${awardedSkills.length > 0 ? `Specific Guidance for Each Skill:
${awardedSkills.map(skillKey => {
  const guidance = skillGuidanceMap.get(skillKey);
  return `- ${skillKey}: ${guidance || "No specific guidance provided"}`;
}).join("\n")}` : ""}

You should award skills when:
- The student has demonstrated consistent mastery (3 consecutive passes at difficulty >= 6)
- The student is ready to move on (EXIT_TO_MAIN_TEACHER or MAKE_HARDER)
- The performance shows genuine understanding, not just luck

Do NOT award skills if:
- The student has not met the 3 consecutive passes at difficulty >= 6 requirement
- The student is still struggling (failStreak > 0)
- The passes seem accidental or inconsistent
- You're making the lesson easier (MAKE_EASIER)

Set awardSkills to true ONLY when you genuinely believe the student has mastered the skill according to the criteria above.

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
          skillUnlockStatus: {
            awardedSkills,
            skillUnlockGuidance,
            consecutiveHighDiffPasses,
            meetsUnlockCriteria: consecutiveHighDiffPasses >= SKILL_UNLOCK_CONSECUTIVE_PASSES,
            currentDifficulty,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 8. Call LLM with tool calling for structured output
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
                  awardSkills: {
                    type: "boolean",
                    description: `Whether to award the lesson's skills. ONLY set to true if ${SKILL_UNLOCK_CONSECUTIVE_PASSES}+ consecutive passes at difficulty ${SKILL_UNLOCK_MIN_DIFFICULTY}+ have been achieved.`,
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
      // Fallback based on guardrails or grader suggestion - NO automatic skill awarding
      coachOutput = {
        feedbackText: graderOutput.evaluation === "pass" 
          ? "Good job! Let's keep going." 
          : "Nice try! Let's give it another shot.",
        nextAction: suggestedAction || "RETRY_SAME",
        awardSkills: false, // Never auto-award in fallback
      };
    }

    // 9. Award skills ONLY if coach explicitly says awardSkills === true
    const awardedSkillKeys: string[] = [];
    if (coachOutput.awardSkills === true && awardedSkills.length > 0 && localUserId) {
      console.log("Awarding skills (coach approved):", awardedSkills);
      
      for (const skillKey of awardedSkills) {
        const { error: upsertError } = await supabase
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

        if (upsertError) {
          console.error("Error upserting skill:", skillKey, upsertError);
        } else {
          awardedSkillKeys.push(skillKey);
          console.log("Awarded skill:", skillKey, "to user:", localUserId);
        }
      }
    }

    // 10. Update lesson state with decision
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
      evaluation: graderOutput.evaluation, // Store the evaluation for consecutive pass tracking
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

    console.log("Coach decision:", lessonRunId, coachOutput.nextAction, 
      "Awarded:", awardedSkillKeys, 
      "ConsecutiveHighDiffPasses:", consecutiveHighDiffPasses);

    return new Response(JSON.stringify({
      ...coachOutput,
      state: newState,
      setup: newSetup,
      awardedSkills: awardedSkillKeys,
      skillUnlockProgress: {
        consecutiveHighDiffPasses,
        required: SKILL_UNLOCK_CONSECUTIVE_PASSES,
        minDifficulty: SKILL_UNLOCK_MIN_DIFFICULTY,
        currentDifficulty,
      },
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
