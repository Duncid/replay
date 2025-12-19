import { Edge, Node } from "@xyflow/react";

export type QuestNodeType = "track" | "lesson" | "skill";

export type QuestEdgeType = "requirement" | "unlockable" | "default";

export interface QuestNodeData extends Record<string, unknown> {
  title: string;
  type: QuestNodeType;
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
