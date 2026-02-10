import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface LessonNode {
  key: string;
  title: string;
  goal: string;
  level?: "beginner" | "intermediate" | "advanced";
  setupGuidance?: string;
  evaluationGuidance?: string;
  difficultyGuidance?: string;
}

interface TuneNode {
  key: string;
  title: string;
  description?: string;
  musicRef: string;
  level?: "beginner" | "intermediate" | "advanced";
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
  startItem?: string;
  startItemType?: "lesson" | "tune";
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

interface AvailableActivity {
  activityKey: string;
  activityType: "lesson" | "tune";
  title: string;
  goal?: string;
  description?: string;
  trackKey: string;
  trackTitle: string;
  level?: string;
  musicRef?: string;
}

interface TeacherSuggestion {
  activityKey: string;
  activityType: "lesson" | "tune";
  label: string;
  why: string;
  trackTitle: string;
  level?: string;
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

    // Snapshot schema: { tracks, lessons, skills, tunes, edges }
    const snapshot = exportData.snapshot as {
      tracks: Array<{ trackKey: string; title: string; description?: string }>;
      lessons: Array<{
        lessonKey: string;
        title: string;
        goal?: string;
        level?: string;
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
      tunes?: Array<{
        tuneKey: string;
        title: string;
        description?: string;
        musicRef: string;
        level?: string;
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

    // Build maps for lessons and tunes
    const lessons: Map<string, LessonNode> = new Map();
    for (const l of snapshot.lessons || []) {
      lessons.set(l.lessonKey, {
        key: l.lessonKey,
        title: l.title || l.lessonKey,
        goal: l.goal || "",
        level: l.level as "beginner" | "intermediate" | "advanced" | undefined,
        setupGuidance: l.setupGuidance,
        evaluationGuidance: l.evaluationGuidance,
        difficultyGuidance: l.difficultyGuidance,
      });
    }

    const tunes: Map<string, TuneNode> = new Map();
    for (const t of snapshot.tunes || []) {
      tunes.set(t.tuneKey, {
        key: t.tuneKey,
        title: t.title || t.tuneKey,
        description: t.description,
        musicRef: t.musicRef,
        level: t.level as "beginner" | "intermediate" | "advanced" | undefined,
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

    // Build tracks with start items (could be lesson or tune)
    const tracks: TrackNode[] = (snapshot.tracks || []).map((t) => {
      const startEdge = edges.find(
        (e) =>
          e.source_key === t.trackKey && e.edge_type === "track_starts_with"
      );
      let startItemType: "lesson" | "tune" | undefined;
      if (startEdge) {
        if (lessons.has(startEdge.target_key)) {
          startItemType = "lesson";
        } else if (tunes.has(startEdge.target_key)) {
          startItemType = "tune";
        }
      }
      return {
        key: t.trackKey,
        title: t.title || t.trackKey,
        description: t.description,
        startItem: startEdge?.target_key,
        startItemType,
      };
    });

    console.log(
      `[teacher-greet] Curriculum loaded: ${tracks.length} tracks, ${lessons.size} lessons, ${tunes.size} tunes, ${skills.size} skills, ${edges.length} edges`
    );

    // Build edge lookups
    const lessonNextEdges = edges.filter((e) => e.edge_type === "lesson_next");
    const tuneNextEdges = edges.filter((e) => e.edge_type === "tune_next");
    const lessonRequiresEdges = edges.filter(
      (e) => e.edge_type === "lesson_requires_skill"
    );
    const tuneRequiresEdges = edges.filter(
      (e) => e.edge_type === "tune_requires_skill"
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

    // Fetch acquired lessons
    let acquiredLessonsQuery = supabase
      .from("user_lesson_acquisition")
      .select("lesson_key");

    if (localUserId) {
      acquiredLessonsQuery = acquiredLessonsQuery.eq("local_user_id", localUserId);
    }

    const { data: acquiredLessons, error: acquiredLessonsError } = await acquiredLessonsQuery;

    if (acquiredLessonsError) {
      console.error("Error fetching acquired lessons:", acquiredLessonsError);
    }

    const acquiredLessonKeys = new Set(
      (acquiredLessons || []).map((a) => a.lesson_key)
    );

    // Fetch acquired tunes
    let acquiredTunesQuery = supabase
      .from("user_tune_acquisition")
      .select("tune_key");

    if (localUserId) {
      acquiredTunesQuery = acquiredTunesQuery.eq("local_user_id", localUserId);
    }

    const { data: acquiredTunes, error: acquiredTunesError } = await acquiredTunesQuery;

    if (acquiredTunesError) {
      console.error("Error fetching acquired tunes:", acquiredTunesError);
    }

    const acquiredTuneKeys = new Set(
      (acquiredTunes || []).map((a) => a.tune_key)
    );

    // Fetch tune practice runs (recent attempts)
    let tunePracticeRunsQuery = supabase
      .from("tune_practice_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(50);

    if (localUserId) {
      tunePracticeRunsQuery = tunePracticeRunsQuery.eq("local_user_id", localUserId);
    }

    const { data: tunePracticeRuns, error: tunePracticeRunsError } = await tunePracticeRunsQuery;

    if (tunePracticeRunsError) {
      console.error("Error fetching tune practice runs:", tunePracticeRunsError);
    }

    // Fetch tune nugget state (aggregate mastery per nugget)
    let tuneNuggetStateQuery = supabase
      .from("tune_nugget_state")
      .select("*");

    if (localUserId) {
      tuneNuggetStateQuery = tuneNuggetStateQuery.eq("local_user_id", localUserId);
    }

    const { data: tuneNuggetStates, error: tuneNuggetStateError } = await tuneNuggetStateQuery;

    if (tuneNuggetStateError) {
      console.error("Error fetching tune nugget state:", tuneNuggetStateError);
    }

    console.log(
      `[teacher-greet] Acquired items for user ${localUserId || "all"}: ${acquiredLessonKeys.size} lessons, ${acquiredTuneKeys.size} tunes, ${(tunePracticeRuns || []).length} tune practice runs, ${(tuneNuggetStates || []).length} tune nugget states`
    );

    // 3. Compute accessible activities (lessons and tunes) per track
    const availableActivities: AvailableActivity[] = [];

    // Helper to check if item requirements are met
    const checkRequirements = (
      itemKey: string,
      itemType: "lesson" | "tune"
    ): boolean => {
      const requiresEdges =
        itemType === "lesson" ? lessonRequiresEdges : tuneRequiresEdges;
      const requiredSkills = requiresEdges
        .filter((e) => e.source_key === itemKey)
        .map((e) => e.target_key);

      // Check skill requirements
      const skillsMet =
        requiredSkills.length === 0 ||
        requiredSkills.every((sk) => unlockedSkills.has(sk));

      if (itemType === "lesson") {
        // Check prerequisite lessons (previous lessons in lesson_next chain)
        const lessonRequiredLessons = lessonNextEdges
          .filter((e) => e.target_key === itemKey)
          .map((e) => e.source_key);
        const lessonsMet =
          lessonRequiredLessons.length === 0 ||
          lessonRequiredLessons.every((lk) => acquiredLessonKeys.has(lk));
        return skillsMet && lessonsMet;
      }

      if (itemType === "tune") {
        // Check prerequisite tunes (previous tunes in tune_next chain)
        const tuneRequiredTunes = tuneNextEdges
          .filter((e) => e.target_key === itemKey)
          .map((e) => e.source_key);
        const tunesMet =
          tuneRequiredTunes.length === 0 ||
          tuneRequiredTunes.every((tk) => acquiredTuneKeys.has(tk));

        // Also check if any lessons point to this tune via lesson_next
        const lessonRequiredLessons = lessonNextEdges
          .filter((e) => e.target_key === itemKey)
          .map((e) => e.source_key);
        const lessonPrereqsMet =
          lessonRequiredLessons.length === 0 ||
          lessonRequiredLessons.every((lk) => acquiredLessonKeys.has(lk));

        return skillsMet && tunesMet && lessonPrereqsMet;
      }

      return skillsMet;
    };

    for (const track of tracks) {
      // Check track-level requirements
      const trackRequiredSkills = trackRequiresEdges
        .filter((e) => e.source_key === track.key)
        .map((e) => e.target_key);
      const trackRequirementsMet =
        trackRequiredSkills.length === 0 ||
        trackRequiredSkills.every((sk) => unlockedSkills.has(sk));

      // If track has requirements and they're not met, skip this track
      if (trackRequiredSkills.length > 0 && !trackRequirementsMet) {
        continue;
      }

      // Traverse the track's item chain (lessons and tunes interleaved)
      const visited = new Set<string>();
      let current = track.startItem;
      let currentType = track.startItemType;

      while (current && !visited.has(current)) {
        visited.add(current);

        if (currentType === "lesson") {
          const lesson = lessons.get(current);
          if (lesson && checkRequirements(current, "lesson")) {
            availableActivities.push({
              activityKey: current,
              activityType: "lesson",
              title: lesson.title,
              goal: lesson.goal,
              trackKey: track.key,
              trackTitle: track.title,
              level: lesson.level,
            });
          }

          // Find next item (could be lesson or tune)
          const nextEdge = lessonNextEdges.find(
            (e) => e.source_key === current
          );
          if (nextEdge) {
            current = nextEdge.target_key;
            currentType = lessons.has(nextEdge.target_key) ? "lesson" : "tune";
          } else {
            current = undefined;
          }
        } else if (currentType === "tune") {
          const tune = tunes.get(current);
          if (tune && checkRequirements(current, "tune")) {
            availableActivities.push({
              activityKey: current,
              activityType: "tune",
              title: tune.title,
              description: tune.description,
              trackKey: track.key,
              trackTitle: track.title,
              level: tune.level,
              musicRef: tune.musicRef,
            });
          }

          // Find next item (could be lesson or tune)
          const nextEdge = tuneNextEdges.find((e) => e.source_key === current);
          if (nextEdge) {
            current = nextEdge.target_key;
            currentType = lessons.has(nextEdge.target_key) ? "lesson" : "tune";
          } else {
            current = undefined;
          }
        } else {
          break;
        }
      }
    }

    // 4. Calculate signals and prepare practice history
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    // Consider both lesson runs and tune practice runs for last practice time
    const lastLessonTime = lessonRuns.length > 0
      ? new Date(lessonRuns[0].started_at).getTime()
      : 0;
    const lastTuneTime = (tunePracticeRuns || []).length > 0 && tunePracticeRuns![0].started_at
      ? new Date(tunePracticeRuns![0].started_at).getTime()
      : 0;
    const lastPracticeTime = Math.max(lastLessonTime, lastTuneTime);
    const timeSinceLastPracticeHours =
      lastPracticeTime > 0
        ? Math.round((now.getTime() - lastPracticeTime) / (1000 * 60 * 60))
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
    const practiceHistory = availableActivities
      .filter((a) => a.activityType === "lesson")
      .map((activity) => {
        const runs = runsByLesson.get(activity.activityKey) || [];
        const recentRuns = runs.slice(0, 5);
        const attemptsLast7Days = runs.filter(
          (r) => new Date(r.started_at) >= sevenDaysAgo
        ).length;
        const lastRun = runs[0];

        return {
          activityKey: activity.activityKey,
          activityType: activity.activityType,
          title: activity.title,
          trackTitle: activity.trackTitle,
          lastPracticed: lastRun?.started_at || null,
          lastEvaluation: lastRun?.evaluation || null,
          lastDifficulty: lastRun?.difficulty || null,
          attemptsTotal: runs.length,
          attemptsLast7Days,
          recentEvaluations: recentRuns.map((r) => r.evaluation || "none"),
        };
      });

    // Group tune practice runs by tune_key
    const tunePracticeRunsByTune: Map<string, typeof tunePracticeRuns> = new Map();
    for (const run of tunePracticeRuns || []) {
      const key = run.tune_key;
      if (!tunePracticeRunsByTune.has(key)) {
        tunePracticeRunsByTune.set(key, []);
      }
      tunePracticeRunsByTune.get(key)!.push(run);
    }

    // Group tune nugget states by tune_key
    const tuneNuggetStatesByTune: Map<string, typeof tuneNuggetStates> = new Map();
    for (const state of tuneNuggetStates || []) {
      const key = state.tune_key;
      if (!tuneNuggetStatesByTune.has(key)) {
        tuneNuggetStatesByTune.set(key, []);
      }
      tuneNuggetStatesByTune.get(key)!.push(state);
    }

    // Add tunes to history with acquisition status AND practice data
    const tuneHistory = availableActivities
      .filter((a) => a.activityType === "tune")
      .map((activity) => {
        const runs = tunePracticeRunsByTune.get(activity.activityKey) || [];
        const nuggetStates = tuneNuggetStatesByTune.get(activity.activityKey) || [];
        const attemptsLast7Days = runs.filter(
          (r) => r.started_at && new Date(r.started_at) >= sevenDaysAgo
        ).length;
        const lastRun = runs[0];
        const totalAttempts = nuggetStates.reduce((sum, s) => sum + (s.attempt_count || 0), 0);
        const totalPasses = nuggetStates.reduce((sum, s) => sum + (s.pass_count || 0), 0);
        const nuggetCount = nuggetStates.length;
        const masteredNuggets = nuggetStates.filter((s) => (s.best_streak || 0) >= 3).length;

        return {
          activityKey: activity.activityKey,
          activityType: activity.activityType,
          title: activity.title,
          trackTitle: activity.trackTitle,
          musicRef: activity.musicRef,
          level: activity.level,
          acquired: acquiredTuneKeys.has(activity.activityKey),
          lastPracticed: lastRun?.started_at || null,
          lastEvaluation: lastRun?.evaluation || null,
          attemptsTotal: totalAttempts,
          attemptsLast7Days,
          nuggetProgress: nuggetCount > 0
            ? `${masteredNuggets}/${nuggetCount} nuggets mastered, ${totalPasses} passes out of ${totalAttempts} attempts`
            : null,
        };
      });

    const lessonRunsSummary = lessonRuns.slice(0, 20).map((r) => ({
      lessonKey: r.lesson_node_key,
      startedAt: r.started_at,
      evaluation: r.evaluation,
      difficulty: r.difficulty,
    }));

    // 5. Build LLM prompt
    const notationInstruction = language === "fr"
      ? "NOTE NOTATION: When mentioning notes, use solfège (Do, Ré, Mi, Fa, Sol, La, Si). Do not use ABC letter names."
      : "NOTE NOTATION: When mentioning notes, use letter names (C, D, E, F, G, A, B).";

    const systemPrompt = `You are the Teacher agent for an app teaching music through piano.

Your job when the user opens Learning mode:
1) Greet the user briefly, taking into account if you interacted with them on the day
2) Look at their recent activity and performance.
3) Propose 1 to 4 next activities (lessons or tunes) that the user can pick from.
4) Keep it lightweight and motivating. No lecturing. No long explanations.

IMPORTANT - Activity Types:
- LESSONS: Structured learning exercises focused on specific skills (technique, theory, rhythm). These build foundational knowledge.
- TUNES: Music pieces for practice. More rewarding and enjoyable, but require prerequisite skills. These provide motivation and real-world application.
  - Tunes marked as "acquired: true" have been mastered by the student.
  - Suggest non-acquired tunes as priority for continued progress.

Balance recommendations:
- New users should start with lessons to build foundational skills
- Mix lessons and tunes to maintain engagement and motivation
- Suggest tunes when the user has unlocked required skills
- After challenging lessons, suggest a tune as a reward
- Consider the user's level (beginner/intermediate/advanced) when recommending
- Tunes are great for applying learned skills in a fun, musical context
- Prioritize non-acquired tunes over already-mastered ones

Important rules:
- The user can choose; you are advising, not forcing.
- Use ONLY the provided available activities. Do not invent activities not present.
- If the user hasn't practiced in a long time, recommend an easier re-entry choice.
- Balance: avoid always recommending the same track; include variety when appropriate.
- IMPORTANT: The "label" field should be a SHORT, human-friendly activity name. Do NOT include activity keys in the label.
- REQUIRED: The "trackTitle" field MUST match one of the track titles from the available activities.
- REQUIRED: The "notes" field MUST be included and should briefly explain to the user why you're suggesting these activities.
- ${notationInstruction}

Return ONLY valid JSON following the schema provided.`;

    const userPrompt = `CONTEXT (today):
- locale: ${language}
- now: ${now.toISOString()}
- timeSinceLastPracticeHours: ${timeSinceLastPracticeHours ?? "never practiced"}

AVAILABLE ACTIVITIES (lessons and tunes the user can access):
${JSON.stringify(availableActivities, null, 2)}

LESSON PRACTICE HISTORY:
${JSON.stringify(practiceHistory, null, 2)}

TUNE PRACTICE HISTORY (with acquisition status and practice data):
${JSON.stringify(tuneHistory, null, 2)}

RECENT LESSON RUNS (chronological list):
${JSON.stringify(lessonRunsSummary, null, 2)}

OUTPUT JSON SCHEMA:
{
  "greeting": "string",
  "suggestions": [
    {
      "activityKey": "string (must be from AVAILABLE ACTIVITIES)",
      "activityType": "lesson" | "tune",
      "label": "string (short activity name)",
      "why": "string",
      "trackTitle": "string (REQUIRED: must match the trackTitle from AVAILABLE ACTIVITIES)"
    }
  ],
  "notes": "string (REQUIRED: Brief explanation to the user about why you picked these activities)"
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
            tunesCount: tunes.size,
            skillsCount: skills.size,
            edgesCount: edges.length,
            availableActivitiesCount: availableActivities.length,
            availableActivities: availableActivities,
          },
          practiceHistory,
          tuneHistory,
          signals: {
            timeSinceLastPracticeHours,
            recentRunsCount: lessonRuns.length,
            unlockedSkillsCount: unlockedSkills.size,
            acquiredLessonsCount: acquiredLessonKeys.size,
            acquiredTunesCount: acquiredTuneKeys.size,
          },
          prompt: fullPrompt,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Call LLM
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

    // Build fallback response from available activities (used if LLM fails)
    const buildFallbackResponse = (): TeacherResponse => {
      // Prefer a mix of lessons and tunes
      const fallbackActivities = availableActivities.slice(0, 3);
      return {
        greeting:
          language === "fr"
            ? "Bonjour ! Prêt à pratiquer ?"
            : "Hello! Ready to practice?",
        suggestions: fallbackActivities.map((activity) => ({
          activityKey: activity.activityKey,
          activityType: activity.activityType,
          label: activity.title,
          why: activity.goal || activity.description || "Practice this activity",
          trackTitle: activity.trackTitle,
          level: activity.level,
        })),
        notes: null,
      };
    };

    let teacherResponse: TeacherResponse;

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      console.error("LLM error:", llmResponse.status, errorText);
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

    // Validate suggestions - ensure activityKey exists in available activities
    const availableActivityKeys = new Map(
      availableActivities.map((a) => [a.activityKey, a])
    );
    const validatedSuggestions = teacherResponse.suggestions
      .filter((s) => availableActivityKeys.has(s.activityKey))
      .map((s) => {
        const activity = availableActivityKeys.get(s.activityKey)!;
        return {
          activityKey: s.activityKey,
          activityType: activity.activityType,
          label: s.label,
          why: s.why,
          trackTitle: s.trackTitle || activity.trackTitle,
          level: activity.level,
          // For backwards compatibility, include lessonKey
          lessonKey: s.activityKey,
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
