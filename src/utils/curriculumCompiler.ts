import {
  CurriculumExport,
  LessonExport,
  QuestData,
  QuestNode,
  SkillExport,
  TrackExport,
} from "@/types/quest";

export interface CompilationError {
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export interface CompilationResult {
  success: boolean;
  export?: CurriculumExport;
  errors: CompilationError[];
}

/**
 * Compiles the authoring graph into a runtime-ready curriculum export.
 * Infers all relationships from edges and validates the graph structure.
 */
export function compileCurriculum(questData: QuestData): CompilationResult {
  const errors: CompilationError[] = [];
  const { nodes, edges } = questData;

  // Build maps for efficient lookups
  const nodeById = new Map<string, QuestNode>();
  const tracksByKey = new Map<string, QuestNode>();
  const lessonsByKey = new Map<string, QuestNode>();
  const skillsByKey = new Map<string, QuestNode>();

  // Parse nodes and build key maps
  for (const node of nodes) {
    nodeById.set(node.id, node);

    if (node.data.type === "track") {
      const trackKey = node.data.trackKey;
      if (!trackKey || trackKey.trim() === "") {
        errors.push({
          message: `Track node ${node.id} is missing trackKey`,
          nodeId: node.id,
        });
        continue;
      }
      if (tracksByKey.has(trackKey)) {
        errors.push({
          message: `Duplicate trackKey "${trackKey}" found`,
          nodeId: node.id,
        });
        continue;
      }
      tracksByKey.set(trackKey, node);
    } else if (node.data.type === "lesson") {
      const lessonKey = node.data.lessonKey;
      if (!lessonKey || lessonKey.trim() === "") {
        errors.push({
          message: `Lesson node ${node.id} is missing lessonKey`,
          nodeId: node.id,
        });
        continue;
      }
      if (lessonsByKey.has(lessonKey)) {
        errors.push({
          message: `Duplicate lessonKey "${lessonKey}" found`,
          nodeId: node.id,
        });
        continue;
      }
      lessonsByKey.set(lessonKey, node);
    } else if (node.data.type === "skill") {
      const skillKey = node.data.skillKey;
      if (!skillKey || skillKey.trim() === "") {
        errors.push({
          message: `Skill node ${node.id} is missing skillKey`,
          nodeId: node.id,
        });
        continue;
      }
      if (skillsByKey.has(skillKey)) {
        errors.push({
          message: `Duplicate skillKey "${skillKey}" found`,
          nodeId: node.id,
        });
        continue;
      }
      skillsByKey.set(skillKey, node);
    }
  }

  // Validate edges reference existing nodes
  for (const edge of edges) {
    if (!nodeById.has(edge.source)) {
      errors.push({
        message: `Edge ${edge.id} references non-existent source node ${edge.source}`,
        edgeId: edge.id,
      });
    }
    if (!nodeById.has(edge.target)) {
      errors.push({
        message: `Edge ${edge.id} references non-existent target node ${edge.target}`,
        edgeId: edge.id,
      });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  // Build track membership map (track-out → lesson-in)
  const trackMembership = new Map<string, string>(); // lessonId -> trackKey
  const trackLessonKeys = new Map<string, Set<string>>(); // trackKey -> Set<lessonKey>

  // Build lesson→skill requirement map (lesson-required → skill-required)
  const lessonRequiredSkills = new Map<string, Set<string>>(); // lessonId -> Set<skillKey>

  // Build lesson→skill unlock map (lesson-unlockable → skill-unlockable)
  const lessonAwardedSkills = new Map<string, Set<string>>(); // lessonId -> Set<skillKey>

  // Build lesson→lesson next map (lesson-out → lesson-in, default edge)
  const lessonNextLessons = new Map<string, Set<string>>(); // lessonId -> Set<lessonKey>

  // Build track→skill requirement map (track-required → skill-required)
  const trackRequiredSkills = new Map<string, Set<string>>(); // trackKey -> Set<skillKey>

  // Build lesson→lesson prerequisite map (lesson-required → lesson-prerequisite)
  const lessonRequiredLessons = new Map<string, Set<string>>(); // lessonId -> Set<lessonKey>

  // Process edges to infer relationships
  for (const edge of edges) {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);

    if (!sourceNode || !targetNode) {
      continue; // Already validated above, but skip if missing
    }

    const sourceHandle = edge.sourceHandle;
    const targetHandle = edge.targetHandle;

    // Track → Lesson: track-out → lesson-in
    if (
      sourceNode.data.type === "track" &&
      targetNode.data.type === "lesson" &&
      sourceHandle === "track-out" &&
      targetHandle === "lesson-in"
    ) {
      const trackKey = sourceNode.data.trackKey!;
      const lessonKey = targetNode.data.lessonKey!;

      // Validate lesson belongs to only one track
      if (trackMembership.has(targetNode.id)) {
        errors.push({
          message: `Lesson "${lessonKey}" belongs to multiple tracks`,
          nodeId: targetNode.id,
        });
        continue;
      }

      trackMembership.set(targetNode.id, trackKey);
      if (!trackLessonKeys.has(trackKey)) {
        trackLessonKeys.set(trackKey, new Set());
      }
      trackLessonKeys.get(trackKey)!.add(lessonKey);
    }

    // Lesson → Skill requirement: lesson-required → skill-required
    if (
      sourceNode.data.type === "lesson" &&
      targetNode.data.type === "skill" &&
      sourceHandle === "lesson-required" &&
      targetHandle === "skill-required"
    ) {
      const skillKey = targetNode.data.skillKey!;
      if (!lessonRequiredSkills.has(sourceNode.id)) {
        lessonRequiredSkills.set(sourceNode.id, new Set());
      }
      lessonRequiredSkills.get(sourceNode.id)!.add(skillKey);
    }

    // Lesson → Skill unlock: lesson-unlockable → skill-unlockable
    if (
      sourceNode.data.type === "lesson" &&
      targetNode.data.type === "skill" &&
      sourceHandle === "lesson-unlockable" &&
      targetHandle === "skill-unlockable"
    ) {
      const skillKey = targetNode.data.skillKey!;
      if (!lessonAwardedSkills.has(sourceNode.id)) {
        lessonAwardedSkills.set(sourceNode.id, new Set());
      }
      lessonAwardedSkills.get(sourceNode.id)!.add(skillKey);
    }

    // Lesson → Lesson: lesson-out → lesson-in (default edge)
    if (
      sourceNode.data.type === "lesson" &&
      targetNode.data.type === "lesson" &&
      sourceHandle === "lesson-out" &&
      targetHandle === "lesson-in"
    ) {
      const nextLessonKey = targetNode.data.lessonKey!;
      if (!lessonNextLessons.has(sourceNode.id)) {
        lessonNextLessons.set(sourceNode.id, new Set());
      }
      lessonNextLessons.get(sourceNode.id)!.add(nextLessonKey);
    }

    // Track → Skill requirement: track-required → skill-required
    if (
      sourceNode.data.type === "track" &&
      targetNode.data.type === "skill" &&
      sourceHandle === "track-required" &&
      targetHandle === "skill-required"
    ) {
      const trackKey = sourceNode.data.trackKey!;
      const skillKey = targetNode.data.skillKey!;
      if (!trackRequiredSkills.has(trackKey)) {
        trackRequiredSkills.set(trackKey, new Set());
      }
      trackRequiredSkills.get(trackKey)!.add(skillKey);
    }

    // Lesson → Lesson prerequisite: lesson-required → lesson-prerequisite
    if (
      sourceNode.data.type === "lesson" &&
      targetNode.data.type === "lesson" &&
      sourceHandle === "lesson-required" &&
      targetHandle === "lesson-prerequisite"
    ) {
      const prerequisiteLessonKey = targetNode.data.lessonKey!;
      if (!lessonRequiredLessons.has(sourceNode.id)) {
        lessonRequiredLessons.set(sourceNode.id, new Set());
      }
      lessonRequiredLessons.get(sourceNode.id)!.add(prerequisiteLessonKey);
    }
  }

  // Propagate track membership through lesson chains (A → B means B belongs to A's track)
  let changed = true;
  while (changed) {
    changed = false;
    for (const [
      sourceLessonId,
      nextLessonKeys,
    ] of lessonNextLessons.entries()) {
      const sourceTrackKey = trackMembership.get(sourceLessonId);
      if (!sourceTrackKey) continue;

      for (const nextLessonKey of nextLessonKeys) {
        const nextLessonNode = lessonsByKey.get(nextLessonKey);
        if (!nextLessonNode) continue;

        const existingTrackKey = trackMembership.get(nextLessonNode.id);
        if (existingTrackKey && existingTrackKey !== sourceTrackKey) {
          errors.push({
            message: `Lesson "${nextLessonKey}" belongs to multiple tracks via transitive membership`,
            nodeId: nextLessonNode.id,
          });
          continue;
        }

        if (!existingTrackKey) {
          trackMembership.set(nextLessonNode.id, sourceTrackKey);
          trackLessonKeys.get(sourceTrackKey)!.add(nextLessonKey);
          changed = true;
        }
      }
    }
  }

  // Validate all lessons belong to a track
  for (const [lessonKey, lessonNode] of lessonsByKey.entries()) {
    if (!trackMembership.has(lessonNode.id)) {
      errors.push({
        message: `Lesson "${lessonKey}" does not belong to any track`,
        nodeId: lessonNode.id,
      });
    }
  }

  // Build reverse indexes for skills
  const skillRequiredByLessons = new Map<string, Set<string>>(); // skillKey -> Set<lessonKey>
  const skillAwardedByLessons = new Map<string, Set<string>>(); // skillKey -> Set<lessonKey>
  const skillRequiredByTracks = new Map<string, Set<string>>(); // skillKey -> Set<trackKey>

  for (const [lessonId, skillKeys] of lessonRequiredSkills.entries()) {
    const lessonKey = nodeById.get(lessonId)!.data.lessonKey!;
    for (const skillKey of skillKeys) {
      if (!skillRequiredByLessons.has(skillKey)) {
        skillRequiredByLessons.set(skillKey, new Set());
      }
      skillRequiredByLessons.get(skillKey)!.add(lessonKey);
    }
  }

  for (const [lessonId, skillKeys] of lessonAwardedSkills.entries()) {
    const lessonKey = nodeById.get(lessonId)!.data.lessonKey!;
    for (const skillKey of skillKeys) {
      if (!skillAwardedByLessons.has(skillKey)) {
        skillAwardedByLessons.set(skillKey, new Set());
      }
      skillAwardedByLessons.get(skillKey)!.add(lessonKey);
    }
  }

  for (const [trackKey, skillKeys] of trackRequiredSkills.entries()) {
    for (const skillKey of skillKeys) {
      if (!skillRequiredByTracks.has(skillKey)) {
        skillRequiredByTracks.set(skillKey, new Set());
      }
      skillRequiredByTracks.get(skillKey)!.add(trackKey);
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  // Build export objects

  // Tracks
  const tracks: TrackExport[] = Array.from(tracksByKey.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([trackKey, node]) => {
      const lessonKeys = Array.from(trackLessonKeys.get(trackKey) || []).sort();
      const requiresSkills = trackRequiredSkills.has(trackKey)
        ? Array.from(trackRequiredSkills.get(trackKey)!).sort()
        : undefined;

      return {
        trackKey,
        title: node.data.title,
        description: node.data.description,
        lessonKeys,
        requiresSkills,
        _debug: {
          nodeId: node.id,
          position: node.position,
        },
      };
    });

  // Lessons
  const lessons: LessonExport[] = Array.from(lessonsByKey.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([lessonKey, node]) => {
      const trackKey = trackMembership.get(node.id)!;
      const requiresSkills = Array.from(
        lessonRequiredSkills.get(node.id) || []
      ).sort();
      const requiresLessons = lessonRequiredLessons.has(node.id)
        ? Array.from(lessonRequiredLessons.get(node.id)!).sort()
        : undefined;
      const awardsSkills = Array.from(
        lessonAwardedSkills.get(node.id) || []
      ).sort();
      const nextLessons = lessonNextLessons.has(node.id)
        ? Array.from(lessonNextLessons.get(node.id)!).sort()
        : undefined;

      return {
        lessonKey,
        title: node.data.title,
        goal: node.data.goal,
        setupGuidance: node.data.setupGuidance,
        evaluationGuidance: node.data.evaluationGuidance,
        difficultyGuidance: node.data.difficultyGuidance,
        level: node.data.level,
        trackKey,
        requiresSkills,
        requiresLessons,
        awardsSkills,
        nextLessons,
        _debug: {
          nodeId: node.id,
          position: node.position,
        },
      };
    });

  // Skills
  const skills: SkillExport[] = Array.from(skillsByKey.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([skillKey, node]) => {
      const requiredByLessons = Array.from(
        skillRequiredByLessons.get(skillKey) || []
      ).sort();
      const awardedByLessons = Array.from(
        skillAwardedByLessons.get(skillKey) || []
      ).sort();
      const requiredByTracks = Array.from(
        skillRequiredByTracks.get(skillKey) || []
      ).sort();

      return {
        skillKey,
        title: node.data.title,
        description: node.data.description,
        unlockGuidance: node.data.unlockGuidance,
        requiredByLessons,
        awardedByLessons,
        requiredByTracks,
        _debug: {
          nodeId: node.id,
          position: node.position,
        },
      };
    });

  return {
    success: true,
    export: {
      tracks,
      lessons,
      skills,
    },
    errors: [],
  };
}
