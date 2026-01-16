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
  importance: string;
  description: string;
  occurrences: string[];
}

interface TuneNugget {
  id: string;
  label: string;
  location: { 
    measures?: [number, number]; 
    startMeasure?: number;
    endMeasure?: number;
    startBeat?: number; 
    endBeat?: number;
  };
  staffFocus: string | { primary?: string };
  priority: number;
  difficulty: number | { level?: number };
  dependsOn: string[];
  teacherHints: {
    goal: string;
    counting?: string;
    commonMistakes?: string | string[];
    whatToListenFor?: string | string[];
  };
  practicePlan?: unknown;
  noteSequence?: unknown;
}

// Helper to extract measure range from nugget location
function getMeasureRange(n: TuneNugget): string {
  if (n.location.measures) {
    return `${n.location.measures[0]}-${n.location.measures[1]}`;
  }
  if (n.location.startMeasure !== undefined) {
    return `${n.location.startMeasure}-${n.location.endMeasure || n.location.startMeasure}`;
  }
  return "unknown";
}

// Helper to extract difficulty level
function getDifficulty(n: TuneNugget): number {
  if (typeof n.difficulty === "number") return n.difficulty;
  if (typeof n.difficulty === "object" && n.difficulty?.level !== undefined) return n.difficulty.level;
  return 1;
}

// Helper to extract staff focus
function getStaffFocus(n: TuneNugget): string {
  if (typeof n.staffFocus === "string") return n.staffFocus;
  if (typeof n.staffFocus === "object" && n.staffFocus?.primary) return n.staffFocus.primary;
  return "both";
}

interface TuneBriefing {
  title: string;
  schemaVersion: number;
  motifs: TuneMotif[];
  teachingOrder: string[];
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
  nuggetId: string;
  instruction: string;
  motifs: string[];
}

interface NoteEvent {
  startTime: number;
  endTime: number;
  pitch: number;
  velocity: number;
}

interface NoteSequence {
  notes: NoteEvent[];
  totalTime: number;
  tempos?: Array<{ qpm: number; time: number }>;
  timeSignatures?: Array<{ numerator: number; denominator: number; time: number }>;
}

// Helper to convert measure/beat locations to time boundaries
function getMeasureTimes(
  location: TuneNugget["location"],
  tempoQpm: number = 120,
  beatsPerMeasure: number = 4
): { startTime: number; endTime: number } {
  const secondsPerBeat = 60 / tempoQpm;
  
  let startMeasure: number;
  let endMeasure: number;
  
  if (location.measures) {
    startMeasure = location.measures[0];
    endMeasure = location.measures[1];
  } else {
    startMeasure = location.startMeasure ?? 1;
    endMeasure = location.endMeasure ?? startMeasure;
  }
  
  const startBeat = (startMeasure - 1) * beatsPerMeasure + (location.startBeat ?? 1) - 1;
  const endBeat = (endMeasure) * beatsPerMeasure; // End of the last measure
  
  return {
    startTime: startBeat * secondsPerBeat,
    endTime: endBeat * secondsPerBeat
  };
}

// Helper to slice a note sequence to a time range
function sliceNoteSequence(
  fullSequence: NoteSequence,
  startTime: number,
  endTime: number
): NoteSequence {
  if (!fullSequence?.notes?.length) {
    return { notes: [], totalTime: 0 };
  }
  
  const slicedNotes = fullSequence.notes
    .filter((n) => n.startTime >= startTime && n.startTime < endTime)
    .map((n) => ({
      ...n,
      startTime: n.startTime - startTime,
      endTime: n.endTime - startTime
    }));
  
  return {
    notes: slicedNotes,
    totalTime: endTime - startTime,
    tempos: fullSequence.tempos,
    timeSignatures: fullSequence.timeSignatures
  };
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

    console.log(`[tune-coach] Loaded tune: ${briefing.title}, ${nuggets.length} nuggets, ${briefing.motifs?.length || 0} motifs`);

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

    // 4. Build LLM prompt
    const systemPrompt = `You are a piano practice coach. Your job is to create a personalized practice plan for a student working on "${briefing.title}".

STUDENT CONTEXT:
${localUserId ? `- Student ID: ${localUserId}` : "- New student (no ID)"}
- Language preference: ${language}

TUNE OVERVIEW:
- Title: ${briefing.title}
- Total nuggets: ${nuggets.length}
- Teaching order: ${briefing.teachingOrder?.join(", ") || "N1, N2, N3..."}

MOTIFS IN THIS TUNE:
${(briefing.motifs || []).map((m) => `- ${m.id} (${m.label}): ${m.description} [Importance: ${m.importance}]`).join("\n")}

AVAILABLE NUGGETS:
${nuggets.map((n) => {
  const state = statesMap.get(n.id);
  const motifLabels = n.dependsOn?.join(", ") || "none";
  const measureRange = getMeasureRange(n);
  const difficulty = getDifficulty(n);
  const staffFocus = getStaffFocus(n);
  return `- ${n.id} "${n.label}" (measures ${measureRange})
    Difficulty: ${difficulty}, Staff: ${staffFocus}, Motifs: [${motifLabels}]
    Goal: ${n.teacherHints?.goal || "Practice this section"}
    Practice history: ${state ? `${state.attempt_count} attempts, ${state.pass_count} passes, streak: ${state.current_streak}` : "Never practiced"}`;
}).join("\n")}

## Practice Plan Guidelines

Create a prioritized list of 3-5 nuggets for the student to practice.

**Sequencing Rules:**
1. PREFER nuggets that are adjacent in the tune (e.g., N1 then N2, or N3 then N4)
   - This helps the student feel the musical flow between sections
   - Sequential practice builds muscle memory for transitions

2. AVOID placing nuggets with the same primary motif consecutively
   - Check each nugget's dependsOn array for motif IDs (M1, M2, etc.)
   - Variety in motifs keeps practice engaging and builds broader skills
   - Example: If N1 depends on [M1, M3] and N3 also depends on [M1, M3], don't put them back-to-back

3. Consider the student's history:
   - Prioritize nuggets with low streak counts (need more practice)
   - Include nuggets they haven't practiced yet
   - Mix in mastered nuggets occasionally for confidence

4. Follow the teachingOrder as a general guide, but adapt based on student needs

5. For each nugget, provide a brief, encouraging instruction using the teacherHints

RESPONSE:
Return a practice plan with 3-5 nuggets and an encouraging message.`;

    const userPrompt = `Create a practice plan for this student based on their history and the guidelines above.`;

    const composedPrompt = `SYSTEM:\n${systemPrompt}\n\nUSER:\n${userPrompt}`;

    const toolsDefinition = [
      {
        type: "function",
        function: {
          name: "submit_practice_plan",
          description: "Submit the practice plan with prioritized nuggets",
          parameters: {
            type: "object",
            properties: {
              practicePlan: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    nuggetId: { type: "string", description: "The nugget ID (e.g., N1, N2)" },
                    instruction: { type: "string", description: "Brief instruction/goal for this nugget" },
                    motifs: { type: "array", items: { type: "string" }, description: "Motif IDs this nugget teaches" },
                  },
                  required: ["nuggetId", "instruction", "motifs"],
                },
                description: "Ordered list of 3-5 nuggets to practice",
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
          practiceHistory,
          nuggets: nuggets.map((n) => ({
            id: n.id,
            label: n.label,
            noteSequence: n.noteSequence,
            teacherHints: n.teacherHints,
            dependsOn: n.dependsOn,
          })),
          motifsSummary: briefing.motifs || [],
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

    // Get full note sequence and tempo info for runtime slicing
    const fullNoteSequence = tuneAsset.note_sequence as NoteSequence | null;
    const tempoQpm = fullNoteSequence?.tempos?.[0]?.qpm || 120;
    const beatsPerMeasure = fullNoteSequence?.timeSignatures?.[0]?.numerator || 4;
    
    console.log(`[tune-coach] Full sequence has ${fullNoteSequence?.notes?.length || 0} notes, tempo: ${tempoQpm} qpm`);

    // Enrich practice plan with full nugget data and sliced note sequences
    const enrichedPlan = planResult.practicePlan.map((item) => {
      const nugget = nuggets.find((n) => n.id === item.nuggetId);
      if (!nugget) return null;
      
      // Check if nugget already has a valid note sequence
      let noteSequence = nugget.noteSequence as NoteSequence | undefined;
      const hasValidSequence = noteSequence?.notes && noteSequence.notes.length > 0;
      
      // If no valid sequence, slice from full tune sequence
      if (!hasValidSequence && fullNoteSequence?.notes?.length) {
        const times = getMeasureTimes(nugget.location, tempoQpm, beatsPerMeasure);
        noteSequence = sliceNoteSequence(fullNoteSequence, times.startTime, times.endTime);
        console.log(`[tune-coach] Sliced ${item.nuggetId}: ${noteSequence.notes.length} notes (${times.startTime.toFixed(2)}s - ${times.endTime.toFixed(2)}s)`);
      }
      
      return {
        nuggetId: item.nuggetId,
        nugget: { ...nugget, noteSequence },
        instruction: item.instruction,
        motifs: item.motifs,
      };
    }).filter((item) => item !== null);

    return new Response(
      JSON.stringify({
        practicePlan: enrichedPlan,
        encouragement: planResult.encouragement,
        tuneTitle: briefing.title,
        motifsSummary: briefing.motifs || [],
        practiceHistory,
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
