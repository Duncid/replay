import { Edge, Node } from "@xyflow/react";

export type QuestNodeType = "track" | "lesson" | "skill";

export type QuestEdgeType = "requirement" | "unlockable" | "default";

export interface QuestNodeData extends Record<string, unknown> {
  title: string;
  type: QuestNodeType;
  order?: number;
  description?: string;
  trackKey?: string;
  skillKey?: string;
  unlockGuidance?: string;
  lessonKey?: string;
  goal?: string;
  setupGuidance?: string;
  evaluationGuidance?: string;
  difficultyGuidance?: string;
  level?: "beginner" | "intermediate" | "advanced";
}

export type QuestNode = Node<QuestNodeData>;

export interface QuestEdgeData extends Record<string, unknown> {
  type?: QuestEdgeType;
}

export type QuestEdge = Edge<QuestEdgeData>;

export interface QuestData {
  nodes: QuestNode[];
  edges: QuestEdge[];
}

// Export types for runtime curriculum
export interface TrackExport {
  trackKey: string;
  title: string;
  description?: string;
  lessonKeys: string[];
  requiresSkills?: string[];
  _debug?: {
    nodeId: string;
    position?: { x: number; y: number };
  };
}

export interface LessonExport {
  lessonKey: string;
  title: string;
  goal?: string;
  setupGuidance?: string;
  evaluationGuidance?: string;
  difficultyGuidance?: string;
  level?: "beginner" | "intermediate" | "advanced";
  trackKey: string;
  requiresSkills: string[];
  awardsSkills: string[];
  nextLessons?: string[];
  _debug?: {
    nodeId: string;
    position?: { x: number; y: number };
  };
}

export interface SkillExport {
  skillKey: string;
  title: string;
  description?: string;
  unlockGuidance?: string;
  requiredByLessons: string[];
  awardedByLessons: string[];
  requiredByTracks: string[];
  _debug?: {
    nodeId: string;
    position?: { x: number; y: number };
  };
}

export interface CurriculumExport {
  tracks: TrackExport[];
  lessons: LessonExport[];
  skills: SkillExport[];
}
