import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Types matching QuestEditor
interface QuestNodeData {
  title: string;
  type: "track" | "lesson" | "skill" | "tune";
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
  tuneKey?: string;
  musicRef?: string;
}

interface QuestNode {
  id: string;
  data: QuestNodeData;
  position?: { x: number; y: number };
}

interface QuestEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  type?: string;
  data?: Record<string, unknown>;
}

interface QuestData {
  nodes: QuestNode[];
  edges: QuestEdge[];
}

interface ValidationError {
  type: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

interface ValidationWarning {
  type: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

interface TuneAssetBundle {
  briefing?: Record<string, unknown>;
  nuggets?: Array<Record<string, unknown>>;
  noteSequence: Record<string, unknown>;
  leftHandSequence?: Record<string, unknown>;
  rightHandSequence?: Record<string, unknown>;
}

interface PublishRequest {
  questGraphId: string;
  publishTitle?: string;
  mode: "publish" | "dryRun";
  tuneAssets?: Record<string, TuneAssetBundle>;
}

interface PublishResponse {
  success: boolean;
  versionId?: string;
  publishedAt?: string;
  counts?: {
    nodes: number;
    edges: number;
    tracks: number;
    lessons: number;
    skills: number;
    tunes: number;
  };
  warnings?: string[];
  errors?: string[];
}

// Validation functions
function validateNodeKeys(nodes: QuestNode[]): { errors: ValidationError[]; warnings: ValidationWarning[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const keys = new Set<string>();

  for (const node of nodes) {
    let key: string | undefined;
    
    if (node.data.type === "track") {
      key = node.data.trackKey;
      if (!key || key.trim() === "") {
        errors.push({ type: "missing_key", message: `Track node ${node.id} missing trackKey`, nodeId: node.id });
        continue;
      }
      // Validate track key convention: alphanumeric with underscores (e.g., Intro, Jazz_Basics, A)
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) {
        warnings.push({ type: "key_convention", message: `Track key "${key}" doesn't match convention (should start with letter, alphanumeric/underscores only)`, nodeId: node.id });
      }
    } else if (node.data.type === "lesson") {
      key = node.data.lessonKey;
      if (!key || key.trim() === "") {
        errors.push({ type: "missing_key", message: `Lesson node ${node.id} missing lessonKey`, nodeId: node.id });
        continue;
      }
      // Validate lesson key convention: alphanumeric with dots (A1.1, ...)
      if (!/^[A-Z0-9.]+$/.test(key)) {
        warnings.push({ type: "key_convention", message: `Lesson key "${key}" doesn't match convention (should be alphanumeric with dots)`, nodeId: node.id });
      }
    } else if (node.data.type === "skill") {
      key = node.data.skillKey;
      if (!key || key.trim() === "") {
        errors.push({ type: "missing_key", message: `Skill node ${node.id} missing skillKey`, nodeId: node.id });
        continue;
      }
      // Validate skill key convention: S_* prefix
      if (!key.startsWith("S_")) {
        warnings.push({ type: "key_convention", message: `Skill key "${key}" doesn't match convention (should start with S_)`, nodeId: node.id });
      }
    } else if (node.data.type === "tune") {
      key = node.data.tuneKey;
      if (!key || key.trim() === "") {
        errors.push({ type: "missing_key", message: `Tune node ${node.id} missing tuneKey`, nodeId: node.id });
        continue;
      }
      // Validate tune key convention: lowercase with dashes
      if (!/^[a-z0-9-]+$/.test(key)) {
        warnings.push({ type: "key_convention", message: `Tune key "${key}" doesn't match convention (should be lowercase with dashes)`, nodeId: node.id });
      }
    }

    if (key) {
      if (keys.has(key)) {
        errors.push({ type: "duplicate_key", message: `Duplicate key "${key}" found`, nodeId: node.id });
      } else {
        keys.add(key);
      }
    }
  }

  return { errors, warnings };
}

function validateEdges(
  edges: QuestEdge[],
  nodes: QuestNode[],
  nodeIdMap: Map<string, QuestNode>
): { errors: ValidationError[]; warnings: ValidationWarning[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const lessonNextOutgoing = new Map<string, string>(); // lesson nodeId -> edge id

  for (const edge of edges) {
    const sourceNode = nodeIdMap.get(edge.source);
    const targetNode = nodeIdMap.get(edge.target);

    if (!sourceNode) {
      errors.push({ type: "dangling_edge", message: `Edge ${edge.id} references non-existent source node ${edge.source}`, edgeId: edge.id });
      continue;
    }
    if (!targetNode) {
      errors.push({ type: "dangling_edge", message: `Edge ${edge.id} references non-existent target node ${edge.target}`, edgeId: edge.id });
      continue;
    }

    // Validate lesson_next: max 1 outgoing per lesson
    if (
      sourceNode.data.type === "lesson" &&
      targetNode.data.type === "lesson" &&
      edge.sourceHandle === "lesson-out" &&
      edge.targetHandle === "lesson-in"
    ) {
      if (lessonNextOutgoing.has(edge.source)) {
        errors.push({
          type: "multiple_lesson_next",
          message: `Lesson ${sourceNode.data.lessonKey || edge.source} has multiple lesson_next edges`,
          edgeId: edge.id,
          nodeId: edge.source,
        });
      } else {
        lessonNextOutgoing.set(edge.source, edge.id);
      }
    }

    // Validate skill edges: lessons, tunes, or tracks can connect to skills
    const validSkillConnectors = ["lesson", "tune", "track"];
    if (
      (validSkillConnectors.includes(sourceNode.data.type) && targetNode.data.type === "skill") ||
      (sourceNode.data.type === "skill" && validSkillConnectors.includes(targetNode.data.type))
    ) {
      // Valid skill edge
    } else if (sourceNode.data.type === "skill" || targetNode.data.type === "skill") {
      warnings.push({
        type: "invalid_skill_edge",
        message: `Edge ${edge.id} connects skill to unsupported node type`,
        edgeId: edge.id,
      });
    }
  }

  return { errors, warnings };
}

function validateGraphStructure(
  nodes: QuestNode[],
  edges: QuestEdge[],
  nodeIdMap: Map<string, QuestNode>
): { errors: ValidationError[]; warnings: ValidationWarning[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  
  const skillKeys = new Set<string>();
  const trackStartLessons = new Map<string, string[]>(); // track nodeId -> lesson nodeIds
  const lessonsWithIncomingEdges = new Set<string>(); // lesson nodeIds that have incoming lesson-in edges
  const skillsWithUnlockedBy = new Set<string>(); // skill nodeIds that have incoming skill-unlockable edges

  // Collect skill keys
  for (const node of nodes) {
    if (node.data.type === "skill" && node.data.skillKey) {
      skillKeys.add(node.data.skillKey);
    }
  }

  // Analyze edges to collect relationship data
  for (const edge of edges) {
    const sourceNode = nodeIdMap.get(edge.source);
    const targetNode = nodeIdMap.get(edge.target);
    
    // Track -> Lesson OR Tune (track start items)
    if (
      sourceNode?.data.type === "track" &&
      (targetNode?.data.type === "lesson" || targetNode?.data.type === "tune") &&
      edge.sourceHandle === "track-out" &&
      (edge.targetHandle === "lesson-in" || edge.targetHandle === "tune-in")
    ) {
      if (!trackStartLessons.has(edge.source)) {
        trackStartLessons.set(edge.source, []);
      }
      trackStartLessons.get(edge.source)!.push(edge.target);
      if (targetNode?.data.type === "lesson") {
        lessonsWithIncomingEdges.add(edge.target);
      }
    }
    
    // Lesson -> Lesson (lesson chain)
    if (
      sourceNode?.data.type === "lesson" &&
      targetNode?.data.type === "lesson" &&
      edge.sourceHandle === "lesson-out" &&
      edge.targetHandle === "lesson-in"
    ) {
      lessonsWithIncomingEdges.add(edge.target);
    }
    
    // Lesson OR Tune -> Skill (skill unlocked by)
    if (
      (sourceNode?.data.type === "lesson" || sourceNode?.data.type === "tune") &&
      targetNode?.data.type === "skill" &&
      (edge.sourceHandle === "lesson-unlockable" || edge.sourceHandle === "tune-unlockable") &&
      edge.targetHandle === "skill-unlockable"
    ) {
      skillsWithUnlockedBy.add(edge.target);
    }
  }

  // Validate tracks have at least one start lesson
  for (const node of nodes) {
    if (node.data.type === "track") {
      const startLessons = trackStartLessons.get(node.id) || [];
      if (startLessons.length === 0) {
        warnings.push({
          type: "track_no_start",
          message: `Track "${node.data.trackKey || node.id}" has no start lessons or tunes`,
          nodeId: node.id,
        });
      }
    }
  }

  // Check for orphan lessons (lessons with no incoming lesson-in edge from track or previous lesson)
  for (const node of nodes) {
    if (node.data.type === "lesson") {
      if (!lessonsWithIncomingEdges.has(node.id)) {
        warnings.push({
          type: "orphan_lesson",
          message: `Lesson "${node.data.lessonKey || node.id}" has no previous lesson or track connection`,
          nodeId: node.id,
        });
      }
    }
  }

  // Check for orphan skills (skills with no "unlocked by" connection)
  for (const node of nodes) {
    if (node.data.type === "skill") {
      if (!skillsWithUnlockedBy.has(node.id)) {
        warnings.push({
          type: "orphan_skill",
          message: `Skill "${node.data.skillKey || node.id}" is not unlocked by any lesson or tune`,
          nodeId: node.id,
        });
      }
    }
  }

  // Check for cycles in lesson_next chain
  const lessonNextMap = new Map<string, string>(); // lesson nodeId -> next lesson nodeId
  for (const edge of edges) {
    const sourceNode = nodeIdMap.get(edge.source);
    const targetNode = nodeIdMap.get(edge.target);
    
    if (
      sourceNode?.data.type === "lesson" &&
      targetNode?.data.type === "lesson" &&
      edge.sourceHandle === "lesson-out" &&
      edge.targetHandle === "lesson-in"
    ) {
      lessonNextMap.set(edge.source, edge.target);
    }
  }

  // Detect cycles
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  
  function hasCycle(nodeId: string): boolean {
    if (recursionStack.has(nodeId)) {
      return true;
    }
    if (visited.has(nodeId)) {
      return false;
    }
    
    visited.add(nodeId);
    recursionStack.add(nodeId);
    
    const nextId = lessonNextMap.get(nodeId);
    if (nextId && hasCycle(nextId)) {
      return true;
    }
    
    recursionStack.delete(nodeId);
    return false;
  }

  for (const nodeId of lessonNextMap.keys()) {
    if (!visited.has(nodeId) && hasCycle(nodeId)) {
      errors.push({
        type: "lesson_cycle",
        message: "Cycle detected in lesson chain - this will cause infinite loops",
        nodeId,
      });
    }
  }

  return { errors, warnings };
}

// Transform editor graph to runtime format
function transformToRuntime(
  questData: QuestData
): {
  nodes: Array<{
    kind: "track" | "lesson" | "skill" | "tune";
    key: string;
    title: string;
    description: string | null;
    data: Record<string, unknown>;
  }>;
  edges: Array<{
    type: "track_starts_with" | "lesson_next" | "lesson_requires_skill" | "lesson_awards_skill" | "tune_next" | "tune_requires_skill" | "tune_awards_skill" | "track_requires_skill";
    fromKey: string;
    toKey: string;
  }>;
  nodeIdMap: Map<string, string>; // editor nodeId -> runtime key
  keyToNodeId: Map<string, string>; // runtime key -> editor nodeId
} {
  const nodes: Array<{
    kind: "track" | "lesson" | "skill" | "tune";
    key: string;
    title: string;
    description: string | null;
    data: Record<string, unknown>;
  }> = [];
  
  const edges: Array<{
    type: "track_starts_with" | "lesson_next" | "lesson_requires_skill" | "lesson_awards_skill" | "tune_next" | "tune_requires_skill" | "tune_awards_skill" | "track_requires_skill";
    fromKey: string;
    toKey: string;
  }> = [];
  
  const nodeIdMap = new Map<string, string>(); // editor nodeId -> runtime key
  const keyToNodeId = new Map<string, string>(); // runtime key -> editor nodeId
  const editorNodeMap = new Map<string, QuestNode>();

  // Build node maps
  for (const node of questData.nodes) {
    editorNodeMap.set(node.id, node);
    let key: string | undefined;
    
    if (node.data.type === "track" && node.data.trackKey) {
      key = node.data.trackKey;
    } else if (node.data.type === "lesson" && node.data.lessonKey) {
      key = node.data.lessonKey;
    } else if (node.data.type === "skill" && node.data.skillKey) {
      key = node.data.skillKey;
    } else if (node.data.type === "tune" && node.data.tuneKey) {
      key = node.data.tuneKey;
    }

    if (key) {
      nodeIdMap.set(node.id, key);
      keyToNodeId.set(key, node.id);
    }
  }

  // Transform nodes
  for (const node of questData.nodes) {
    const key = nodeIdMap.get(node.id);
    if (!key) continue;

    let nodeData: Record<string, unknown> = {};

    if (node.data.type === "lesson") {
      nodeData = {
        goal: node.data.goal || null,
        setupGuidance: node.data.setupGuidance || null,
        evaluationGuidance: node.data.evaluationGuidance || null,
        difficultyGuidance: node.data.difficultyGuidance || null,
        level: (node.data as { level?: string }).level || null,
      };
    } else if (node.data.type === "skill") {
      nodeData = {
        unlockGuidance: node.data.unlockGuidance || null,
      };
    } else if (node.data.type === "tune") {
      nodeData = {
        musicRef: node.data.musicRef || null,
        level: (node.data as { level?: string }).level || null,
        evaluationGuidance: node.data.evaluationGuidance || null,
      };
    }
    // Track data can be empty or future-proofed

    nodes.push({
      kind: node.data.type,
      key,
      title: node.data.title,
      description: node.data.description || null,
      data: nodeData,
    });
  }

  // Transform edges
  for (const edge of questData.edges) {
    const fromKey = nodeIdMap.get(edge.source);
    const toKey = nodeIdMap.get(edge.target);
    if (!fromKey || !toKey) continue;

    const sourceNode = editorNodeMap.get(edge.source);
    const targetNode = editorNodeMap.get(edge.target);
    if (!sourceNode || !targetNode) continue;

    let edgeType: "track_starts_with" | "lesson_next" | "lesson_requires_skill" | "lesson_awards_skill" | "tune_next" | "tune_requires_skill" | "tune_awards_skill" | "track_requires_skill" | null = null;

    // track-out → lesson-in OR tune-in → track_starts_with
    if (
      sourceNode.data.type === "track" &&
      (targetNode.data.type === "lesson" || targetNode.data.type === "tune") &&
      edge.sourceHandle === "track-out" &&
      (edge.targetHandle === "lesson-in" || edge.targetHandle === "tune-in")
    ) {
      edgeType = "track_starts_with";
    }
    // lesson-out → lesson-in OR tune-in → lesson_next
    else if (
      sourceNode.data.type === "lesson" &&
      (targetNode.data.type === "lesson" || targetNode.data.type === "tune") &&
      edge.sourceHandle === "lesson-out" &&
      (edge.targetHandle === "lesson-in" || edge.targetHandle === "tune-in")
    ) {
      edgeType = "lesson_next";
    }
    // tune-out → tune-in OR lesson-in → tune_next
    else if (
      sourceNode.data.type === "tune" &&
      (targetNode.data.type === "tune" || targetNode.data.type === "lesson") &&
      edge.sourceHandle === "tune-out" &&
      (edge.targetHandle === "tune-in" || edge.targetHandle === "lesson-in")
    ) {
      edgeType = "tune_next";
    }
    // lesson-required → skill-required → lesson_requires_skill
    else if (
      sourceNode.data.type === "lesson" &&
      targetNode.data.type === "skill" &&
      edge.sourceHandle === "lesson-required" &&
      edge.targetHandle === "skill-required"
    ) {
      edgeType = "lesson_requires_skill";
    }
    // lesson-unlockable → skill-unlockable → lesson_awards_skill
    else if (
      sourceNode.data.type === "lesson" &&
      targetNode.data.type === "skill" &&
      edge.sourceHandle === "lesson-unlockable" &&
      edge.targetHandle === "skill-unlockable"
    ) {
      edgeType = "lesson_awards_skill";
    }
    // tune-required → skill-required → tune_requires_skill
    else if (
      sourceNode.data.type === "tune" &&
      targetNode.data.type === "skill" &&
      edge.sourceHandle === "tune-required" &&
      edge.targetHandle === "skill-required"
    ) {
      edgeType = "tune_requires_skill";
    }
    // tune-unlockable → skill-unlockable → tune_awards_skill
    else if (
      sourceNode.data.type === "tune" &&
      targetNode.data.type === "skill" &&
      edge.sourceHandle === "tune-unlockable" &&
      edge.targetHandle === "skill-unlockable"
    ) {
      edgeType = "tune_awards_skill";
    }
    // track-required → skill-required → track_requires_skill
    else if (
      sourceNode.data.type === "track" &&
      targetNode.data.type === "skill" &&
      edge.sourceHandle === "track-required" &&
      edge.targetHandle === "skill-required"
    ) {
      edgeType = "track_requires_skill";
    }

    if (edgeType) {
      edges.push({ type: edgeType, fromKey, toKey });
    }
  }

  return { nodes, edges, nodeIdMap, keyToNodeId };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestBody: PublishRequest = await req.json();
    const { questGraphId, publishTitle, mode, tuneAssets } = requestBody;

    if (!questGraphId || typeof questGraphId !== "string") {
      return new Response(
        JSON.stringify({ success: false, errors: ["Missing or invalid questGraphId"] }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (mode !== "publish" && mode !== "dryRun") {
      return new Response(
        JSON.stringify({ success: false, errors: ["Invalid mode. Must be 'publish' or 'dryRun'"] }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Load quest graph
    const { data: questGraph, error: loadError } = await supabase
      .from("quest_graphs")
      .select("*")
      .eq("id", questGraphId)
      .single();

    if (loadError || !questGraph) {
      return new Response(
        JSON.stringify({ success: false, errors: [`Failed to load quest graph: ${loadError?.message || "Not found"}`] }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const questData = questGraph.data as QuestData;
    if (!questData.nodes || !questData.edges) {
      return new Response(
        JSON.stringify({ success: false, errors: ["Invalid quest graph format"] }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build node ID map for validation
    const nodeIdMap = new Map<string, QuestNode>();
    for (const node of questData.nodes) {
      nodeIdMap.set(node.id, node);
    }

    // Validate
    const keyValidation = validateNodeKeys(questData.nodes);
    const edgeValidation = validateEdges(questData.edges, questData.nodes, nodeIdMap);
    const structureValidation = validateGraphStructure(questData.nodes, questData.edges, nodeIdMap);

    const allErrors = [
      ...keyValidation.errors,
      ...edgeValidation.errors,
      ...structureValidation.errors,
    ];
    const allWarnings = [
      ...keyValidation.warnings,
      ...edgeValidation.warnings,
      ...structureValidation.warnings,
    ];

    // Transform to runtime format
    const runtimeData = transformToRuntime(questData);

    // Generate export JSON (using existing exportGraphToSchema logic)
    // For now, we'll store the questData as-is, but ideally we'd use exportGraphToSchema
    const exportJson = {
      tracks: runtimeData.nodes.filter(n => n.kind === "track").map(n => ({
        trackKey: n.key,
        title: n.title,
        description: n.description,
      })),
      lessons: runtimeData.nodes.filter(n => n.kind === "lesson").map(n => ({
        lessonKey: n.key,
        title: n.title,
        goal: (n.data as { goal?: string }).goal,
        setupGuidance: (n.data as { setupGuidance?: string }).setupGuidance,
        evaluationGuidance: (n.data as { evaluationGuidance?: string }).evaluationGuidance,
        difficultyGuidance: (n.data as { difficultyGuidance?: string }).difficultyGuidance,
      })),
      skills: runtimeData.nodes.filter(n => n.kind === "skill").map(n => ({
      skillKey: n.key,
      title: n.title,
      description: n.description,
      unlockGuidance: (n.data as { unlockGuidance?: string }).unlockGuidance,
    })),
    tunes: runtimeData.nodes.filter(n => n.kind === "tune").map(n => ({
      tuneKey: n.key,
      title: n.title,
      description: n.description,
      musicRef: (n.data as { musicRef?: string }).musicRef,
      level: (n.data as { level?: string }).level,
      evaluationGuidance: (n.data as { evaluationGuidance?: string }).evaluationGuidance,
    })),
    edges: runtimeData.edges.map(e => ({
        source_key: e.fromKey,
        target_key: e.toKey,
        edge_type: e.type,
      })),
    };

  // Counts
  const counts = {
    nodes: runtimeData.nodes.length,
    edges: runtimeData.edges.length,
    tracks: runtimeData.nodes.filter(n => n.kind === "track").length,
    lessons: runtimeData.nodes.filter(n => n.kind === "lesson").length,
    skills: runtimeData.nodes.filter(n => n.kind === "skill").length,
    tunes: runtimeData.nodes.filter(n => n.kind === "tune").length,
  };

    // If dry run, return validation results
    if (mode === "dryRun") {
      return new Response(
        JSON.stringify({
          success: allErrors.length === 0,
          counts,
          warnings: allWarnings.map(w => w.message),
          errors: allErrors.map(e => e.message),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If there are errors, don't publish
    if (allErrors.length > 0) {
      return new Response(
        JSON.stringify({
          success: false,
          errors: allErrors.map(e => e.message),
          warnings: allWarnings.map(w => w.message),
          counts,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Publish: Execute transaction
    // Note: Supabase doesn't support explicit transactions in JS client,
    // but we can use RPC functions or execute sequentially with error handling
    // For now, we'll do sequential inserts and handle errors

    // First, get the next version number for this quest graph
    const { data: existingVersions, error: versionQueryError } = await supabase
      .from("curriculum_versions")
      .select("version_number")
      .eq("quest_graph_id", questGraphId)
      .order("version_number", { ascending: false })
      .limit(1);

    if (versionQueryError) {
      console.error("[curriculum-publish] Failed to query existing versions:", versionQueryError);
      return new Response(
        JSON.stringify({ success: false, errors: [`Failed to query versions: ${versionQueryError.message}`] }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const nextVersionNumber = (existingVersions?.[0]?.version_number ?? 0) + 1;

    // 1. Create version
    const versionTitle = publishTitle || `Published from ${questGraph.title}`;
    const { data: versionData, error: versionError } = await supabase
      .from("curriculum_versions")
      .insert({
        quest_graph_id: questGraphId,
        version_number: nextVersionNumber,
        title: versionTitle,
        status: "publishing",
      })
      .select()
      .single();

    if (versionError || !versionData) {
      console.error("[curriculum-publish] Failed to create version:", versionError);
      return new Response(
        JSON.stringify({ success: false, errors: [`Failed to create version: ${versionError?.message || "No data returned"}`] }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[curriculum-publish] Created version:", versionData.id);
    const versionId = versionData.id;

    // 2. Insert nodes
    const nodeInserts = runtimeData.nodes.map(node => ({
      version_id: versionId,
      node_key: node.key,
      node_type: node.kind,
      data: {
        title: node.title,
        description: node.description,
        ...node.data,
      },
    }));

    const { data: insertedNodes, error: nodesError } = await supabase
      .from("curriculum_nodes")
      .insert(nodeInserts)
      .select();

    if (nodesError) {
      console.error("[curriculum-publish] Failed to insert nodes:", nodesError);
      // Cleanup: delete version
      await supabase.from("curriculum_versions").delete().eq("id", versionId);
      return new Response(
        JSON.stringify({ success: false, errors: [`Failed to insert nodes: ${nodesError.message}`] }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[curriculum-publish] Inserted nodes:", insertedNodes?.length);

    // 3. Insert edges
    const edgeInserts = runtimeData.edges.map(edge => ({
      version_id: versionId,
      source_key: edge.fromKey,
      target_key: edge.toKey,
      edge_type: edge.type,
    }));

    const { error: edgesError } = await supabase
      .from("curriculum_edges")
      .insert(edgeInserts);

    if (edgesError) {
      console.error("[curriculum-publish] Failed to insert edges:", edgesError);
      // Cleanup: delete nodes and version
      await supabase.from("curriculum_nodes").delete().eq("version_id", versionId);
      await supabase.from("curriculum_versions").delete().eq("id", versionId);
      return new Response(
        JSON.stringify({ success: false, errors: [`Failed to insert edges: ${edgesError.message}`] }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[curriculum-publish] Inserted edges:", edgeInserts.length);

    // 4. Insert export snapshot
    const { error: exportError } = await supabase
      .from("curriculum_exports")
      .insert({
        version_id: versionId,
        snapshot: exportJson,
      });

    if (exportError) {
      console.error("[curriculum-publish] Failed to insert export:", exportError);
      // Cleanup: delete edges, nodes, and version
      await supabase.from("curriculum_edges").delete().eq("version_id", versionId);
      await supabase.from("curriculum_nodes").delete().eq("version_id", versionId);
      await supabase.from("curriculum_versions").delete().eq("id", versionId);
      return new Response(
        JSON.stringify({ success: false, errors: [`Failed to insert export: ${exportError.message}`] }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[curriculum-publish] Inserted export snapshot");

    // 5. Insert tune assets if provided
    // Merge evaluationGuidance from curriculum nodes into briefing
    const tuneNodes = runtimeData.nodes.filter(n => n.kind === "tune");
    const tuneEvalGuidanceMap = new Map<string, string | null>();
    for (const tuneNode of tuneNodes) {
      const evalGuidance = (tuneNode.data as { evaluationGuidance?: string }).evaluationGuidance || null;
      tuneEvalGuidanceMap.set(tuneNode.key, evalGuidance);
    }

    let tuneAssetsInserted = 0;
    if (tuneAssets && Object.keys(tuneAssets).length > 0) {
      const tuneAssetRows = Object.entries(tuneAssets).map(([tuneKey, assets]) => {
        // Merge evaluationGuidance into briefing
        const evaluationGuidance = tuneEvalGuidanceMap.get(tuneKey) || null;
        const briefing = {
          ...(assets.briefing || {}),
          ...(evaluationGuidance ? { evaluationGuidance } : {}),
        };
        
        return {
          version_id: versionId,
          tune_key: tuneKey,
          briefing: Object.keys(briefing).length > 0 ? briefing : null,
          note_sequence: assets.noteSequence,
          left_hand_sequence: assets.leftHandSequence || null,
          right_hand_sequence: assets.rightHandSequence || null,
          nuggets: assets.nuggets || null,
        };
      });

      const { error: tuneAssetsError } = await supabase
        .from("tune_assets")
        .upsert(tuneAssetRows, { onConflict: "version_id,tune_key" });

      if (tuneAssetsError) {
        console.error("[curriculum-publish] Failed to insert tune assets:", tuneAssetsError);
        // Non-fatal: log warning but continue
        allWarnings.push({
          type: "tune_assets_failed",
          message: `Failed to insert tune assets: ${tuneAssetsError.message}`,
        });
      } else {
        tuneAssetsInserted = tuneAssetRows.length;
        console.log("[curriculum-publish] Inserted tune assets:", tuneAssetsInserted);
      }
    }

    // 6. Update version status to published
    const publishedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("curriculum_versions")
      .update({
        status: "published",
        published_at: publishedAt,
      })
      .eq("id", versionId);

    if (updateError) {
      // Version exists but status update failed - still return success with warning
      console.error("[curriculum-publish] Failed to update version status:", updateError);
    } else {
      console.log("[curriculum-publish] Updated version status to published");
    }

    return new Response(
      JSON.stringify({
        success: true,
        versionId,
        versionNumber: nextVersionNumber,
        publishedAt,
        counts: {
          ...counts,
          tuneAssets: tuneAssetsInserted,
        },
        warnings: allWarnings.map(w => w.message),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in curriculum-publish:", error);
    return new Response(
      JSON.stringify({
        success: false,
        errors: [error instanceof Error ? error.message : "Unknown error"],
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

