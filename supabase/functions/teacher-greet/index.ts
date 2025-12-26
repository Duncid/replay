import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
  difficulty: { mode: string; value: number | null };
  setupHint: {
    bpm: number | null;
    meter: string | null;
    feel: string | null;
    bars: number | null;
    countInBars: number | null;
  };
  durationMin: number;
  trackTitle?: string;
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
    const { language = "en", debug = false } = await req.json();

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
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
      edges?: Array<{ source_key: string; target_key: string; edge_type: string }>;
    };

    // Parse curriculum data from snapshot
    const edges: Edge[] = (snapshot.edges || []).map((e) => ({
      source_key: e.source_key,
      target_key: e.target_key,
      edge_type: e.edge_type,
    }));

    const tracks: TrackNode[] = (snapshot.tracks || []).map((t) => {
      const startEdge = edges.find((e) => e.source_key === t.trackKey && e.edge_type === "track_starts_with");
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
      `[teacher-greet] Curriculum loaded: ${tracks.length} tracks, ${lessons.size} lessons, ${skills.size} skills, ${edges.length} edges`,
    );

    // Build edge lookups
    const lessonNextEdges = edges.filter((e) => e.edge_type === "lesson_next");
    const lessonRequiresEdges = edges.filter((e) => e.edge_type === "lesson_requires_skill");
    const lessonAwardsEdges = edges.filter((e) => e.edge_type === "lesson_awards_skill");

    // 2. Fetch user activity data
    const { data: recentRuns, error: runsError } = await supabase
      .from("lesson_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(20);

    if (runsError) {
      console.error("Error fetching lesson runs:", runsError);
    }

    const lessonRuns: LessonRun[] = (recentRuns || []) as LessonRun[];

    const { data: skillStates, error: skillsError } = await supabase.from("user_skill_state").select("*");

    if (skillsError) {
      console.error("Error fetching skill states:", skillsError);
    }

    const unlockedSkills = new Set(
      ((skillStates || []) as SkillState[]).filter((s) => s.unlocked).map((s) => s.skill_key),
    );

    // 3. Compute accessible lessons per track
    const accessibleLessons: Map<string, Set<string>> = new Map();
    const nextLessonAfter: Map<string, string> = new Map();

    for (const track of tracks) {
      const accessible = new Set<string>();
      const visited = new Set<string>();
      const activeRequiredSkills = new Set<string>();

      let current = track.startLesson;
      while (current && !visited.has(current)) {
        visited.add(current);
        const lesson = lessons.get(current);
        if (!lesson) break;

        // Add required skills for this lesson
        const requiredEdges = lessonRequiresEdges.filter((e) => e.source_key === current);
        for (const edge of requiredEdges) {
          activeRequiredSkills.add(edge.target_key);
        }

        // Check if all required skills are unlocked
        const allRequirementsMet = [...activeRequiredSkills].every((sk) => unlockedSkills.has(sk));

        if (allRequirementsMet) {
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

    // 4. Build candidate activities
    const candidates: CandidateActivity[] = [];
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Group runs by lesson
    const runsByLesson: Map<string, LessonRun[]> = new Map();
    for (const run of lessonRuns) {
      const key = run.lesson_node_key;
      if (!runsByLesson.has(key)) {
        runsByLesson.set(key, []);
      }
      runsByLesson.get(key)!.push(run);
    }

    // Continue: last practiced lessons
    if (lessonRuns.length > 0) {
      const lastPracticedKey = lessonRuns[0].lesson_node_key;
      const lesson = lessons.get(lastPracticedKey);
      if (lesson) {
        const runs = runsByLesson.get(lastPracticedKey) || [];
        const recentEvals = runs.slice(0, 3).map((r) => r.evaluation || "none");
        const attemptsLast7Days = runs.filter((r) => new Date(r.started_at) >= sevenDaysAgo).length;

        candidates.push({
          lessonKey: lastPracticedKey,
          title: lesson.title,
          goal: lesson.goal,
          category: "continue",
          lastPracticed: lessonRuns[0].started_at,
          lastEvaluations: recentEvals,
          lastDifficulty: lessonRuns[0].difficulty,
          attemptsLast7Days,
        });
      }
    }

    // Progress: next lesson after recently passed
    const passedLessons = lessonRuns.filter((r) => r.evaluation === "pass");
    if (passedLessons.length > 0) {
      const lastPassedKey = passedLessons[0].lesson_node_key;
      const nextKey = nextLessonAfter.get(lastPassedKey);
      if (nextKey && lessons.has(nextKey)) {
        const lesson = lessons.get(nextKey)!;
        // Check if accessible
        let isAccessible = false;
        for (const [, accessible] of accessibleLessons) {
          if (accessible.has(nextKey)) {
            isAccessible = true;
            break;
          }
        }
        if (isAccessible && !candidates.some((c) => c.lessonKey === nextKey)) {
          candidates.push({
            lessonKey: nextKey,
            title: lesson.title,
            goal: lesson.goal,
            category: "progress",
          });
        }
      }
    }

    // Balance: accessible lesson from less-practiced track
    const practiceCountByTrack: Map<string, number> = new Map();
    for (const track of tracks) {
      let count = 0;
      const accessible = accessibleLessons.get(track.key) || new Set();
      for (const lessonKey of accessible) {
        count += (runsByLesson.get(lessonKey) || []).length;
      }
      practiceCountByTrack.set(track.key, count);
    }

    const sortedTracks = [...tracks].sort(
      (a, b) => (practiceCountByTrack.get(a.key) || 0) - (practiceCountByTrack.get(b.key) || 0),
    );

    for (const track of sortedTracks) {
      const accessible = accessibleLessons.get(track.key) || new Set();
      for (const lessonKey of accessible) {
        if (!candidates.some((c) => c.lessonKey === lessonKey)) {
          const lesson = lessons.get(lessonKey)!;
          candidates.push({
            lessonKey,
            title: lesson.title,
            goal: lesson.goal,
            category: "balance",
            trackKey: track.key,
          });
          break;
        }
      }
      if (candidates.length >= 4) break;
    }

    // If no candidates found, add the first accessible lesson from any track
    if (candidates.length === 0) {
      for (const track of tracks) {
        if (track.startLesson && lessons.has(track.startLesson)) {
          const lesson = lessons.get(track.startLesson)!;
          candidates.push({
            lessonKey: track.startLesson,
            title: lesson.title,
            goal: lesson.goal,
            category: "progress",
            trackKey: track.key,
          });
          break;
        }
      }
    }

    // 5. Calculate signals
    const timeSinceLastPracticeHours =
      lessonRuns.length > 0
        ? Math.round((now.getTime() - new Date(lessonRuns[0].started_at).getTime()) / (1000 * 60 * 60))
        : null;

    // 6. Build LLM prompt
    const systemPrompt = `You are the Teacher agent for a piano practice app.

Your job when the user opens Learning mode:
1) Greet the user briefly, taking into account if you interracted with them on the day
2) Look at their recent activity and performance.
3) Propose 1 to 4 next activities (lesson choices) that the user can pick from.
4) Keep it lightweight and motivating. No lecturing. No long explanations.

Important rules:
- The user can choose; you are advising, not forcing.
- Prefer short sessions: each suggestion should fit in 3–8 minutes.
- Use the provided curriculum snapshot and candidate activities. Do not invent lessons or skills not present.
- If the user hasn't practiced in a long time, recommend an easier re-entry choice.
- If the user is stuck (repeated fail/close), propose a simpler version (lower difficulty / slower bpm / fewer bars).
- If the user is succeeding (recent pass streak), propose either the next lesson or a slightly harder difficulty.
- Balance: avoid always recommending the same track; include variety when appropriate.
- IMPORTANT: The "label" field should be a SHORT, human-friendly activity name. Do NOT include lesson keys (like "A1.4" or "B2.1") in the label. Example: "Eighth notes practice" NOT "A1.4: Eighth notes practice".
- REQUIRED: The "notes" field MUST be included and should briefly explain to the user why you're suggesting these activities. Focus on their progress, recent practice, and what makes sense for them today. Example: "Based on your progress with quarter notes, I think you're ready for eighth notes. The second option is a good review if you want to solidify basics first."

Return ONLY valid JSON following the schema provided.`;

    const tracksSummary = tracks.map((t) => ({
      key: t.key,
      title: t.title,
      startLesson: t.startLesson,
    }));

    const lessonsSummary = [...lessons.values()].slice(0, 20).map((l) => ({
      key: l.key,
      title: l.title,
      goal: l.goal,
    }));

    const skillsSummary = [...skills.values()].map((s) => ({
      key: s.key,
      title: s.title,
      unlocked: unlockedSkills.has(s.key),
    }));

    const lessonRunsSummary = lessonRuns.slice(0, 10).map((r) => ({
      lessonKey: r.lesson_node_key,
      startedAt: r.started_at,
      evaluation: r.evaluation,
      difficulty: r.difficulty,
    }));

    const userPrompt = `CONTEXT (today):
- locale: ${language}
- now: ${now.toISOString()}
- timeSinceLastPracticeHours: ${timeSinceLastPracticeHours ?? "never practiced"}

CURRICULUM SNAPSHOT:
- tracks: ${JSON.stringify(tracksSummary)}
- lessons: ${JSON.stringify(lessonsSummary)}
- skills: ${JSON.stringify(skillsSummary)}

CANDIDATE ACTIVITIES (precomputed, do NOT invent others):
Note: "lastEvaluation: null" means the run wasn't graded.
${JSON.stringify(candidates, null, 2)}

RECENT ACTIVITY:
- lastLessonRuns: ${JSON.stringify(lessonRunsSummary)}

OUTPUT JSON SCHEMA:
{
  "greeting": "string",
  "suggestions": [
    {
      "lessonKey": "string",
      "label": "string (short activity name, NO lesson keys like A1.4)",
      "why": "string",
      "difficulty": { "mode": "same|easier|harder|set", "value": number|null },
      "setupHint": { "bpm": number|null, "meter": "string"|null, "feel": "string"|null, "bars": number|null, "countInBars": number|null },
      "durationMin": number
    }
  ],
  "notes": "string (REQUIRED: Brief explanation to the user about why you picked these lessons based on their progress and what makes sense for them today)"
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
            tracks: tracksSummary,
            lessons: lessonsSummary.slice(0, 10),
            skills: skillsSummary,
          },
          candidates,
          signals: {
            timeSinceLastPracticeHours,
            recentRunsCount: lessonRuns.length,
            unlockedSkillsCount: unlockedSkills.size,
          },
          prompt: fullPrompt,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 7. Call LLM
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
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
      }),
    });

    // Build fallback response from candidates (used if LLM fails)
    const buildFallbackResponse = (): TeacherResponse => ({
      greeting: language === "fr" ? "Bonjour ! Prêt à pratiquer ?" : "Hello! Ready to practice?",
      suggestions: candidates.slice(0, 3).map((c) => ({
        lessonKey: c.lessonKey,
        label: c.title,
        why: c.goal,
        difficulty: { mode: "same", value: null },
        setupHint: { bpm: null, meter: null, feel: null, bars: null, countInBars: null },
        durationMin: 5,
      })),
      notes: null,
    });

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

    // Build a map of lesson -> track for enriching suggestions
    // Walk track_starts_with + lesson_next chains to map each lesson to its track
    const lessonToTrack: Map<string, string> = new Map();
    const trackStartsEdges = edges.filter((e) => e.edge_type === "track_starts_with");
    const lessonNextEdgesForTrack = edges.filter((e) => e.edge_type === "lesson_next");
    
    // Build a map for lesson_next traversal
    const lessonNextMap: Map<string, string> = new Map();
    for (const edge of lessonNextEdgesForTrack) {
      lessonNextMap.set(edge.source_key, edge.target_key);
    }
    
    // For each track, walk its lesson chain and map all lessons to the track
    for (const startEdge of trackStartsEdges) {
      const trackKey = startEdge.source_key;
      let currentLesson = startEdge.target_key;
      
      // Add the first lesson
      lessonToTrack.set(currentLesson, trackKey);
      
      // Walk the chain via lesson_next edges
      while (lessonNextMap.has(currentLesson)) {
        currentLesson = lessonNextMap.get(currentLesson)!;
        lessonToTrack.set(currentLesson, trackKey);
      }
    }

    // Validate and enrich suggestions with lesson data
    const validatedSuggestions = teacherResponse.suggestions
      .filter((s) => lessons.has(s.lessonKey))
      .map((s) => {
        const lesson = lessons.get(s.lessonKey)!;
        const trackKey = lessonToTrack.get(s.lessonKey);
        const track = trackKey ? tracks.find((t) => t.key === trackKey) : null;
        return {
          ...s,
          lessonTitle: lesson.title,
          lessonGoal: lesson.goal,
          setupGuidance: lesson.setupGuidance,
          evaluationGuidance: lesson.evaluationGuidance,
          difficultyGuidance: lesson.difficultyGuidance,
          trackTitle: track?.title,
        };
      });

    return new Response(
      JSON.stringify({
        greeting: teacherResponse.greeting,
        suggestions: validatedSuggestions,
        notes: teacherResponse.notes,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in teacher-greet:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
