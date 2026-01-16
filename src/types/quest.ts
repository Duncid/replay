import { Edge, Node } from "@xyflow/react";

export type QuestNodeType = "track" | "lesson" | "skill" | "tune";

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
  // Tune-specific fields
  tuneKey?: string;
  musicRef?: string;
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
  requiresLessons?: string[];
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

export interface TuneExport {
  tuneKey: string;
  title: string;
  description?: string;
  musicRef: string;
  level?: "beginner" | "intermediate" | "advanced";
  evaluationGuidance?: string;
  trackKey?: string;
  requiresSkills: string[];
  awardsSkills: string[];
  previousItem?: { type: "lesson" | "tune"; key: string };
  nextItem?: { type: "lesson" | "tune"; key: string };
  _debug?: {
    nodeId: string;
    position?: { x: number; y: number };
  };
}

export interface CurriculumExport {
  tracks: TrackExport[];
  lessons: LessonExport[];
  skills: SkillExport[];
  tunes: TuneExport[];
}
