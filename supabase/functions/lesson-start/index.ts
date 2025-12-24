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

interface LessonRunSetup {
  bpm?: number;
  meter?: string;
  feel?: string;
  bars?: number;
  countInBars?: number;
}

interface LessonMetronomeSettings {
  bpm?: number;
  timeSignature?: string;
  isActive?: boolean;
  feel?: string;
  soundType?: string;
  accentPreset?: string;
}

interface LessonBrief {
  lessonKey: string;
  title: string;
  goal: string;
  setupGuidance: string;
  evaluationGuidance: string;
  difficultyGuidance: string;
  requiredSkills: string[];
  awardedSkills: string[];
  nextLessonKey: string | null;
}

interface LessonStartResponse {
  lessonRunId: string;
  instruction: string;
  demoSequence?: NoteSequence;
  setup: LessonRunSetup;
  metronome?: LessonMetronomeSettings;
  lessonBrief: LessonBrief;
  composedPrompt?: string;
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
    const { lessonKey, suggestionHint, language = "en", debug = false } = await req.json();

    if (!lessonKey) {
      return new Response(
        JSON.stringify({ error: "lessonKey is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Get latest published curriculum version
    const { data: latestVersion, error: versionError } = await supabase
      .from("curriculum_versions")
      .select("id, version_number, title")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (versionError || !latestVersion) {
      console.error("Error fetching published version:", versionError);
      return new Response(
        JSON.stringify({ error: "No published curriculum found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Fetch the lesson node
    const { data: lessonNode, error: nodeError } = await supabase
      .from("curriculum_nodes")
      .select("*")
      .eq("version_id", latestVersion.id)
      .eq("node_key", lessonKey)
      .eq("node_type", "lesson")
      .maybeSingle();

    if (nodeError || !lessonNode) {
      console.error("Error fetching lesson node:", nodeError);
      return new Response(
        JSON.stringify({ error: `Lesson '${lessonKey}' not found in published curriculum` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Fetch related edges (requires_skill, awards_skill, lesson_next)
    const { data: edges, error: edgesError } = await supabase
      .from("curriculum_edges")
      .select("*")
      .eq("version_id", latestVersion.id)
      .or(`source_key.eq.${lessonKey},target_key.eq.${lessonKey}`);

    if (edgesError) {
      console.error("Error fetching edges:", edgesError);
    }

    const requiredSkills: string[] = [];
    const awardedSkills: string[] = [];
    let nextLessonKey: string | null = null;

    for (const edge of edges || []) {
      if (edge.source_key === lessonKey) {
        if (edge.edge_type === "lesson_awards_skill") {
          awardedSkills.push(edge.target_key);
        } else if (edge.edge_type === "lesson_next") {
          nextLessonKey = edge.target_key;
        }
      } else if (edge.target_key === lessonKey) {
        if (edge.edge_type === "lesson_requires_skill") {
          requiredSkills.push(edge.source_key);
        }
      }
    }

    // 4. Fetch user's recent runs for this lesson (for context)
    const { data: recentRuns, error: runsError } = await supabase
      .from("lesson_runs")
      .select("*")
      .eq("lesson_node_key", lessonKey)
      .order("started_at", { ascending: false })
      .limit(5);

    if (runsError) {
      console.error("Error fetching recent runs:", runsError);
    }

    // 5. Compile Lesson Brief
    const lessonData = lessonNode.data as Record<string, unknown>;
    const lessonBrief: LessonBrief = {
      lessonKey,
      title: (lessonData.label as string) || lessonKey,
      goal: (lessonData.goal as string) || (lessonData.prompt as string) || "Complete the exercise",
      setupGuidance: (lessonData.setupGuidance as string) || "",
      evaluationGuidance: (lessonData.evaluationGuidance as string) || "",
      difficultyGuidance: (lessonData.difficultyGuidance as string) || "",
      requiredSkills,
      awardedSkills,
      nextLessonKey,
    };

    // 6. Build initial setup from suggestionHint or defaults
    const setup: LessonRunSetup = {
      bpm: suggestionHint?.bpm || 80,
      meter: suggestionHint?.meter || "4/4",
      feel: suggestionHint?.feel || "straight_beats",
      bars: suggestionHint?.bars || 2,
      countInBars: suggestionHint?.countInBars || 1,
    };

    // 7. Build Coach INTRO prompt
    const recentRunsSummary = (recentRuns || []).map(run => ({
      evaluation: run.evaluation,
      difficulty: run.difficulty,
      attemptCount: run.attempt_count,
      startedAt: run.started_at,
    }));

    const systemPrompt = `You are a piano lesson coach. Your role is to introduce a lesson and optionally provide a short demo sequence for the student to replicate.

LESSON BRIEF:
- Key: ${lessonBrief.lessonKey}
- Title: ${lessonBrief.title}
- Goal: ${lessonBrief.goal}
${lessonBrief.setupGuidance ? `- Setup Guidance: ${lessonBrief.setupGuidance}` : ""}
${lessonBrief.difficultyGuidance ? `- Difficulty Guidance: ${lessonBrief.difficultyGuidance}` : ""}
- Required Skills: ${requiredSkills.length > 0 ? requiredSkills.join(", ") : "None"}
- Awards Skills: ${awardedSkills.length > 0 ? awardedSkills.join(", ") : "None"}

INITIAL SETUP:
- BPM: ${setup.bpm}
- Meter: ${setup.meter}
- Feel: ${setup.feel}
- Bars: ${setup.bars}
- Count-in Bars: ${setup.countInBars}

${recentRunsSummary.length > 0 ? `RECENT ATTEMPTS (last ${recentRunsSummary.length}):
${JSON.stringify(recentRunsSummary, null, 2)}` : "This is the student's first attempt at this lesson."}

LANGUAGE: Respond in ${language === "fr" ? "French" : "English"}.

Your task:
1. Write a brief, encouraging instruction (2-3 sentences) explaining what the student will practice
2. Optionally generate a short demo sequence (NoteSequence) if the lesson involves specific notes/rhythm
3. Suggest any setup adjustments based on the student's history

The demo sequence should use MIDI pitch numbers (e.g., 60 = middle C, 62 = D, 64 = E).
Keep demos SHORT (2-8 notes, 1-2 bars max).`;

    const userPrompt = `Generate the lesson introduction for "${lessonBrief.title}".

Return your response using the provided function.`;

    const composedPrompt = `SYSTEM:\n${systemPrompt}\n\nUSER:\n${userPrompt}`;

    // If debug mode, return the prompt without calling LLM
    if (debug) {
      return new Response(
        JSON.stringify({ prompt: composedPrompt, lessonBrief, setup }),
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
              name: "generate_lesson_intro",
              description: "Generate the lesson introduction with instruction and optional demo sequence",
              parameters: {
                type: "object",
                properties: {
                  instruction: {
                    type: "string",
                    description: "Brief, encouraging instruction explaining what the student will practice (2-3 sentences)",
                  },
                  demoSequence: {
                    type: "object",
                    description: "Optional demo sequence for the student to replicate",
                    properties: {
                      notes: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            pitch: { type: "number", description: "MIDI pitch (60 = middle C)" },
                            startTime: { type: "number", description: "Start time in seconds" },
                            endTime: { type: "number", description: "End time in seconds" },
                            velocity: { type: "number", description: "Velocity 0-127, default 80" },
                          },
                          required: ["pitch", "startTime", "endTime"],
                        },
                      },
                      totalTime: { type: "number", description: "Total duration in seconds" },
                    },
                    required: ["notes", "totalTime"],
                  },
                  setupAdjustments: {
                    type: "object",
                    description: "Optional adjustments to the initial setup",
                    properties: {
                      bpm: { type: "number" },
                      meter: { type: "string" },
                      feel: { type: "string" },
                      bars: { type: "number" },
                      countInBars: { type: "number" },
                    },
                  },
                  metronome: {
                    type: "object",
                    description: "Metronome settings for this lesson",
                    properties: {
                      bpm: { type: "number" },
                      timeSignature: { type: "string" },
                      isActive: { type: "boolean" },
                      feel: { type: "string" },
                    },
                  },
                },
                required: ["instruction"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_lesson_intro" } },
      }),
    });

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      console.error("LLM API error:", llmResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to generate lesson introduction" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const llmData = await llmResponse.json();
    console.log("LLM response:", JSON.stringify(llmData, null, 2));

    // Extract the tool call result
    let introData: {
      instruction: string;
      demoSequence?: NoteSequence;
      setupAdjustments?: Partial<LessonRunSetup>;
      metronome?: LessonMetronomeSettings;
    };

    try {
      const toolCall = llmData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        introData = JSON.parse(toolCall.function.arguments);
      } else {
        throw new Error("No tool call in response");
      }
    } catch (e) {
      console.error("Failed to parse LLM response:", e);
      // Fallback to a generic intro
      introData = {
        instruction: `Let's practice "${lessonBrief.title}". Listen to the demo, then try to replicate it when it's your turn.`,
      };
    }

    // Apply any setup adjustments
    const finalSetup: LessonRunSetup = {
      ...setup,
      ...introData.setupAdjustments,
    };

    // 9. Create lesson_run row
    const initialState = {
      turn: 0,
      passStreak: 0,
      failStreak: 0,
      lastDecision: null,
      phase: "intro",
    };

    const { data: lessonRun, error: insertError } = await supabase
      .from("lesson_runs")
      .insert({
        lesson_node_key: lessonKey,
        version_id: latestVersion.id,
        difficulty: suggestionHint?.difficulty?.value || 1,
        setup: finalSetup,
        lesson_brief: lessonBrief,
        demo_sequence: introData.demoSequence || null,
        state: initialState,
        ai_feedback: introData.instruction,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating lesson run:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create lesson run" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 10. Build response
    const response: LessonStartResponse = {
      lessonRunId: lessonRun.id,
      instruction: introData.instruction,
      demoSequence: introData.demoSequence,
      setup: finalSetup,
      metronome: introData.metronome || {
        bpm: finalSetup.bpm,
        timeSignature: finalSetup.meter,
        isActive: true,
        feel: finalSetup.feel,
      },
      lessonBrief,
      composedPrompt, // Include for debugging
    };

    console.log("Lesson started:", lessonRun.id);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in lesson-start:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
