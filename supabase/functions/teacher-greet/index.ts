import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Note {
  pitch: number;
  startTime: number;
  endTime: number;
  velocity?: number;
}

interface LessonNode {
  key: string;
  title: string;
  goal: string;
  setupGuidance?: string;
  evaluationGuidance?: string;
  difficultyGuidance?: string;
}

interface SkillNode {
  key: string;
  title: string;
  description?: string;
  unlockGuidance?: string;
}

interface TrackNode {
  key: string;
  title: string;
  description?: string;
  startLesson?: string;
}

interface Edge {
  source_key: string;
  target_key: string;
  edge_type: string;
}

interface LessonRun {
  id: string;
  lesson_node_key: string;
  started_at: string;
  ended_at: string | null;
  evaluation: string | null;
  difficulty: number;
  setup: Record<string, unknown>;
  attempt_count: number;
}

interface SkillState {
  skill_key: string;
  unlocked: boolean;
  mastery: number;
  last_practiced_at: string | null;
}

interface CandidateActivity {
  lessonKey: string;
  title: string;
  goal: string;
  category: "continue" | "progress" | "balance" | "remediate";
  trackKey?: string;
  lastPracticed?: string | null;
  lastEvaluations?: string[];
  lastDifficulty?: number;
  attemptsLast7Days?: number;
}

interface TeacherSuggestion {
  lessonKey: string;
  label: string;
  why: string;
  trackTitle: string;
}

interface TeacherResponse {
  greeting: string;
  suggestions: TeacherSuggestion[];
  notes: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      language = "en",
      debug = false,
      localUserId = null,
    } = await req.json();

    console.log(
      `[teacher-greet] Request received - language: ${language}, debug: ${debug}, localUserId: ${localUserId}`
    );

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch latest published curriculum snapshot
    const { data: exportData, error: exportError } = await supabase
      .from("curriculum_exports")
      .select("snapshot, version_id")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (exportError) {
      console.error("Error fetching curriculum export:", exportError);
      throw new Error("Failed to fetch curriculum");
    }

    if (!exportData) {
      // No published curriculum yet, return a simple greeting
      return new Response(
        JSON.stringify({
          greeting:
            language === "fr"
              ? "Bienvenue ! Le curriculum n'est pas encore disponible. Essayez le mode libre pour commencer."
              : "Welcome! The curriculum isn't published yet. Try free practice mode to get started.",
          suggestions: [],
          notes: null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Snapshot schema: { tracks, lessons, skills, edges }
    const snapshot = exportData.snapshot as {
      tracks: Array<{ trackKey: string; title: string; description?: string }>;
      lessons: Array<{
        lessonKey: string;
        title: string;
        goal?: string;
        setupGuidance?: string;
        evaluationGuidance?: string;
        difficultyGuidance?: string;
      }>;
      skills: Array<{
        skillKey: string;
        title: string;
        description?: string;
        unlockGuidance?: string;
      }>;
      edges?: Array<{
        source_key: string;
        target_key: string;
        edge_type: string;
      }>;
    };

    // Parse curriculum data from snapshot
    const edges: Edge[] = (snapshot.edges || []).map((e) => ({
      source_key: e.source_key,
      target_key: e.target_key,
      edge_type: e.edge_type,
    }));

    const tracks: TrackNode[] = (snapshot.tracks || []).map((t) => {
      const startEdge = edges.find(
        (e) =>
          e.source_key === t.trackKey && e.edge_type === "track_starts_with"
      );
      return {
        key: t.trackKey,
        title: t.title || t.trackKey,
        description: t.description,
        startLesson: startEdge?.target_key,
      };
    });

    const lessons: Map<string, LessonNode> = new Map();
    for (const l of snapshot.lessons || []) {
      lessons.set(l.lessonKey, {
        key: l.lessonKey,
        title: l.title || l.lessonKey,
        goal: l.goal || "",
        setupGuidance: l.setupGuidance,
        evaluationGuidance: l.evaluationGuidance,
        difficultyGuidance: l.difficultyGuidance,
      });
    }

    const skills: Map<string, SkillNode> = new Map();
    for (const s of snapshot.skills || []) {
      skills.set(s.skillKey, {
        key: s.skillKey,
        title: s.title || s.skillKey,
        description: s.description,
        unlockGuidance: s.unlockGuidance,
      });
    }

    console.log(
      `[teacher-greet] Curriculum loaded: ${tracks.length} tracks, ${lessons.size} lessons, ${skills.size} skills, ${edges.length} edges`
    );

    // Build edge lookups
    const lessonNextEdges = edges.filter((e) => e.edge_type === "lesson_next");
    const lessonRequiresEdges = edges.filter(
      (e) => e.edge_type === "lesson_requires_skill"
    );
    const lessonAwardsEdges = edges.filter(
      (e) => e.edge_type === "lesson_awards_skill"
    );
    const trackRequiresEdges = edges.filter(
      (e) => e.edge_type === "track_requires_skill"
    );

    // 2. Fetch user activity data (filtered by localUserId if provided)
    let runsQuery = supabase
      .from("lesson_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(20);

    if (localUserId) {
      runsQuery = runsQuery.eq("local_user_id", localUserId);
    }

    const { data: recentRuns, error: runsError } = await runsQuery;

    if (runsError) {
      console.error("Error fetching lesson runs:", runsError);
    }

    const lessonRuns: LessonRun[] = (recentRuns || []) as LessonRun[];

    let skillsQuery = supabase.from("user_skill_state").select("*");

    if (localUserId) {
      skillsQuery = skillsQuery.eq("local_user_id", localUserId);
    }

    const { data: skillStates, error: skillsError } = await skillsQuery;

    if (skillsError) {
      console.error("Error fetching skill states:", skillsError);
    }

    console.log(
      `[teacher-greet] Activity data: ${lessonRuns.length} runs, ${
        (skillStates || []).length
      } skill states for user ${localUserId || "all"}`
    );

    const unlockedSkills = new Set(
      ((skillStates || []) as SkillState[])
        .filter((s) => s.unlocked)
        .map((s) => s.skill_key)
    );

    // 3. Compute accessible lessons per track
    const accessibleLessons: Map<string, Set<string>> = new Map();
    const nextLessonAfter: Map<string, string> = new Map();

    for (const track of tracks) {
      const accessible = new Set<string>();
      const visited = new Set<string>();

      // Check track-level requirements
      const trackRequiredSkills = trackRequiresEdges
        .filter((e) => e.source_key === track.key)
        .map((e) => e.target_key);
      const trackRequirementsMet =
        trackRequiredSkills.length === 0 ||
        trackRequiredSkills.every((sk) => unlockedSkills.has(sk));

      // If track has requirements and they're not met, skip this track
      if (trackRequiredSkills.length > 0 && !trackRequirementsMet) {
        accessibleLessons.set(track.key, accessible);
        continue;
      }

      let current = track.startLesson;
      while (current && !visited.has(current)) {
        visited.add(current);
        const lesson = lessons.get(current);
        if (!lesson) break;

        // Get THIS lesson's required skills (not accumulated)
        const lessonRequiredSkills = lessonRequiresEdges
          .filter((e) => e.source_key === current)
          .map((e) => e.target_key);

        // Lesson is accessible if:
        // 1. It has no requirements, OR
        // 2. All its requirements are unlocked
        const lessonRequirementsMet =
          lessonRequiredSkills.length === 0 ||
          lessonRequiredSkills.every((sk) => unlockedSkills.has(sk));

        if (lessonRequirementsMet) {
          accessible.add(current);
        }

        // Find next lesson
        const nextEdge = lessonNextEdges.find((e) => e.source_key === current);
        if (nextEdge) {
          nextLessonAfter.set(current, nextEdge.target_key);
        }
        current = nextEdge?.target_key;
      }

      accessibleLessons.set(track.key, accessible);
    }

    // Build available lessons list (lessons where requirements are fulfilled)
    const availableLessons: Array<{
      lessonKey: string;
      title: string;
      goal: string;
      trackKey: string;
      trackTitle: string;
    }> = [];

    for (const [trackKey, accessibleLessonKeys] of accessibleLessons) {
      const track = tracks.find((t) => t.key === trackKey);
      const trackTitle = track?.title || trackKey;

      for (const lessonKey of accessibleLessonKeys) {
        const lesson = lessons.get(lessonKey);
        if (lesson) {
          availableLessons.push({
            lessonKey,
            title: lesson.title,
            goal: lesson.goal,
            trackKey,
            trackTitle,
          });
        }
      }
    }

    // 4. Calculate signals and prepare practice history
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const timeSinceLastPracticeHours =
      lessonRuns.length > 0
        ? Math.round(
            (now.getTime() - new Date(lessonRuns[0].started_at).getTime()) /
              (1000 * 60 * 60)
          )
        : null;

    // Group runs by lesson
    const runsByLesson: Map<string, LessonRun[]> = new Map();
    for (const run of lessonRuns) {
      const key = run.lesson_node_key;
      if (!runsByLesson.has(key)) {
        runsByLesson.set(key, []);
      }
      runsByLesson.get(key)!.push(run);
    }

    // Build comprehensive practice history for LLM
    const practiceHistory = availableLessons.map((lesson) => {
      const runs = runsByLesson.get(lesson.lessonKey) || [];
      const recentRuns = runs.slice(0, 5);
      const attemptsLast7Days = runs.filter(
        (r) => new Date(r.started_at) >= sevenDaysAgo
      ).length;
      const lastRun = runs[0];

      return {
        lessonKey: lesson.lessonKey,
        title: lesson.title,
        trackTitle: lesson.trackTitle,
        lastPracticed: lastRun?.started_at || null,
        lastEvaluation: lastRun?.evaluation || null,
        lastDifficulty: lastRun?.difficulty || null,
        attemptsTotal: runs.length,
        attemptsLast7Days,
        recentEvaluations: recentRuns.map((r) => r.evaluation || "none"),
      };
    });

    const lessonRunsSummary = lessonRuns.slice(0, 20).map((r) => ({
      lessonKey: r.lesson_node_key,
      startedAt: r.started_at,
      evaluation: r.evaluation,
      difficulty: r.difficulty,
    }));

    // 5. Build LLM prompt
    const systemPrompt = `You are the Teacher agent for an app teaching music through piano.

Your job when the user opens Learning mode:
1) Greet the user briefly, taking into account if you interacted with them on the day
2) Look at their recent activity and performance.
3) Propose 1 to 4 next activities (lesson choices) that the user can pick from.
4) Keep it lightweight and motivating. No lecturing. No long explanations.

Important rules:
- The user can choose; you are advising, not forcing.
- Use ONLY the provided available lessons. Do not invent lessons or skills not present.
- If the user hasn't practiced in a long time, recommend an easier re-entry choice.
- Balance: avoid always recommending the same track; include variety when appropriate.
- Consider the user's practice history: what they've practiced, how they performed, and what makes sense next.
- IMPORTANT: The "label" field should be a SHORT, human-friendly activity name. Do NOT include lesson keys (like "A1.4" or "B2.1") in the label. Example: "Eighth notes practice" NOT "A1.4: Eighth notes practice".
- REQUIRED: The "trackTitle" field MUST match one of the track titles from the available lessons. Each lesson belongs to exactly one track.
- REQUIRED: The "notes" field MUST be included and should briefly explain to the user why you're suggesting these activities. Focus on their progress, recent practice, and what makes sense for them today.

Return ONLY valid JSON following the schema provided.`;

    // Build lesson-to-track mapping for validation
    const lessonToTrackMap: Map<
      string,
      { trackKey: string; trackTitle: string }
    > = new Map();
    const trackStartsEdges = edges.filter(
      (e) => e.edge_type === "track_starts_with"
    );
    const lessonNextEdgesLocal = edges.filter(
      (e) => e.edge_type === "lesson_next"
    );

    const lessonNextMap: Map<string, string> = new Map();
    for (const edge of lessonNextEdgesLocal) {
      lessonNextMap.set(edge.source_key, edge.target_key);
    }

    for (const startEdge of trackStartsEdges) {
      const trackKey = startEdge.source_key;
      const track = tracks.find((t) => t.key === trackKey);
      const trackTitle = track?.title || trackKey;
      let currentLesson = startEdge.target_key;

      lessonToTrackMap.set(currentLesson, { trackKey, trackTitle });

      while (lessonNextMap.has(currentLesson)) {
        currentLesson = lessonNextMap.get(currentLesson)!;
        lessonToTrackMap.set(currentLesson, { trackKey, trackTitle });
      }
    }

    const userPrompt = `CONTEXT (today):
- locale: ${language}
- now: ${now.toISOString()}
- timeSinceLastPracticeHours: ${timeSinceLastPracticeHours ?? "never practiced"}

AVAILABLE LESSONS (requirements fulfilled - user can access these):
${JSON.stringify(availableLessons, null, 2)}

PRACTICE HISTORY (for each available lesson):
${JSON.stringify(practiceHistory, null, 2)}

RECENT ACTIVITY (chronological list of recent lesson runs):
${JSON.stringify(lessonRunsSummary, null, 2)}

OUTPUT JSON SCHEMA:
{
  "greeting": "string",
  "suggestions": [
    {
      "lessonKey": "string (must be from AVAILABLE LESSONS)",
      "label": "string (short activity name, NO lesson keys like A1.4)",
      "why": "string",
      "trackTitle": "string (REQUIRED: must match the trackTitle from AVAILABLE LESSONS)"
    }
  ],
  "notes": "string (REQUIRED: Brief explanation to the user about why you picked these lessons)"
}`;

    // If debug mode, return context without calling LLM
    if (debug) {
      const fullPrompt = `SYSTEM:\n${systemPrompt}\n\nUSER:\n${userPrompt}`;
      return new Response(
        JSON.stringify({
          debug: true,
          curriculum: {
            tracksCount: tracks.length,
            lessonsCount: lessons.size,
            skillsCount: skills.size,
            edgesCount: edges.length,
            availableLessonsCount: availableLessons.length,
            availableLessons: availableLessons,
          },
          practiceHistory,
          signals: {
            timeSinceLastPracticeHours,
            recentRunsCount: lessonRuns.length,
            unlockedSkillsCount: unlockedSkills.size,
          },
          prompt: fullPrompt,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. Call LLM
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const llmResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
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
        }),
      }
    );

    // Build fallback response from available lessons (used if LLM fails)
    const buildFallbackResponse = (): TeacherResponse => {
      // Pick first few available lessons as fallback
      const fallbackLessons = availableLessons.slice(0, 3);
      return {
        greeting:
          language === "fr"
            ? "Bonjour ! Prêt à pratiquer ?"
            : "Hello! Ready to practice?",
        suggestions: fallbackLessons.map((lesson) => ({
          lessonKey: lesson.lessonKey,
          label: lesson.title,
          why: lesson.goal,
          trackTitle: lesson.trackTitle,
        })),
        notes: null,
      };
    };

    let teacherResponse: TeacherResponse;

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      console.error("LLM error:", llmResponse.status, errorText);

      // Use fallback response instead of returning error
      // This way users can still practice even if LLM is unavailable
      console.log("Using fallback response due to LLM error");
      teacherResponse = buildFallbackResponse();
    } else {
      const llmData = await llmResponse.json();
      const rawContent = llmData.choices?.[0]?.message?.content || "";

      // Parse JSON from response
      try {
        // Try to extract JSON from markdown code blocks
        const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
        const jsonStr = jsonMatch ? jsonMatch[1].trim() : rawContent.trim();
        teacherResponse = JSON.parse(jsonStr);
      } catch (parseError) {
        console.error("Failed to parse LLM response:", parseError, rawContent);
        teacherResponse = buildFallbackResponse();
      }
    }

    // Validate suggestions - ensure lessonKey exists in available lessons
    const availableLessonKeys = new Set(
      availableLessons.map((l) => l.lessonKey)
    );
    const validatedSuggestions = teacherResponse.suggestions
      .filter((s) => availableLessonKeys.has(s.lessonKey))
      .map((s) => {
        // Use LLM-provided trackTitle, fallback to our mapping if missing
        const lesson = availableLessons.find(
          (l) => l.lessonKey === s.lessonKey
        );
        return {
          lessonKey: s.lessonKey,
          label: s.label,
          why: s.why,
          trackTitle: s.trackTitle || lesson?.trackTitle || "",
        };
      });

    return new Response(
      JSON.stringify({
        greeting: teacherResponse.greeting,
        suggestions: validatedSuggestions,
        notes: teacherResponse.notes,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in teacher-greet:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
