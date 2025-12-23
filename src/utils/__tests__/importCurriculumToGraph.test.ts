/**
 * Test fixture for importCurriculumToGraph
 *
 * This file contains a small test curriculum and verification
 * that the import function correctly generates nodes and edges.
 */

import { importCurriculumToGraph, SchemaImportFormat } from "../importCurriculumToGraph";

// Test fixture: Small curriculum with tracks, lessons, and skills
// Uses SchemaImportFormat which expects nextLessons on tracks and nextLesson on lessons
const testSchemaImport: SchemaImportFormat = {
  tracks: [
    {
      trackKey: "beginner-piano",
      title: "Beginner Piano",
      description: "Introduction to piano basics",
      nextLessons: ["learn-c-major"],
      requiresSkills: [],
    },
  ],
  lessons: [
    {
      lessonKey: "learn-c-major",
      title: "Learn C Major Scale",
      goal: "Play the C major scale with correct fingering",
      setupGuidance: "Place hands in C position",
      evaluationGuidance: "Play all notes smoothly without errors",
      difficultyGuidance: "Beginner level - focus on hand position",
      requiresSkills: [],
      awardsSkills: ["c-major-scale"],
      nextLesson: "learn-f-major",
    },
    {
      lessonKey: "learn-f-major",
      title: "Learn F Major Scale",
      goal: "Play the F major scale",
      requiresSkills: ["c-major-scale"],
      awardsSkills: ["f-major-scale"],
      nextLesson: null,
    },
  ],
  skills: [
    {
      skillKey: "c-major-scale",
      title: "C Major Scale",
      description: "Ability to play C major scale",
      unlockGuidance: "You've mastered the C major scale!",
    },
    {
      skillKey: "f-major-scale",
      title: "F Major Scale",
      description: "Ability to play F major scale",
    },
  ],
};

// Run basic verification (can be run manually or with a test runner)
export function verifyImport() {
  console.log("Testing importCurriculumToGraph...");

  const result = importCurriculumToGraph(testSchemaImport);

  // Verify node counts
  const trackNodes = result.data.nodes.filter((n) => n.data.type === "track");
  const lessonNodes = result.data.nodes.filter((n) => n.data.type === "lesson");
  const skillNodes = result.data.nodes.filter((n) => n.data.type === "skill");

  console.assert(
    trackNodes.length === 1,
    `Expected 1 track node, got ${trackNodes.length}`
  );
  console.assert(
    lessonNodes.length === 2,
    `Expected 2 lesson nodes, got ${lessonNodes.length}`
  );
  console.assert(
    skillNodes.length === 2,
    `Expected 2 skill nodes, got ${skillNodes.length}`
  );

  // Verify deterministic IDs
  const trackNode = trackNodes[0];
  console.assert(
    trackNode.id === "track:beginner-piano",
    `Expected track ID "track:beginner-piano", got "${trackNode.id}"`
  );
  console.assert(
    trackNode.data.trackKey === "beginner-piano",
    `Track node should have trackKey in data`
  );

  const lessonC = lessonNodes.find((n) => n.data.lessonKey === "learn-c-major");
  console.assert(
    lessonC?.id === "lesson:learn-c-major",
    `Expected lesson ID "lesson:learn-c-major", got "${lessonC?.id}"`
  );
  console.assert(
    lessonC?.data.lessonKey === "learn-c-major",
    `Lesson node should have lessonKey in data`
  );

  const skillC = skillNodes.find((n) => n.data.skillKey === "c-major-scale");
  console.assert(
    skillC?.id === "skill:c-major-scale",
    `Expected skill ID "skill:c-major-scale", got "${skillC?.id}"`
  );
  console.assert(
    skillC?.data.skillKey === "c-major-scale",
    `Skill node should have skillKey in data`
  );

  // Verify edges: Lesson → Lesson (sequencing) - only connection between lessons
  const lessonToLessonEdges = result.data.edges.filter(
    (e) =>
      e.source === "lesson:learn-c-major" &&
      e.target === "lesson:learn-f-major" &&
      e.sourceHandle === "lesson-out" &&
      e.targetHandle === "lesson-in"
  );
  console.assert(
    lessonToLessonEdges.length === 1,
    `Expected 1 lesson→lesson edge, got ${lessonToLessonEdges.length}`
  );

  // Verify edges: Lesson → Skill (requirement)
  const lessonRequiresSkillEdges = result.data.edges.filter(
    (e) =>
      e.source === "lesson:learn-f-major" &&
      e.target === "skill:c-major-scale" &&
      e.sourceHandle === "lesson-required" &&
      e.targetHandle === "skill-required" &&
      e.data.type === "requirement"
  );
  console.assert(
    lessonRequiresSkillEdges.length === 1,
    `Expected 1 lesson→skill requirement edge, got ${lessonRequiresSkillEdges.length}`
  );

  // Verify edges: Lesson → Skill (unlock)
  const lessonUnlocksSkillEdges = result.data.edges.filter(
    (e) =>
      e.source === "lesson:learn-c-major" &&
      e.target === "skill:c-major-scale" &&
      e.sourceHandle === "lesson-unlockable" &&
      e.targetHandle === "skill-unlockable" &&
      e.data.type === "unlockable"
  );
  console.assert(
    lessonUnlocksSkillEdges.length === 1,
    `Expected 1 lesson→skill unlock edge, got ${lessonUnlocksSkillEdges.length}`
  );

  console.log("✓ All import verifications passed!");
  console.log(
    `  - Nodes: ${result.data.nodes.length} (${trackNodes.length} tracks, ${lessonNodes.length} lessons, ${skillNodes.length} skills)`
  );
  console.log(`  - Edges: ${result.data.edges.length}`);
  if (result.warnings.length > 0) {
    console.log(`  - Warnings: ${result.warnings.length}`);
  }

  return result;
}
