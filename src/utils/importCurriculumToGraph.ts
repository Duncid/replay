/**
 * Import Curriculum Export to Graph
 *
 * Converts the compiled curriculum export JSON into the authoring graph format.
 *
 * Node IDs are deterministic: "track:{trackKey}", "lesson:{lessonKey}", "skill:{skillKey}"
 *
 * Edge Generation:
 * - Lesson sequencing: lesson.nextLessons → lesson-out → lesson-in (default)
 * - Lesson requires skills: lesson.requiresSkills → lesson-required → skill-required (requirement)
 * - Lesson awards skills: lesson.awardsSkills → lesson-unlockable → skill-unlockable (unlockable)
 * - Track requires skills: track.requiresSkills → track-required → skill-required (requirement)
 *
 * Note: Track membership is NOT created via edges. Lessons are only linked through
 * lesson-to-lesson sequencing (nextLessons). Track membership is preserved in lesson.trackKey.
 *
 * Layout:
 * - Tracks: Top row at y=0, horizontally spaced
 * - Lessons: Under parent track, vertically spaced by nextLessons order
 * - Skills: Right side, positioned by barycenter of related lessons
 */

import {
  CurriculumExport,
  LessonExport,
  QuestData,
  QuestEdge,
  QuestNode,
  SkillExport,
  TrackExport,
} from "@/types/quest";

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
const TRACK_Y = 0;
const LESSON_Y_START = 140;
const SKILL_X_OFFSET = 600;
const V_SPACING = 120;
const H_SPACING = 320;

/**
 * Builds topological order of lessons based on nextLessons relationships.
 * Entry lessons (no incoming nextLessons) come first, then their successors.
 */
function buildLessonOrder(
  lessons: LessonExport[],
  lessonKeyToIndex: Map<string, number>
): Map<string, number> {
  const order = new Map<string, number>();
  const visited = new Set<string>();

  // Build reverse index: which lessons point to each lesson
  const incomingEdges = new Map<string, Set<string>>();
  for (const lesson of lessons) {
    if (!incomingEdges.has(lesson.lessonKey)) {
      incomingEdges.set(lesson.lessonKey, new Set());
    }
    if (lesson.nextLessons) {
      for (const nextKey of lesson.nextLessons) {
        if (!incomingEdges.has(nextKey)) {
          incomingEdges.set(nextKey, new Set());
        }
        incomingEdges.get(nextKey)!.add(lesson.lessonKey);
      }
    }
  }

  // Find entry lessons (no incoming edges)
  const entryLessons = lessons.filter((lesson) => {
    const incoming = incomingEdges.get(lesson.lessonKey);
    return !incoming || incoming.size === 0;
  });

  let currentOrder = 0;

  const visit = (lessonKey: string): void => {
    if (visited.has(lessonKey)) return;
    visited.add(lessonKey);
    order.set(lessonKey, currentOrder++);

    const lesson = lessons[lessonKeyToIndex.get(lessonKey)!];
    if (lesson.nextLessons) {
      for (const nextKey of lesson.nextLessons) {
        visit(nextKey);
      }
    }
  };

  // Visit entry lessons first, then their successors
  for (const entryLesson of entryLessons) {
    visit(entryLesson.lessonKey);
  }

  // Visit any remaining lessons (in case of disconnected components or cycles)
  for (const lesson of lessons) {
    if (!visited.has(lesson.lessonKey)) {
      visit(lesson.lessonKey);
    }
  }

  return order;
}

/**
 * Calculate barycenter (average position) of lessons for skill positioning
 */
function calculateBarycenter(
  lessonKeys: string[],
  lessonKeyToNodeId: Map<string, string>,
  nodes: QuestNode[]
): { x: number; y: number } | null {
  const positions: { x: number; y: number }[] = [];

  for (const lessonKey of lessonKeys) {
    const nodeId = lessonKeyToNodeId.get(lessonKey);
    if (!nodeId) continue;
    const node = nodes.find((n) => n.id === nodeId);
    if (node) {
      positions.push(node.position);
    }
  }

  if (positions.length === 0) return null;

  const sumX = positions.reduce((sum, p) => sum + p.x, 0);
  const sumY = positions.reduce((sum, p) => sum + p.y, 0);

  return {
    x: sumX / positions.length,
    y: sumY / positions.length,
  };
}

/**
 * Imports a curriculum export JSON into the authoring graph format
 */
export function importCurriculumToGraph(
  exportJson: CurriculumExport
): ImportResult {
  const warnings: ImportWarning[] = [];

  // Build key maps for validation and lookup
  const tracksByKey = new Map<string, TrackExport>();
  const lessonsByKey = new Map<string, LessonExport>();
  const skillsByKey = new Map<string, SkillExport>();

  // Validate and build maps
  const trackKeys = new Set<string>();
  const lessonKeys = new Set<string>();
  const skillKeys = new Set<string>();

  for (const track of exportJson.tracks) {
    if (trackKeys.has(track.trackKey)) {
      throw new Error(`Duplicate trackKey: ${track.trackKey}`);
    }
    trackKeys.add(track.trackKey);
    tracksByKey.set(track.trackKey, track);
  }

  for (const lesson of exportJson.lessons) {
    if (lessonKeys.has(lesson.lessonKey)) {
      throw new Error(`Duplicate lessonKey: ${lesson.lessonKey}`);
    }
    lessonKeys.add(lesson.lessonKey);
    lessonsByKey.set(lesson.lessonKey, lesson);

    // Validate trackKey reference
    if (!tracksByKey.has(lesson.trackKey)) {
      throw new Error(
        `Lesson "${lesson.lessonKey}" references non-existent trackKey: ${lesson.trackKey}`
      );
    }
  }

  for (const skill of exportJson.skills) {
    if (skillKeys.has(skill.skillKey)) {
      throw new Error(`Duplicate skillKey: ${skill.skillKey}`);
    }
    skillKeys.add(skill.skillKey);
    skillsByKey.set(skill.skillKey, skill);
  }

  // Validate skill references
  for (const lesson of exportJson.lessons) {
    for (const skillKey of lesson.requiresSkills) {
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

  for (const track of exportJson.tracks) {
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

  // Generate track nodes
  const trackNodes: QuestNode[] = exportJson.tracks.map((track, index) => {
    const nodeId = `track:${track.trackKey}`;
    trackKeyToNodeId.set(track.trackKey, nodeId);

    return {
      id: nodeId,
      type: "track",
      position: {
        x: index * H_SPACING,
        y: TRACK_Y,
      },
      data: {
        type: "track",
        title: track.title,
        trackKey: track.trackKey,
        description: track.description,
      },
    };
  });

  // Group lessons by track and build order
  const lessonsByTrack = new Map<string, LessonExport[]>();
  const lessonKeyToIndex = new Map<string, number>();

  exportJson.lessons.forEach((lesson, index) => {
    lessonKeyToIndex.set(lesson.lessonKey, index);
    if (!lessonsByTrack.has(lesson.trackKey)) {
      lessonsByTrack.set(lesson.trackKey, []);
    }
    lessonsByTrack.get(lesson.trackKey)!.push(lesson);
  });

  // Build topological order for lessons
  const lessonOrder = buildLessonOrder(exportJson.lessons, lessonKeyToIndex);

  // Generate lesson nodes
  const lessonNodes: QuestNode[] = [];

  for (const [trackKey, trackLessons] of lessonsByTrack.entries()) {
    const trackNodeId = trackKeyToNodeId.get(trackKey)!;
    const trackNode = trackNodes.find((n) => n.id === trackNodeId)!;

    // Sort lessons by order (topological order from nextLessons)
    const sortedLessons = [...trackLessons].sort((a, b) => {
      const orderA = lessonOrder.get(a.lessonKey) ?? Infinity;
      const orderB = lessonOrder.get(b.lessonKey) ?? Infinity;
      return orderA - orderB;
    });

    sortedLessons.forEach((lesson, lessonIndex) => {
      const nodeId = `lesson:${lesson.lessonKey}`;
      lessonKeyToNodeId.set(lesson.lessonKey, nodeId);

      lessonNodes.push({
        id: nodeId,
        type: "lesson",
        position: {
          x: trackNode.position.x,
          y: LESSON_Y_START + lessonIndex * V_SPACING,
        },
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
    });

    // Note: We don't validate track.lessonKeys anymore since we don't use it for edge generation
  }

  // Generate skill nodes with barycenter positioning
  const skillNodes: QuestNode[] = [];
  const allNodes = [...trackNodes, ...lessonNodes];

  exportJson.skills.forEach((skill, skillIndex) => {
    const nodeId = `skill:${skill.skillKey}`;
    skillKeyToNodeId.set(skill.skillKey, nodeId);

    // Calculate barycenter from related lessons
    const relatedLessons = [
      ...skill.awardedByLessons,
      ...skill.requiredByLessons,
    ];
    const barycenter = calculateBarycenter(
      relatedLessons,
      lessonKeyToNodeId,
      allNodes
    );

    let position: { x: number; y: number };
    if (barycenter) {
      position = {
        x: SKILL_X_OFFSET,
        y: barycenter.y,
      };
    } else {
      // Fallback: stack vertically
      position = {
        x: SKILL_X_OFFSET,
        y: LESSON_Y_START + skillIndex * V_SPACING,
      };
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
  });

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

  // Lesson sequencing edges (nextLessons) - only way lessons are connected
  for (const lesson of exportJson.lessons) {
    const lessonNodeId = lessonKeyToNodeId.get(lesson.lessonKey)!;
    if (lesson.nextLessons) {
      for (const nextLessonKey of lesson.nextLessons) {
        const nextLessonNodeId = lessonKeyToNodeId.get(nextLessonKey);
        if (nextLessonNodeId) {
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
  }

  // Lesson requires skills edges
  for (const lesson of exportJson.lessons) {
    const lessonNodeId = lessonKeyToNodeId.get(lesson.lessonKey)!;
    for (const skillKey of lesson.requiresSkills) {
      const skillNodeId = skillKeyToNodeId.get(skillKey)!;
      addEdge(
        lessonNodeId,
        skillNodeId,
        "lesson-required",
        "skill-required",
        "requirement"
      );
    }
  }

  // Lesson awards skills edges
  for (const lesson of exportJson.lessons) {
    const lessonNodeId = lessonKeyToNodeId.get(lesson.lessonKey)!;
    for (const skillKey of lesson.awardsSkills) {
      const skillNodeId = skillKeyToNodeId.get(skillKey)!;
      addEdge(
        lessonNodeId,
        skillNodeId,
        "lesson-unlockable",
        "skill-unlockable",
        "unlockable"
      );
    }
  }

  // Track requires skills edges
  for (const track of exportJson.tracks) {
    if (track.requiresSkills) {
      const trackNodeId = trackKeyToNodeId.get(track.trackKey)!;
      for (const skillKey of track.requiresSkills) {
        const skillNodeId = skillKeyToNodeId.get(skillKey)!;
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

  return {
    data: {
      nodes: [...trackNodes, ...lessonNodes, ...skillNodes],
      edges,
    },
    warnings,
  };
}
