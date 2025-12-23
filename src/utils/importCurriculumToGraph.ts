/**
 * Import Schema Format to Graph
 *
 * Converts the schema import JSON into the authoring graph format.
 *
 * Node IDs are deterministic: "track:{trackKey}", "lesson:{lessonKey}", "skill:{skillKey}"
 *
 * Edge Generation:
 * - Lesson sequencing: lesson.nextLesson → lesson-out → lesson-in (default)
 * - Lesson requires skills: lesson.requiresSkills → lesson-required → skill-required (requirement)
 * - Lesson awards skills: lesson.awardsSkills → lesson-unlockable → skill-unlockable (unlockable)
 * - Track requires skills: track.requiresSkills → track-required → skill-required (requirement)
 *
 * Track membership: Inferred by following nextLesson chains from tracks.nextLessons (entry lessons).
 *
 * Layout:
 * - Tracks: Positioned vertically, stacked with margin
 * - Lessons: Positioned horizontally at same Y as parent track, following nextLesson sequence
 * - Skills: Positioned below the lesson that unlocks them (awardsSkills)
 */

import {
  QuestData,
  QuestEdge,
  QuestNode,
} from "@/types/quest";

/**
 * Schema import format (different from CurriculumExport)
 */
export interface SchemaImportTrack {
  trackKey: string;
  title: string;
  description?: string;
  requiresSkills?: string[];
  nextLessons: string[];
}

export interface SchemaImportLesson {
  lessonKey: string;
  title: string;
  goal?: string;
  setupGuidance?: string;
  evaluationGuidance?: string;
  difficultyGuidance?: string;
  requiresSkills?: string[];
  awardsSkills: string[];
  nextLesson: string | null;
}

export interface SchemaImportSkill {
  skillKey: string;
  title: string;
  description?: string;
  unlockGuidance?: string;
}

export interface SchemaImportFormat {
  tracks: SchemaImportTrack[];
  lessons: SchemaImportLesson[];
  skills: SchemaImportSkill[];
}

export interface ImportWarning {
  message: string;
  lessonKey?: string;
  trackKey?: string;
  skillKey?: string;
}

export interface ImportResult {
  data: QuestData;
  warnings: ImportWarning[];
}

// Layout constants
const BLOCK_WIDTH = 200;
const BLOCK_HEIGHT = 80;
const TRACK_TO_LESSON_SPACING = 250; // Horizontal spacing between track and first lesson
const LESSON_H_SPACING = 280; // Horizontal spacing between lessons
const TRACK_V_SPACING = 400; // Vertical spacing between tracks (to fit lessons and skills)
const SKILL_V_OFFSET = 120; // Vertical offset for skills below lessons

/**
 * Collects all lessons in a track by following nextLesson chains from entry lessons
 */
function collectTrackLessons(
  entryLessonKeys: string[],
  lessonsByKey: Map<string, SchemaImportLesson>
): Set<string> {
  const trackLessons = new Set<string>();
  const visited = new Set<string>();

  const visit = (lessonKey: string): void => {
    if (visited.has(lessonKey)) return;
    visited.add(lessonKey);
    trackLessons.add(lessonKey);

    const lesson = lessonsByKey.get(lessonKey);
    if (lesson && lesson.nextLesson) {
      visit(lesson.nextLesson);
    }
  };

  for (const entryKey of entryLessonKeys) {
    visit(entryKey);
  }

  return trackLessons;
}

/**
 * Builds ordered list of lessons by following nextLesson chain
 */
function buildLessonSequence(
  startLessonKey: string,
  lessonsByKey: Map<string, SchemaImportLesson>
): string[] {
  const sequence: string[] = [];
  const visited = new Set<string>();
  let currentKey: string | null = startLessonKey;

  while (currentKey && !visited.has(currentKey)) {
    visited.add(currentKey);
    sequence.push(currentKey);
    const lesson = lessonsByKey.get(currentKey);
    currentKey = lesson?.nextLesson ?? null;
  }

  return sequence;
}

/**
 * Imports a schema import JSON into the authoring graph format
 * @param importJson - The schema import JSON data
 * @param existingNodes - Optional existing nodes to position new nodes below
 */
export function importCurriculumToGraph(
  importJson: SchemaImportFormat,
  existingNodes: QuestNode[] = []
): ImportResult {
  const warnings: ImportWarning[] = [];
  
  // Calculate offset Y based on existing nodes (position new nodes below existing ones)
  let offsetY = 0;
  if (existingNodes.length > 0) {
    const maxY = Math.max(
      ...existingNodes.map((node) => node.position.y + BLOCK_HEIGHT)
    );
    offsetY = maxY + TRACK_V_SPACING; // Add spacing below existing content
  }

  // Build key maps for validation and lookup
  const tracksByKey = new Map<string, SchemaImportTrack>();
  const lessonsByKey = new Map<string, SchemaImportLesson>();
  const skillsByKey = new Map<string, SchemaImportSkill>();

  // Validate and build maps
  const trackKeys = new Set<string>();
  const lessonKeys = new Set<string>();
  const skillKeys = new Set<string>();

  for (const track of importJson.tracks) {
    if (trackKeys.has(track.trackKey)) {
      throw new Error(`Duplicate trackKey: ${track.trackKey}`);
    }
    trackKeys.add(track.trackKey);
    tracksByKey.set(track.trackKey, track);
  }

  for (const lesson of importJson.lessons) {
    if (lessonKeys.has(lesson.lessonKey)) {
      throw new Error(`Duplicate lessonKey: ${lesson.lessonKey}`);
    }
    lessonKeys.add(lesson.lessonKey);
    lessonsByKey.set(lesson.lessonKey, lesson);
  }

  for (const skill of importJson.skills) {
    if (skillKeys.has(skill.skillKey)) {
      throw new Error(`Duplicate skillKey: ${skill.skillKey}`);
    }
    skillKeys.add(skill.skillKey);
    skillsByKey.set(skill.skillKey, skill);
  }

  // Validate track.nextLessons references
  for (const track of importJson.tracks) {
    for (const lessonKey of track.nextLessons) {
      if (!lessonsByKey.has(lessonKey)) {
        throw new Error(
          `Track "${track.trackKey}" references non-existent lesson: ${lessonKey}`
        );
      }
    }
  }

  // Validate lesson.nextLesson references
  for (const lesson of importJson.lessons) {
    if (lesson.nextLesson && !lessonsByKey.has(lesson.nextLesson)) {
      throw new Error(
        `Lesson "${lesson.lessonKey}" references non-existent nextLesson: ${lesson.nextLesson}`
      );
    }
  }

  // Infer track membership by following nextLesson chains from tracks.nextLessons
  const lessonToTrack = new Map<string, string>();
  for (const track of importJson.tracks) {
    const trackLessons = collectTrackLessons(track.nextLessons, lessonsByKey);
    for (const lessonKey of trackLessons) {
      if (lessonToTrack.has(lessonKey)) {
        throw new Error(
          `Lesson "${lessonKey}" belongs to multiple tracks (${lessonToTrack.get(lessonKey)} and ${track.trackKey})`
        );
      }
      lessonToTrack.set(lessonKey, track.trackKey);
    }
  }

  // Validate all lessons belong to a track
  for (const lesson of importJson.lessons) {
    if (!lessonToTrack.has(lesson.lessonKey)) {
      warnings.push({
        message: `Lesson "${lesson.lessonKey}" does not belong to any track`,
        lessonKey: lesson.lessonKey,
      });
    }
  }

  // Validate skill references
  for (const lesson of importJson.lessons) {
    for (const skillKey of lesson.requiresSkills || []) {
      if (!skillsByKey.has(skillKey)) {
        throw new Error(
          `Lesson "${lesson.lessonKey}" requires non-existent skill: ${skillKey}`
        );
      }
    }
    for (const skillKey of lesson.awardsSkills) {
      if (!skillsByKey.has(skillKey)) {
        throw new Error(
          `Lesson "${lesson.lessonKey}" awards non-existent skill: ${skillKey}`
        );
      }
    }
  }

  for (const track of importJson.tracks) {
    if (track.requiresSkills) {
      for (const skillKey of track.requiresSkills) {
        if (!skillsByKey.has(skillKey)) {
          throw new Error(
            `Track "${track.trackKey}" requires non-existent skill: ${skillKey}`
          );
        }
      }
    }
  }

  // Build node ID maps (deterministic IDs)
  const trackKeyToNodeId = new Map<string, string>();
  const lessonKeyToNodeId = new Map<string, string>();
  const skillKeyToNodeId = new Map<string, string>();

  // Build map of which lesson unlocks which skills (for positioning)
  const lessonUnlocksSkills = new Map<string, string[]>(); // lessonKey -> skillKeys
  for (const lesson of importJson.lessons) {
    lessonUnlocksSkills.set(lesson.lessonKey, lesson.awardsSkills);
  }

  // Generate track nodes (initial positions, will be adjusted later)
  const trackNodes: QuestNode[] = importJson.tracks.map((track) => {
    const nodeId = `track:${track.trackKey}`;
    trackKeyToNodeId.set(track.trackKey, nodeId);

    return {
      id: nodeId,
      type: "track",
      position: {
        x: 0,
        y: 0, // Will be updated in final positioning pass
      },
      data: {
        type: "track",
        title: track.title,
        trackKey: track.trackKey,
        description: track.description,
      },
    };
  });

  // Generate lesson nodes - positioned horizontally at track's Y position
  const lessonNodes: QuestNode[] = [];
  const lessonPositions = new Map<string, { x: number; y: number }>(); // For skill positioning

  // Group lessons by track
  const lessonsByTrack = new Map<string, SchemaImportLesson[]>();
  for (const lesson of importJson.lessons) {
    const trackKey = lessonToTrack.get(lesson.lessonKey);
    if (trackKey) {
      if (!lessonsByTrack.has(trackKey)) {
        lessonsByTrack.set(trackKey, []);
      }
      lessonsByTrack.get(trackKey)!.push(lesson);
    }
  }

  // Position lessons for each track (using temporary track positions)
  for (let trackIndex = 0; trackIndex < importJson.tracks.length; trackIndex++) {
    const track = importJson.tracks[trackIndex];
    const trackNodeId = trackKeyToNodeId.get(track.trackKey)!;
    const trackNode = trackNodes[trackIndex];
    const trackY = trackIndex * TRACK_V_SPACING; // Temporary Y position

    // Get all lessons in this track by following nextLesson chains from entry lessons
    const trackLessonKeys = collectTrackLessons(track.nextLessons, lessonsByKey);
    const trackLessons = Array.from(trackLessonKeys)
      .map((key) => lessonsByKey.get(key)!)
      .filter(Boolean);

    // Build sequences starting from each entry lesson
    const allSequences: string[][] = [];
    for (const entryKey of track.nextLessons) {
      const sequence = buildLessonSequence(entryKey, lessonsByKey);
      allSequences.push(sequence);
    }

    // Flatten sequences, removing duplicates (keep first occurrence)
    const orderedLessonKeys: string[] = [];
    const seen = new Set<string>();
    for (const sequence of allSequences) {
      for (const key of sequence) {
        if (!seen.has(key)) {
          seen.add(key);
          orderedLessonKeys.push(key);
        }
      }
    }

    // Add any remaining track lessons that weren't in sequences
    for (const lesson of trackLessons) {
      if (!seen.has(lesson.lessonKey)) {
        orderedLessonKeys.push(lesson.lessonKey);
      }
    }

    // Position lessons horizontally at track's Y, with spacing from track
    let currentLessonX = TRACK_TO_LESSON_SPACING;
    for (const lessonKey of orderedLessonKeys) {
      const lesson = lessonsByKey.get(lessonKey)!;
      const nodeId = `lesson:${lesson.lessonKey}`;
      lessonKeyToNodeId.set(lesson.lessonKey, nodeId);

      const position = { x: currentLessonX, y: trackY };
      lessonPositions.set(lessonKey, { ...position }); // Store copy

      lessonNodes.push({
        id: nodeId,
        type: "lesson",
        position,
        data: {
          type: "lesson",
          title: lesson.title,
          lessonKey: lesson.lessonKey,
          goal: lesson.goal,
          setupGuidance: lesson.setupGuidance,
          evaluationGuidance: lesson.evaluationGuidance,
          difficultyGuidance: lesson.difficultyGuidance,
        },
      });

      currentLessonX += LESSON_H_SPACING;
    }
  }

  // Generate skill nodes - positioned below the lesson that unlocks them
  const skillNodes: QuestNode[] = [];

  for (const skill of importJson.skills) {
    const nodeId = `skill:${skill.skillKey}`;
    skillKeyToNodeId.set(skill.skillKey, nodeId);

    // Find the first lesson that unlocks this skill
    let unlockingLessonKey: string | null = null;
    for (const lesson of importJson.lessons) {
      if (lesson.awardsSkills.includes(skill.skillKey)) {
        unlockingLessonKey = lesson.lessonKey;
        break;
      }
    }

    let position: { x: number; y: number };
    if (unlockingLessonKey && lessonPositions.has(unlockingLessonKey)) {
      const lessonPos = lessonPositions.get(unlockingLessonKey)!;
      position = {
        x: lessonPos.x,
        y: lessonPos.y + SKILL_V_OFFSET,
      };
    } else {
      // Fallback: position at a default location
      position = {
        x: 0,
        y: 500 + skillNodes.length * (BLOCK_HEIGHT + 20),
      };
      if (unlockingLessonKey) {
        warnings.push({
          message: `Skill "${skill.skillKey}" is unlocked by lesson "${unlockingLessonKey}" but lesson position not found`,
          skillKey: skill.skillKey,
          lessonKey: unlockingLessonKey,
        });
      }
    }

    skillNodes.push({
      id: nodeId,
      type: "skill",
      position,
      data: {
        type: "skill",
        title: skill.title,
        skillKey: skill.skillKey,
        description: skill.description,
        unlockGuidance: skill.unlockGuidance,
      },
    });
  }

  // Reposition tracks and update dependent positions (lessons and skills)
  // Start from offsetY to position below existing nodes
  let currentY = offsetY;
  for (let i = 0; i < trackNodes.length; i++) {
    const track = importJson.tracks[i];
    const trackY = currentY;
    trackNodes[i].position.y = trackY;
    
    // Find max Y for this track (including skills)
    const trackLessonKeys = collectTrackLessons(track.nextLessons, lessonsByKey);
    let maxY = trackY;
    
    for (const lessonKey of trackLessonKeys) {
      const originalPos = lessonPositions.get(lessonKey);
      if (originalPos) {
        // Update lesson Y to match track
        const lessonNode = lessonNodes.find((n) => n.data.lessonKey === lessonKey);
        if (lessonNode) {
          lessonNode.position.y = trackY;
          lessonNode.position.x = originalPos.x;
          const newLessonPos = { x: originalPos.x, y: trackY };
          lessonPositions.set(lessonKey, newLessonPos);
          
          // Update skills below this lesson
          const skills = lessonUnlocksSkills.get(lessonKey) || [];
          for (const skillKey of skills) {
            const skillNode = skillNodes.find((n) => n.data.skillKey === skillKey);
            if (skillNode && skillNode.position.x === originalPos.x) {
              skillNode.position.y = trackY + SKILL_V_OFFSET;
              maxY = Math.max(maxY, skillNode.position.y);
            }
          }
        }
        maxY = Math.max(maxY, trackY);
      }
    }
    
    // Move to next track position with margin
    currentY = maxY + 100;
  }

  // Generate edges
  const edges: QuestEdge[] = [];
  const edgeKeys = new Set<string>(); // For deduplication

  const addEdge = (
    sourceId: string,
    targetId: string,
    sourceHandle: string,
    targetHandle: string,
    edgeType: "default" | "requirement" | "unlockable"
  ) => {
    const edgeKey = `${sourceId}:${sourceHandle}->${targetId}:${targetHandle}:${edgeType}`;
    if (edgeKeys.has(edgeKey)) return;
    edgeKeys.add(edgeKey);

    edges.push({
      id: `edge-${sourceId}-${targetId}-${edgeType}`,
      source: sourceId,
      target: targetId,
      sourceHandle,
      targetHandle,
      data: { type: edgeType },
      selectable: true,
      deletable: true,
    });
  };

  // Track to first lesson edges (track-out → lesson-in)
  for (const track of importJson.tracks) {
    const trackNodeId = trackKeyToNodeId.get(track.trackKey);
    if (!trackNodeId) continue;
    
    // Connect track to each entry lesson (first lesson in tracks.nextLessons)
    for (const entryLessonKey of track.nextLessons) {
      const lessonNodeId = lessonKeyToNodeId.get(entryLessonKey);
      if (lessonNodeId) {
        addEdge(
          trackNodeId,
          lessonNodeId,
          "track-out",
          "lesson-in",
          "default"
        );
      }
    }
  }

  // Lesson sequencing edges (nextLesson - singular)
  for (const lesson of importJson.lessons) {
    if (lesson.nextLesson) {
      const lessonNodeId = lessonKeyToNodeId.get(lesson.lessonKey);
      const nextLessonNodeId = lessonKeyToNodeId.get(lesson.nextLesson);
      if (lessonNodeId && nextLessonNodeId) {
        addEdge(
          lessonNodeId,
          nextLessonNodeId,
          "lesson-out",
          "lesson-in",
          "default"
        );
      }
    }
  }

  // Lesson requires skills edges
  for (const lesson of importJson.lessons) {
    const lessonNodeId = lessonKeyToNodeId.get(lesson.lessonKey);
    if (!lessonNodeId) continue;
    for (const skillKey of lesson.requiresSkills || []) {
      const skillNodeId = skillKeyToNodeId.get(skillKey);
      if (skillNodeId) {
        addEdge(
          lessonNodeId,
          skillNodeId,
          "lesson-required",
          "skill-required",
          "requirement"
        );
      }
    }
  }

  // Lesson awards skills edges
  for (const lesson of importJson.lessons) {
    const lessonNodeId = lessonKeyToNodeId.get(lesson.lessonKey);
    if (!lessonNodeId) continue;
    for (const skillKey of lesson.awardsSkills) {
      const skillNodeId = skillKeyToNodeId.get(skillKey);
      if (skillNodeId) {
        addEdge(
          lessonNodeId,
          skillNodeId,
          "lesson-unlockable",
          "skill-unlockable",
          "unlockable"
        );
      }
    }
  }

  // Track requires skills edges
  for (const track of importJson.tracks) {
    if (track.requiresSkills) {
      const trackNodeId = trackKeyToNodeId.get(track.trackKey);
      if (!trackNodeId) continue;
      for (const skillKey of track.requiresSkills) {
        const skillNodeId = skillKeyToNodeId.get(skillKey);
        if (skillNodeId) {
          addEdge(
            trackNodeId,
            skillNodeId,
            "track-required",
            "skill-required",
            "requirement"
          );
        }
      }
    }
  }

  return {
    data: {
      nodes: [...trackNodes, ...lessonNodes, ...skillNodes],
      edges,
    },
    warnings,
  };
}

/**
 * Exports the authoring graph to the schema import format
 * Converts QuestData (nodes and edges) into SchemaImportFormat JSON
 */
export function exportGraphToSchema(questData: QuestData): SchemaImportFormat {
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
        continue; // Skip invalid tracks
      }
      tracksByKey.set(trackKey, node);
    } else if (node.data.type === "lesson") {
      const lessonKey = node.data.lessonKey;
      if (!lessonKey || lessonKey.trim() === "") {
        continue; // Skip invalid lessons
      }
      lessonsByKey.set(lessonKey, node);
    } else if (node.data.type === "skill") {
      const skillKey = node.data.skillKey;
      if (!skillKey || skillKey.trim() === "") {
        continue; // Skip invalid skills
      }
      skillsByKey.set(skillKey, node);
    }
  }

  // Build relationship maps from edges
  const trackToNextLessons = new Map<string, string[]>(); // trackKey -> lessonKey[]
  const lessonToNextLesson = new Map<string, string>(); // lessonKey -> nextLessonKey (singular)
  const lessonRequiresSkills = new Map<string, string[]>(); // lessonKey -> skillKey[]
  const lessonAwardsSkills = new Map<string, string[]>(); // lessonKey -> skillKey[]
  const trackRequiresSkills = new Map<string, string[]>(); // trackKey -> skillKey[]

  // Process edges to build relationships
  for (const edge of edges) {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);

    if (!sourceNode || !targetNode) continue;

    const sourceHandle = edge.sourceHandle;
    const targetHandle = edge.targetHandle;

    // Track → Lesson: track-out → lesson-in (entry lessons)
    if (
      sourceNode.data.type === "track" &&
      targetNode.data.type === "lesson" &&
      sourceHandle === "track-out" &&
      targetHandle === "lesson-in"
    ) {
      const trackKey = sourceNode.data.trackKey!;
      const lessonKey = targetNode.data.lessonKey!;
      if (!trackToNextLessons.has(trackKey)) {
        trackToNextLessons.set(trackKey, []);
      }
      trackToNextLessons.get(trackKey)!.push(lessonKey);
    }

    // Lesson → Lesson: lesson-out → lesson-in (sequencing)
    if (
      sourceNode.data.type === "lesson" &&
      targetNode.data.type === "lesson" &&
      sourceHandle === "lesson-out" &&
      targetHandle === "lesson-in"
    ) {
      const lessonKey = sourceNode.data.lessonKey!;
      const nextLessonKey = targetNode.data.lessonKey!;
      lessonToNextLesson.set(lessonKey, nextLessonKey);
    }

    // Lesson → Skill: lesson-required → skill-required
    if (
      sourceNode.data.type === "lesson" &&
      targetNode.data.type === "skill" &&
      sourceHandle === "lesson-required" &&
      targetHandle === "skill-required"
    ) {
      const lessonKey = sourceNode.data.lessonKey!;
      const skillKey = targetNode.data.skillKey!;
      if (!lessonRequiresSkills.has(lessonKey)) {
        lessonRequiresSkills.set(lessonKey, []);
      }
      lessonRequiresSkills.get(lessonKey)!.push(skillKey);
    }

    // Lesson → Skill: lesson-unlockable → skill-unlockable
    if (
      sourceNode.data.type === "lesson" &&
      targetNode.data.type === "skill" &&
      sourceHandle === "lesson-unlockable" &&
      targetHandle === "skill-unlockable"
    ) {
      const lessonKey = sourceNode.data.lessonKey!;
      const skillKey = targetNode.data.skillKey!;
      if (!lessonAwardsSkills.has(lessonKey)) {
        lessonAwardsSkills.set(lessonKey, []);
      }
      lessonAwardsSkills.get(lessonKey)!.push(skillKey);
    }

    // Track → Skill: track-required → skill-required
    if (
      sourceNode.data.type === "track" &&
      targetNode.data.type === "skill" &&
      sourceHandle === "track-required" &&
      targetHandle === "skill-required"
    ) {
      const trackKey = sourceNode.data.trackKey!;
      const skillKey = targetNode.data.skillKey!;
      if (!trackRequiresSkills.has(trackKey)) {
        trackRequiresSkills.set(trackKey, []);
      }
      trackRequiresSkills.get(trackKey)!.push(skillKey);
    }
  }

  // Build tracks array
  const tracks: SchemaImportTrack[] = Array.from(tracksByKey.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([trackKey, node]) => {
      const nextLessons = (trackToNextLessons.get(trackKey) || []).sort();
      const requiresSkills = (trackRequiresSkills.get(trackKey) || []).sort();

      const track: SchemaImportTrack = {
        trackKey,
        title: node.data.title,
        nextLessons,
      };

      if (node.data.description) {
        track.description = node.data.description;
      }

      if (requiresSkills.length > 0) {
        track.requiresSkills = requiresSkills;
      }

      return track;
    });

  // Build lessons array
  const lessons: SchemaImportLesson[] = Array.from(lessonsByKey.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([lessonKey, node]) => {
      const requiresSkills = (lessonRequiresSkills.get(lessonKey) || []).sort();
      const awardsSkills = (lessonAwardsSkills.get(lessonKey) || []).sort();
      const nextLesson = lessonToNextLesson.get(lessonKey) || null;

      const lesson: SchemaImportLesson = {
        lessonKey,
        title: node.data.title,
        requiresSkills: requiresSkills.length > 0 ? requiresSkills : undefined,
        awardsSkills,
        nextLesson,
      };

      if (node.data.goal) {
        lesson.goal = node.data.goal;
      }
      if (node.data.setupGuidance) {
        lesson.setupGuidance = node.data.setupGuidance;
      }
      if (node.data.evaluationGuidance) {
        lesson.evaluationGuidance = node.data.evaluationGuidance;
      }
      if (node.data.difficultyGuidance) {
        lesson.difficultyGuidance = node.data.difficultyGuidance;
      }

      return lesson;
    });

  // Build skills array
  const skills: SchemaImportSkill[] = Array.from(skillsByKey.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([skillKey, node]) => {
      const skill: SchemaImportSkill = {
        skillKey,
        title: node.data.title,
      };

      if (node.data.description) {
        skill.description = node.data.description;
      }
      if (node.data.unlockGuidance) {
        skill.unlockGuidance = node.data.unlockGuidance;
      }

      return skill;
    });

  return {
    tracks,
    lessons,
    skills,
  };
}
