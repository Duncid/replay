import i18n from "@/lib/i18n";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { QuestGraph, useQuestGraphs } from "@/hooks/useQuestGraphs";
import { usePublishedTuneKeys } from "@/hooks/useTuneQueries";
import { supabase } from "@/integrations/supabase/client";
import {
  QuestData,
  QuestEdge,
  QuestEdgeType,
  QuestNode,
  QuestNodeType,
} from "@/types/quest";
import {
  exportGraphToSchema,
  importCurriculumToGraph,
} from "@/utils/importCurriculumToGraph";
import {
  addEdge,
  Background,
  BaseEdge,
  Connection,
  Controls,
  Edge,
  EdgeProps,
  EdgeTypes,
  getBezierPath,
  Handle,
  MiniMap,
  Node,
  NodeTypes,
  OnEdgesChange,
  OnNodesChange,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Download,
  FileJson,
  FilePlus,
  FolderOpen,
  Menu,
  Pencil,
  Plus,
  Rocket,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// Note: Tune asset bundling has been removed.
// Tunes must now be published via Tune Manager before they can be referenced in Quest nodes.
// The curriculum-publish edge function validates that referenced tune_keys exist in tune_assets.

// Custom styles for React Flow Controls and MiniMap
const questControlsStyles = `
  .quest-controls {
    background: hsl(var(--card)) !important;
    border: 1px solid hsl(var(--border)) !important;
    border-radius: var(--radius) !important;
  }
  .quest-controls button {
    background: hsl(var(--card)) !important;
    border-color: hsl(var(--border)) !important;
    color: hsl(var(--foreground)) !important;
  }
  .quest-controls button:hover {
    background: hsl(var(--accent) / 0.1) !important;
    color: hsl(var(--accent)) !important;
  }
  .quest-controls button:active {
    background: hsl(var(--accent) / 0.2) !important;
  }
  .quest-controls button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .quest-minimap {
    background: hsl(var(--card)) !important;
    border: 1px solid hsl(var(--border)) !important;
    border-radius: var(--radius) !important;
  }
  .quest-minimap .react-flow__minimap-mask {
    fill: hsl(var(--background) / 0.8) !important;
  }
  .quest-minimap .react-flow__minimap-node {
    stroke-width: 1.5 !important;
  }
  /* Handle labels styling */
  .react-flow__node .handle-label {
    pointer-events: none;
    user-select: none;
    z-index: 1;
  }
  /* Handle positioning - move handles 8px outside nodes */
  .react-flow__handle-left {
    left: -8px !important;
  }
  .react-flow__handle-right {
    right: -8px !important;
  }
  .react-flow__handle-top {
    top: -8px !important;
  }
  .react-flow__handle-bottom {
    bottom: -8px !important;
  }
  /* Handle styling - make bigger and remove stroke */
  .react-flow__handle {
    width: 8px !important;
    height: 8px !important;
    border: none !important;
  }
  /* Edge selection styling */
  .react-flow__edge.selected .react-flow__edge-path {
    stroke-width: 3 !important;
  }
  .react-flow__edge:hover .react-flow__edge-path {
    stroke-width: 2.5;
    cursor: pointer;
  }
`;

interface QuestEditorProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  mode?: "modal" | "embedded";
  isActive?: boolean;
  onHeaderActionsChange?: (actions: React.ReactNode) => void;
  onHeaderTitleChange?: (title: string | null) => void;
}

// Node variation configuration
const nodeVariations = {
  track: {
    bg: "bg-pink-950",
    ringSelected: "ring-2 ring-pink-300/50",
    borderDefault: "border-pink-500",
    typeLabel: "Track",
    defaultTitle: "Untitled Track",
  },
  lesson: {
    bg: "bg-sky-950",
    ringSelected: "ring-2 ring-sky-300/50",
    borderDefault: "border-sky-300",
    typeLabel: "Lesson",
    defaultTitle: "Untitled Lesson",
  },
  skill: {
    bg: "bg-emerald-950",
    ringSelected: "ring-2 ring-emerald-300/50",
    borderDefault: "border-emerald-500",
    typeLabel: "Skill",
    defaultTitle: "Untitled Skill",
  },
  tune: {
    bg: "bg-purple-950",
    ringSelected: "ring-2 ring-purple-300/50",
    borderDefault: "border-purple-500",
    typeLabel: "Tune",
    defaultTitle: "Untitled Tune",
  },
} as const;

// Base Node Component
function QuestNodeBase({
  variation,
  id,
  data,
  selected,
  onEdit,
  infoText,
  children,
}: {
  variation: "track" | "lesson" | "skill" | "tune";
  id: string;
  data: { title: string; type: QuestNodeType };
  selected?: boolean;
  onEdit: (nodeId: string) => void;
  infoText: string;
  children: ReactNode;
}) {
  const { t: translate } = useTranslation();
  const config = nodeVariations[variation];

  return (
    <div
      className={`relative pl-3 pr-2 pt-2 pb-3 rounded-lg border-2 ${
        config.bg
      } min-w-[200px] ${config.borderDefault} ${
        selected ? config.ringSelected : ""
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase opacity-60">{config.typeLabel}</span>
        <Button variant="ghost" size="xs" onClick={() => onEdit(id)}>
          {translate("questEditor.edit")}
        </Button>
      </div>
      <div className="font-semibold text-sm">
        {data.title || config.defaultTitle}
      </div>

      {children}
    </div>
  );
}

// Custom Node Components
function TrackNode({
  id,
  data,
  selected,
  onEdit,
}: {
  id: string;
  data: { title: string; type: QuestNodeType };
  selected?: boolean;
  onEdit: (nodeId: string) => void;
}) {
  const { t: translate } = useTranslation();
  return (
    <QuestNodeBase
      variation="track"
      id={id}
      data={data}
      selected={selected}
      onEdit={onEdit}
      infoText="Initial lesson: 1 max | Is requiring: Multiple"
    >
      <Handle
        type="source"
        position={Position.Right}
        id="track-out"
        isConnectable={true}
        style={{ backgroundColor: "#0284c7" }}
      />
      <Handle
        type="source"
        position={Position.Top}
        id="track-required"
        isConnectable={true}
        style={{ backgroundColor: "#059669", zIndex: 10 }}
      />
      <span className="absolute right-[-46px] top-1/2 -translate-y-1/2 text-xs text-sky-600 pointer-events-none whitespace-nowrap">
        {translate("questEditor.initial")}
      </span>
      <span className="absolute top-[-28px] left-1/2 -translate-x-1/2 text-xs text-emerald-600 pointer-events-none whitespace-nowrap">
        {translate("questEditor.isRequiring")}
      </span>
    </QuestNodeBase>
  );
}

function LessonNode({
  id,
  data,
  selected,
  onEdit,
}: {
  id: string;
  data: { title: string; type: QuestNodeType };
  selected?: boolean;
  onEdit: (nodeId: string) => void;
}) {
  const { t: translate } = useTranslation();
  return (
    <QuestNodeBase
      variation="lesson"
      id={id}
      data={data}
      selected={selected}
      onEdit={onEdit}
      infoText="Previous: 1 max | Next: 1 max"
    >
      <Handle
        type="target"
        position={Position.Left}
        id="lesson-in"
        style={{ backgroundColor: "#0284c7" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="lesson-out"
        style={{ backgroundColor: "#0284c7" }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="lesson-unlockable"
        style={{ backgroundColor: "#059669" }}
      />
      <Handle
        type="source"
        position={Position.Top}
        id="lesson-required"
        style={{ backgroundColor: "#059669" }}
      />
      <span className="absolute left-[-40px] top-1/2 -translate-y-1/2 text-xs text-sky-600 pointer-events-none whitespace-nowrap">
        {translate("questEditor.previous")}
      </span>
      <span className="absolute right-[-42px] top-1/2 -translate-y-1/2 text-xs text-sky-600 pointer-events-none whitespace-nowrap">
        {translate("questEditor.next")}
      </span>
      <span className="absolute bottom-[-28px] left-1/2 -translate-x-1/2 text-xs text-emerald-600 pointer-events-none whitespace-nowrap">
        {translate("questEditor.unlocking")}
      </span>
      <span className="absolute top-[-28px] left-1/2 -translate-x-1/2 text-xs text-emerald-600 pointer-events-none whitespace-nowrap">
        {translate("questEditor.requires")}
      </span>
    </QuestNodeBase>
  );
}

function SkillNode({
  id,
  data,
  selected,
  onEdit,
}: {
  id: string;
  data: { title: string; type: QuestNodeType };
  selected?: boolean;
  onEdit: (nodeId: string) => void;
}) {
  const { t: translate } = useTranslation();
  return (
    <QuestNodeBase
      variation="skill"
      id={id}
      data={data}
      selected={selected}
      onEdit={onEdit}
      infoText="In: Multiple required, 1 unlockable"
    >
      <Handle
        type="target"
        position={Position.Top}
        id="skill-unlockable"
        style={{ backgroundColor: "#0284c7" }}
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="skill-required"
        style={{ backgroundColor: "#0284c7" }}
      />
      <span className="absolute top-[-28px] left-1/2 -translate-x-1/2 text-xs text-sky-600 pointer-events-none whitespace-nowrap">
        {translate("questEditor.unlockedBy")}
      </span>
      <span className="absolute bottom-[-28px] left-1/2 -translate-x-1/2 text-xs text-sky-600 pointer-events-none whitespace-nowrap">
        {translate("questEditor.requiredBy")}
      </span>
    </QuestNodeBase>
  );
}

function TuneNode({
  id,
  data,
  selected,
  onEdit,
}: {
  id: string;
  data: { title: string; type: QuestNodeType };
  selected?: boolean;
  onEdit: (nodeId: string) => void;
}) {
  const { t: translate } = useTranslation();
  return (
    <QuestNodeBase
      variation="tune"
      id={id}
      data={data}
      selected={selected}
      onEdit={onEdit}
      infoText="Prev: 1 max | Next: 1 max | Requires/Unlocks skills"
    >
      <Handle
        type="target"
        position={Position.Left}
        id="tune-in"
        style={{ backgroundColor: "#0284c7" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="tune-out"
        style={{ backgroundColor: "#0284c7" }}
      />
      <Handle
        type="source"
        position={Position.Top}
        id="tune-required"
        style={{ backgroundColor: "#059669" }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="tune-unlockable"
        style={{ backgroundColor: "#059669" }}
      />
      <span className="absolute left-[-40px] top-1/2 -translate-y-1/2 text-xs text-sky-600 pointer-events-none whitespace-nowrap">
        {translate("questEditor.previous")}
      </span>
      <span className="absolute right-[-42px] top-1/2 -translate-y-1/2 text-xs text-sky-600 pointer-events-none whitespace-nowrap">
        {translate("questEditor.next")}
      </span>
      <span className="absolute top-[-28px] left-1/2 -translate-x-1/2 text-xs text-emerald-600 pointer-events-none whitespace-nowrap">
        {translate("questEditor.requires")}
      </span>
      <span className="absolute bottom-[-28px] left-1/2 -translate-x-1/2 text-xs text-emerald-600 pointer-events-none whitespace-nowrap">
        {translate("questEditor.unlocking")}
      </span>
    </QuestNodeBase>
  );
}

// Custom Edge Component for styling
function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isRequirement = data?.type === "requirement";
  const isUnlockable = data?.type === "unlockable";
  const strokeColor = isRequirement
    ? "#10b981" // emerald-500
    : isUnlockable
      ? "#10b981" // emerald-500
      : "#0ea5e9"; // sky-500

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        stroke: strokeColor,
        strokeWidth: 2,
        strokeDasharray: "0", // Plain (not dashed) for all edges
        opacity: selected ? 0.9 : 0.6,
      }}
    />
  );
}

const edgeTypes: EdgeTypes = {
  default: CustomEdge,
};

type NodeComponentProps = {
  id: string;
  data: { title: string; type: QuestNodeType };
  selected?: boolean;
} & Record<string, unknown>;

/** When embedded in a tab, fit view once the tab is visible so the flow renders (container has real dimensions). */
function FitViewOnActivate({ isActive }: { isActive: boolean }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (!isActive) return;
    const id = setTimeout(() => fitView({ duration: 0 }), 100);
    return () => clearTimeout(id);
  }, [isActive, fitView]);
  return null;
}

function QuestEditorFlow({
  isActive = true,
  onNodesChange,
  onEdgesChange,
  onEdgesDelete,
  nodes,
  edges,
  onConnect,
  onEditNode,
}: {
  isActive?: boolean;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onEdgesDelete?: (edges: Edge[]) => void;
  nodes: QuestNode[];
  edges: QuestEdge[];
  onConnect: (connection: Connection) => void;
  onEditNode: (nodeId: string) => void;
}) {
  const onEditNodeRef = useRef(onEditNode);
  useEffect(() => {
    onEditNodeRef.current = onEditNode;
  }, [onEditNode]);

  const nodeTypes: NodeTypes = useMemo(
    () => ({
      track: (props: NodeComponentProps) => (
        <TrackNode {...props} onEdit={onEditNodeRef.current} />
      ),
      lesson: (props: NodeComponentProps) => (
        <LessonNode {...props} onEdit={onEditNodeRef.current} />
      ),
      skill: (props: NodeComponentProps) => (
        <SkillNode {...props} onEdit={onEditNodeRef.current} />
      ),
      tune: (props: NodeComponentProps) => (
        <TuneNode {...props} onEdit={onEditNodeRef.current} />
      ),
    }),
    [],
  );

  return (
    <ReactFlow
      nodes={nodes as Node[]}
      edges={edges as Edge[]}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onEdgesDelete={onEdgesDelete}
      onConnect={onConnect}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
    >
      <FitViewOnActivate isActive={isActive} />
      <Background />
      <Controls className="quest-controls" />
      <MiniMap
        className="quest-minimap"
        nodeColor={(node) => {
          const nodeType = node.data?.type;
          if (nodeType === "track") return "rgb(219, 39, 119)"; // pink-500
          if (nodeType === "lesson") return "rgb(14, 165, 233)"; // sky-500
          if (nodeType === "skill") return "rgb(16, 185, 129)"; // emerald-500
          if (nodeType === "tune") return "rgb(168, 85, 247)"; // purple-500
          return "hsl(var(--muted))";
        }}
      />
    </ReactFlow>
  );
}

export function QuestEditor({
  open = false,
  onOpenChange,
  mode = "modal",
  isActive = true,
  onHeaderActionsChange,
  onHeaderTitleChange,
}: QuestEditorProps) {
  const { t: translate } = useTranslation();
  const { toast } = useToast();
  const {
    questGraphs,
    currentGraph,
    isLoading: isDbLoading,
    saveQuestGraph,
    updateQuestGraph,
    deleteQuestGraph,
    loadQuestGraph,
    clearCurrentGraph,
  } = useQuestGraphs();

  // Fetch published tunes from database for tune node selector
  const { data: publishedTuneList, isLoading: isLoadingTunes } =
    usePublishedTuneKeys();

  // Transform published tunes to selector format (show tune_key, not briefing.title)
  const availablePublishedTunes = useMemo(() => {
    if (!publishedTuneList) return [];
    return publishedTuneList.map((tune) => ({
      key: tune.tune_key,
      label: tune.tune_key,
    }));
  }, [publishedTuneList]);

  const [questData, setQuestData] = useLocalStorage<QuestData>(
    "quest-editor-data",
    {
      nodes: [],
      edges: [],
    },
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<QuestNode>(
    questData.nodes,
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<QuestEdge>(
    questData.edges,
  );

  // Track unsaved changes
  const lastSavedDataRef = useRef<string>("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Dialog states
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showNewConfirmDialog, setShowNewConfirmDialog] = useState(false);
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [saveDialogTitle, setSaveDialogTitle] = useState("");
  const [renameDialogTitle, setRenameDialogTitle] = useState("");
  const [publishDialogTitle, setPublishDialogTitle] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    validated: boolean;
    errors?: string[];
    warnings?: string[];
    counts?: {
      nodes: number;
      edges: number;
      tracks: number;
      lessons: number;
      skills: number;
    };
  } | null>(null);
  const [publishResult, setPublishResult] = useState<{
    success: boolean;
    versionId?: string;
    publishedAt?: string;
  } | null>(null);
  const [pendingLoadGraph, setPendingLoadGraph] = useState<QuestGraph | null>(
    null,
  );

  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingOrder, setEditingOrder] = useState<string>("");
  const [editingDescription, setEditingDescription] = useState<string>("");
  const [editingTrackKey, setEditingTrackKey] = useState<string>("");
  const [editingSkillKey, setEditingSkillKey] = useState<string>("");
  const [editingUnlockGuidance, setEditingUnlockGuidance] =
    useState<string>("");
  const [editingLessonKey, setEditingLessonKey] = useState<string>("");
  const [editingGoal, setEditingGoal] = useState<string>("");
  const [editingLevel, setEditingLevel] = useState<
    "beginner" | "intermediate" | "advanced" | ""
  >("");
  const [editingSetupGuidance, setEditingSetupGuidance] = useState<string>("");
  const [editingEvaluationGuidance, setEditingEvaluationGuidance] =
    useState<string>("");
  const [editingDifficultyGuidance, setEditingDifficultyGuidance] =
    useState<string>("");
  // Tune-specific editing states
  const [editingTuneKey, setEditingTuneKey] = useState<string>("");
  const [editingMusicRef, setEditingMusicRef] = useState<string>("");
  // Track unsaved changes
  useEffect(() => {
    const currentData = JSON.stringify({ nodes, edges });
    if (lastSavedDataRef.current && lastSavedDataRef.current !== currentData) {
      setHasUnsavedChanges(true);
    }
  }, [nodes, edges]);

  // Update saved ref when loading or saving
  const markAsSaved = useCallback(() => {
    lastSavedDataRef.current = JSON.stringify({ nodes, edges });
    setHasUnsavedChanges(false);
  }, [nodes, edges]);

  // Sync with localStorage
  const updateQuestData = useCallback(
    (newNodes: QuestNode[], newEdges: QuestEdge[]) => {
      const data: QuestData = { nodes: newNodes, edges: newEdges };
      setQuestData(data);
      setNodes(newNodes);
      setEdges(newEdges);
    },
    [setQuestData, setNodes, setEdges],
  );

  const isEmbedded = mode === "embedded";
  const isVisible = isEmbedded ? isActive : open;

  // Load most recently saved graph when dialog opens
  useEffect(() => {
    if (
      isVisible &&
      !isDbLoading &&
      !currentGraph &&
      questGraphs.length > 0 &&
      !hasUnsavedChanges
    ) {
      const mostRecentGraph = questGraphs[0]; // Already sorted by updated_at descending
      loadQuestGraph(mostRecentGraph);
      updateQuestData(mostRecentGraph.data.nodes, mostRecentGraph.data.edges);
      lastSavedDataRef.current = JSON.stringify(mostRecentGraph.data);
      setHasUnsavedChanges(false);
    }
  }, [
    isVisible,
    isDbLoading,
    currentGraph,
    questGraphs,
    hasUnsavedChanges,
    loadQuestGraph,
    updateQuestData,
  ]);

  const handleEditNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (node) {
        setEditingTitle(node.data.title);
        setEditingNodeId(nodeId);
        // Initialize track-specific fields
        if (node.data.type === "track") {
          setEditingTrackKey(node.data.trackKey || "");
          setEditingOrder(node.data.order?.toString() || "");
          setEditingDescription(node.data.description || "");
          setEditingSkillKey("");
        } else if (node.data.type === "skill") {
          // Initialize skill-specific fields
          setEditingSkillKey(node.data.skillKey || "");
          setEditingDescription(node.data.description || "");
          setEditingUnlockGuidance(node.data.unlockGuidance || "");
          setEditingOrder("");
          setEditingLessonKey("");
          setEditingGoal("");
          setEditingSetupGuidance("");
          setEditingEvaluationGuidance("");
          setEditingDifficultyGuidance("");
        } else if (node.data.type === "lesson") {
          // Initialize lesson-specific fields
          setEditingLessonKey(node.data.lessonKey || "");
          setEditingGoal(node.data.goal || "");
          setEditingLevel(
            (node.data.level as "beginner" | "intermediate" | "advanced") ||
              "beginner",
          );
          setEditingSetupGuidance(node.data.setupGuidance || "");
          setEditingEvaluationGuidance(node.data.evaluationGuidance || "");
          setEditingDifficultyGuidance(node.data.difficultyGuidance || "");
          setEditingOrder("");
          setEditingDescription("");
          setEditingTrackKey("");
          setEditingSkillKey("");
          setEditingUnlockGuidance("");
        } else if (node.data.type === "tune") {
          // Initialize tune-specific fields
          setEditingTuneKey(node.data.tuneKey || "");
          setEditingMusicRef(node.data.musicRef || "");
          setEditingDescription(node.data.description || "");
          setEditingLevel(
            (node.data.level as "beginner" | "intermediate" | "advanced") || "",
          );
          setEditingEvaluationGuidance(node.data.evaluationGuidance || "");
          // Clear other fields
          setEditingOrder("");
          setEditingTrackKey("");
          setEditingSkillKey("");
          setEditingUnlockGuidance("");
          setEditingLessonKey("");
          setEditingGoal("");
          setEditingSetupGuidance("");
          setEditingDifficultyGuidance("");
        } else {
          setEditingOrder("");
          setEditingDescription("");
          setEditingTrackKey("");
          setEditingSkillKey("");
          setEditingUnlockGuidance("");
          setEditingLessonKey("");
          setEditingGoal("");
          setEditingLevel("");
          setEditingSetupGuidance("");
          setEditingEvaluationGuidance("");
          setEditingDifficultyGuidance("");
          setEditingTuneKey("");
          setEditingMusicRef("");
        }
      }
    },
    [nodes],
  );

  // Helper function to get first available order number
  const getFirstAvailableOrder = useCallback((): number => {
    const trackNodes = nodes.filter((n) => n.data.type === "track");
    const usedOrders = trackNodes
      .map((n) => n.data.order)
      .filter(
        (order): order is number => typeof order === "number" && order > 0,
      )
      .sort((a, b) => a - b);

    // Find first gap or return next number
    for (let i = 1; i <= usedOrders.length; i++) {
      if (!usedOrders.includes(i)) {
        return i;
      }
    }
    return usedOrders.length + 1;
  }, [nodes]);

  // Helper function to check if an order is already in use
  const isOrderInUse = useCallback(
    (order: number, excludeNodeId?: string): boolean => {
      if (order <= 0 || !Number.isInteger(order)) {
        return false;
      }
      return nodes.some(
        (n) =>
          n.data.type === "track" &&
          n.id !== excludeNodeId &&
          n.data.order === order,
      );
    },
    [nodes],
  );

  // Helper function to check if a skillKey is already in use
  const isSkillKeyInUse = useCallback(
    (skillKey: string, excludeNodeId?: string): boolean => {
      if (!skillKey || skillKey.trim() === "") {
        return false;
      }
      return nodes.some(
        (n) =>
          n.data.type === "skill" &&
          n.id !== excludeNodeId &&
          n.data.skillKey === skillKey.trim(),
      );
    },
    [nodes],
  );

  // Helper function to check if a lessonKey is already in use
  const isLessonKeyInUse = useCallback(
    (lessonKey: string, excludeNodeId?: string): boolean => {
      if (!lessonKey || lessonKey.trim() === "") {
        return false;
      }
      return nodes.some(
        (n) =>
          n.data.type === "lesson" &&
          n.id !== excludeNodeId &&
          n.data.lessonKey === lessonKey.trim(),
      );
    },
    [nodes],
  );

  // Helper function to check if a trackKey is already in use
  const isTrackKeyInUse = useCallback(
    (trackKey: string, excludeNodeId?: string): boolean => {
      if (!trackKey || trackKey.trim() === "") {
        return false;
      }
      return nodes.some(
        (n) =>
          n.data.type === "track" &&
          n.id !== excludeNodeId &&
          n.data.trackKey === trackKey.trim(),
      );
    },
    [nodes],
  );

  // Helper function to check if a tuneKey is already in use
  const isTuneKeyInUse = useCallback(
    (tuneKey: string, excludeNodeId?: string): boolean => {
      if (!tuneKey || tuneKey.trim() === "") {
        return false;
      }
      return nodes.some(
        (n) =>
          n.data.type === "tune" &&
          n.id !== excludeNodeId &&
          n.data.tuneKey === tuneKey.trim(),
      );
    },
    [nodes],
  );

  const handleSaveTitle = useCallback(() => {
    if (!editingNodeId) return;

    const currentNode = nodes.find((n) => n.id === editingNodeId);
    if (!currentNode) return;

    // Validate track-specific fields
    if (currentNode.data.type === "track") {
      if (!editingTrackKey || editingTrackKey.trim() === "") {
        toast({
          title: i18n.t("notices.trackKeyRequired"),
          description: i18n.t("notices.keyEmptyTrack"),
          variant: "destructive",
        });
        return;
      }

      if (editingTrackKey.includes(" ")) {
        toast({
          title: i18n.t("notices.invalidKeyTrack"),
          description: i18n.t("notices.keySpacesTrack"),
          variant: "destructive",
        });
        return;
      }

      if (isTrackKeyInUse(editingTrackKey.trim(), editingNodeId)) {
        toast({
          title: i18n.t("notices.keyTakenTrack"),
          description: i18n.t("notices.keyUsedTrack"),
          variant: "destructive",
        });
        return;
      }

      const orderValue = parseInt(editingOrder, 10);
      if (
        !editingOrder ||
        isNaN(orderValue) ||
        orderValue <= 0 ||
        !Number.isInteger(orderValue)
      ) {
        toast({
          title: i18n.t("notices.invalidOrder"),
          description: i18n.t("notices.orderValue"),
          variant: "destructive",
        });
        return;
      }

      if (isOrderInUse(orderValue, editingNodeId)) {
        toast({
          title: i18n.t("notices.orderTaken"),
          description: i18n.t("notices.orderTakenDetail"),
          variant: "destructive",
        });
        return;
      }
    }

    // Validate skill-specific fields
    if (currentNode.data.type === "skill") {
      const trimmedSkillKey = editingSkillKey.trim();
      if (!trimmedSkillKey) {
        toast({
          title: i18n.t("notices.invalidKeySkill"),
          description: i18n.t("notices.keyEmptySkill"),
          variant: "destructive",
        });
        return;
      }

      if (trimmedSkillKey.includes(" ")) {
        toast({
          title: i18n.t("notices.invalidKeySkill"),
          description: i18n.t("notices.keySpacesSkill"),
          variant: "destructive",
        });
        return;
      }

      if (isSkillKeyInUse(trimmedSkillKey, editingNodeId)) {
        toast({
          title: i18n.t("notices.keyTakenSkill"),
          description: i18n.t("notices.keyUsedSkill"),
          variant: "destructive",
        });
        return;
      }
    }

    // Validate lesson-specific fields
    if (currentNode.data.type === "lesson") {
      const trimmedLessonKey = editingLessonKey.trim();
      if (!trimmedLessonKey) {
        toast({
          title: i18n.t("notices.invalidKeyLesson"),
          description: i18n.t("notices.keyEmptyLesson"),
          variant: "destructive",
        });
        return;
      }

      if (trimmedLessonKey.includes(" ")) {
        toast({
          title: i18n.t("notices.invalidKeyLesson"),
          description: i18n.t("notices.keySpacesLesson"),
          variant: "destructive",
        });
        return;
      }

      if (isLessonKeyInUse(trimmedLessonKey, editingNodeId)) {
        toast({
          title: i18n.t("notices.keyTakenLesson"),
          description: i18n.t("notices.keyUsedLesson"),
          variant: "destructive",
        });
        return;
      }
    }

    // Validate tune-specific fields
    if (currentNode.data.type === "tune") {
      const trimmedTuneKey = editingTuneKey.trim();
      if (!trimmedTuneKey) {
        toast({
          title: i18n.t("notices.invalidKeyTune"),
          description: i18n.t("notices.keyEmptyTune"),
          variant: "destructive",
        });
        return;
      }

      if (trimmedTuneKey.includes(" ")) {
        toast({
          title: i18n.t("notices.invalidKeyTune"),
          description: i18n.t("notices.keySpacesTune"),
          variant: "destructive",
        });
        return;
      }

      if (isTuneKeyInUse(trimmedTuneKey, editingNodeId)) {
        toast({
          title: i18n.t("notices.keyTakenTune"),
          description: i18n.t("notices.keyUsedTune"),
          variant: "destructive",
        });
        return;
      }

      if (!editingMusicRef || editingMusicRef.trim() === "") {
        toast({
          title: i18n.t("notices.refRequired"),
          description: i18n.t("notices.refEmpty"),
          variant: "destructive",
        });
        return;
      }
    }

    const updatedNodes = nodes.map((node) => {
      if (node.id === editingNodeId) {
        const updatedData = {
          ...node.data,
          title: editingTitle,
        };

        // Add track-specific fields
        if (node.data.type === "track") {
          updatedData.trackKey = editingTrackKey.trim();
          updatedData.order = parseInt(editingOrder, 10);
          updatedData.description = editingDescription || undefined;
        }

        // Add skill-specific fields
        if (node.data.type === "skill") {
          updatedData.skillKey = editingSkillKey.trim();
          updatedData.description = editingDescription || undefined;
          updatedData.unlockGuidance = editingUnlockGuidance || undefined;
        }

        // Add lesson-specific fields
        if (node.data.type === "lesson") {
          updatedData.lessonKey = editingLessonKey.trim();
          updatedData.goal = editingGoal || undefined;
          updatedData.level = editingLevel || "beginner";
          updatedData.setupGuidance = editingSetupGuidance || undefined;
          updatedData.evaluationGuidance =
            editingEvaluationGuidance || undefined;
          updatedData.difficultyGuidance =
            editingDifficultyGuidance || undefined;
        }

        // Add tune-specific fields
        if (node.data.type === "tune") {
          updatedData.tuneKey = editingTuneKey.trim();
          updatedData.musicRef = editingMusicRef.trim();
          updatedData.description = editingDescription || undefined;
          updatedData.level = editingLevel || undefined;
          updatedData.evaluationGuidance =
            editingEvaluationGuidance || undefined;
        }

        return {
          ...node,
          data: updatedData,
        };
      }
      return node;
    });

    updateQuestData(updatedNodes, edges);
    setEditingNodeId(null);
    setEditingTitle("");
    setEditingOrder("");
    setEditingDescription("");
    setEditingTrackKey("");
    setEditingSkillKey("");
    setEditingUnlockGuidance("");
    setEditingLessonKey("");
    setEditingGoal("");
    setEditingSetupGuidance("");
    setEditingEvaluationGuidance("");
    setEditingDifficultyGuidance("");
    setEditingTuneKey("");
    setEditingMusicRef("");
  }, [
    editingNodeId,
    editingTitle,
    editingOrder,
    editingDescription,
    editingTrackKey,
    editingSkillKey,
    editingUnlockGuidance,
    editingLessonKey,
    editingGoal,
    editingLevel,
    editingSetupGuidance,
    editingEvaluationGuidance,
    editingDifficultyGuidance,
    editingTuneKey,
    editingMusicRef,
    nodes,
    edges,
    updateQuestData,
    isOrderInUse,
    isTrackKeyInUse,
    isSkillKeyInUse,
    isLessonKeyInUse,
    isTuneKeyInUse,
    toast,
  ]);

  const handleCancelEdit = useCallback(() => {
    setEditingNodeId(null);
    setEditingTitle("");
    setEditingOrder("");
    setEditingDescription("");
    setEditingSkillKey("");
    setEditingUnlockGuidance("");
    setEditingLessonKey("");
    setEditingGoal("");
    setEditingSetupGuidance("");
    setEditingEvaluationGuidance("");
    setEditingDifficultyGuidance("");
    setEditingTuneKey("");
    setEditingMusicRef("");
  }, []);

  // Save nodes and edges to localStorage whenever they change (including positions)
  useEffect(() => {
    const data: QuestData = { nodes, edges };
    setQuestData(data);
  }, [nodes, edges, setQuestData]);

  // Validation functions
  const canConnect = useCallback(
    (
      source: QuestNode,
      target: QuestNode,
      sourceHandle: string | null | undefined,
      targetHandle: string | null | undefined,
    ): { valid: boolean; reason?: string } => {
      // Track → Lesson (using track-out → lesson-in)
      if (source.data.type === "track" && target.data.type === "lesson") {
        const outgoingCount = edges.filter(
          (e) => e.source === source.id && e.sourceHandle === "track-out",
        ).length;
        if (outgoingCount >= 1) {
          return {
            valid: false,
            reason: i18n.t("questValidation.trackOutgoing"),
          };
        }
        return { valid: true };
      }

      // Track → Skill (using track-required → skill-required)
      if (source.data.type === "track" && target.data.type === "skill") {
        // No limit on required connections from track to skills
        return { valid: true };
      }

      // Lesson → Lesson (using lesson-out → lesson-in OR lesson-required → lesson-prerequisite)
      if (source.data.type === "lesson" && target.data.type === "lesson") {
        // lesson-out → lesson-in (next lesson)
        if (sourceHandle === "lesson-out" && targetHandle === "lesson-in") {
          // Check if source already has lesson-out connection
          const sourceOutgoing = edges.filter(
            (e) => e.source === source.id && e.sourceHandle === "lesson-out",
          ).length;
          if (sourceOutgoing >= 1) {
            return {
              valid: false,
              reason:
                i18n.t("questValidation.nextLesson"),
            };
          }
          // Check if target already has incoming connection
          const targetIncoming = edges.filter(
            (e) => e.target === target.id && e.targetHandle === "lesson-in",
          ).length;
          if (targetIncoming >= 1) {
            return {
              valid: false,
              reason: i18n.t("questValidation.lessonIncoming"),
            };
          }
          return { valid: true };
        }
        // lesson-required → lesson-prerequisite (prerequisite lesson)
        if (
          sourceHandle === "lesson-required" &&
          targetHandle === "lesson-prerequisite"
        ) {
          return { valid: true };
        }
        return { valid: false, reason: i18n.t("questValidation.lessonLesson") };
      }

      // Lesson → Skill (using lesson-unlockable/required → skill-unlockable/required)
      if (source.data.type === "lesson" && target.data.type === "skill") {
        // Check if lesson already has outgoing connection to another lesson
        const lessonOutgoing = edges.filter(
          (e) => e.source === source.id && e.sourceHandle === "lesson-out",
        ).length;
        if (lessonOutgoing >= 1) {
          return {
            valid: false,
            reason:
              i18n.t("questValidation.nextLesson"),
          };
        }
        // For unlockable, check if skill already has one "Unlocked by" connection
        if (
          sourceHandle === "lesson-unlockable" &&
          targetHandle === "skill-unlockable"
        ) {
          const existingUnlockable = edges.find(
            (e) =>
              e.target === target.id &&
              e.targetHandle === "skill-unlockable" &&
              e.data?.type === "unlockable",
          );
          if (existingUnlockable) {
            return {
              valid: false,
              reason: i18n.t("questValidation.skillUnlock"),
            };
          }
        }
        return { valid: true };
      }

      // Track → Tune (using track-out → tune-in)
      if (source.data.type === "track" && target.data.type === "tune") {
        const outgoingCount = edges.filter(
          (e) => e.source === source.id && e.sourceHandle === "track-out",
        ).length;
        if (outgoingCount >= 1) {
          return {
            valid: false,
            reason: i18n.t("questValidation.trackOutgoing"),
          };
        }
        return { valid: true };
      }

      // Lesson → Tune (using lesson-out → tune-in)
      if (source.data.type === "lesson" && target.data.type === "tune") {
        if (sourceHandle === "lesson-out" && targetHandle === "tune-in") {
          const sourceOutgoing = edges.filter(
            (e) => e.source === source.id && e.sourceHandle === "lesson-out",
          ).length;
          if (sourceOutgoing >= 1) {
            return {
              valid: false,
              reason: i18n.t("questValidation.lessonOutgoing"),
            };
          }
          const targetIncoming = edges.filter(
            (e) => e.target === target.id && e.targetHandle === "tune-in",
          ).length;
          if (targetIncoming >= 1) {
            return {
              valid: false,
              reason: i18n.t("questValidation.tuneIncoming"),
            };
          }
          return { valid: true };
        }
        return { valid: false, reason: i18n.t("questValidation.lessonTune") };
      }

      // Tune → Tune (using tune-out → tune-in)
      if (source.data.type === "tune" && target.data.type === "tune") {
        if (sourceHandle === "tune-out" && targetHandle === "tune-in") {
          const sourceOutgoing = edges.filter(
            (e) => e.source === source.id && e.sourceHandle === "tune-out",
          ).length;
          if (sourceOutgoing >= 1) {
            return {
              valid: false,
              reason: i18n.t("questValidation.tuneOutgoing"),
            };
          }
          const targetIncoming = edges.filter(
            (e) => e.target === target.id && e.targetHandle === "tune-in",
          ).length;
          if (targetIncoming >= 1) {
            return {
              valid: false,
              reason: i18n.t("questValidation.tuneIncoming"),
            };
          }
          return { valid: true };
        }
        return { valid: false, reason: i18n.t("questValidation.tuneTune") };
      }

      // Tune → Lesson (using tune-out → lesson-in)
      if (source.data.type === "tune" && target.data.type === "lesson") {
        if (sourceHandle === "tune-out" && targetHandle === "lesson-in") {
          const sourceOutgoing = edges.filter(
            (e) => e.source === source.id && e.sourceHandle === "tune-out",
          ).length;
          if (sourceOutgoing >= 1) {
            return {
              valid: false,
              reason: i18n.t("questValidation.tuneOutgoing"),
            };
          }
          const targetIncoming = edges.filter(
            (e) => e.target === target.id && e.targetHandle === "lesson-in",
          ).length;
          if (targetIncoming >= 1) {
            return {
              valid: false,
              reason: i18n.t("questValidation.lessonIncoming"),
            };
          }
          return { valid: true };
        }
        return { valid: false, reason: i18n.t("questValidation.tuneLesson") };
      }

      // Tune → Skill (using tune-required/unlockable → skill-required/unlockable)
      if (source.data.type === "tune" && target.data.type === "skill") {
        // For unlockable, check if skill already has one "Unlocked by" connection
        if (
          sourceHandle === "tune-unlockable" &&
          targetHandle === "skill-unlockable"
        ) {
          const existingUnlockable = edges.find(
            (e) =>
              e.target === target.id &&
              e.targetHandle === "skill-unlockable" &&
              e.data?.type === "unlockable",
          );
          if (existingUnlockable) {
            return {
              valid: false,
              reason: i18n.t("questValidation.skillUnlock"),
            };
          }
        }
        return { valid: true };
      }

      return { valid: false, reason: i18n.t("notices.invalidConnectionType") };
    },
    [edges],
  );

  // Determine edge type from handle IDs
  const determineEdgeType = useCallback(
    (
      sourceHandle: string | null | undefined,
      targetHandle: string | null | undefined,
    ): QuestEdgeType => {
      if (
        (sourceHandle === "lesson-unlockable" ||
          sourceHandle === "tune-unlockable") &&
        targetHandle === "skill-unlockable"
      ) {
        return "unlockable";
      }
      // Lesson/Track/Tune "Is requiring" → Skill "Is required by"
      if (
        (sourceHandle === "lesson-required" ||
          sourceHandle === "track-required" ||
          sourceHandle === "tune-required") &&
        targetHandle === "skill-required"
      ) {
        return "requirement";
      }
      return "default";
    },
    [],
  );

  // Validate handle compatibility
  const validateHandleCompatibility = useCallback(
    (
      sourceHandle: string | null | undefined,
      targetHandle: string | null | undefined,
      sourceNode: QuestNode,
      targetNode: QuestNode,
    ): { valid: boolean; reason?: string } => {
      // Track → Lesson
      if (
        sourceNode.data.type === "track" &&
        targetNode.data.type === "lesson"
      ) {
        if (sourceHandle !== "track-out" || targetHandle !== "lesson-in") {
          return {
            valid: false,
            reason: i18n.t("questValidation.handlesTrackLesson"),
          };
        }
        return { valid: true };
      }

      // Track → Skill (required)
      if (
        sourceNode.data.type === "track" &&
        targetNode.data.type === "skill"
      ) {
        if (
          sourceHandle === "track-required" &&
          targetHandle === "skill-required"
        ) {
          return { valid: true };
        }
        return {
          valid: false,
          reason:
            i18n.t("questValidation.handlesTrackSkill"),
        };
      }

      // Lesson → Lesson
      if (
        sourceNode.data.type === "lesson" &&
        targetNode.data.type === "lesson"
      ) {
        if (sourceHandle === "lesson-out" && targetHandle === "lesson-in") {
          return { valid: true };
        }
        if (
          sourceHandle === "lesson-required" &&
          targetHandle === "lesson-prerequisite"
        ) {
          return { valid: true };
        }
        return {
          valid: false,
          reason:
            i18n.t("questValidation.handlesLessonLesson"),
        };
      }

      // Lesson → Skill
      if (
        sourceNode.data.type === "lesson" &&
        targetNode.data.type === "skill"
      ) {
        // Lesson "Unlocking" → Skill "Unlocked by"
        if (
          sourceHandle === "lesson-unlockable" &&
          targetHandle === "skill-unlockable"
        ) {
          return { valid: true };
        }
        // Lesson "Is requiring" → Skill "Is required by"
        if (
          sourceHandle === "lesson-required" &&
          targetHandle === "skill-required"
        ) {
          return { valid: true };
        }
        return {
          valid: false,
          reason:
            i18n.t("questValidation.handlesLessonSkill"),
        };
      }

      // Track → Tune
      if (sourceNode.data.type === "track" && targetNode.data.type === "tune") {
        if (sourceHandle !== "track-out" || targetHandle !== "tune-in") {
          return {
            valid: false,
            reason: i18n.t("questValidation.handlesTrackTune"),
          };
        }
        return { valid: true };
      }

      // Lesson → Tune
      if (
        sourceNode.data.type === "lesson" &&
        targetNode.data.type === "tune"
      ) {
        if (sourceHandle === "lesson-out" && targetHandle === "tune-in") {
          return { valid: true };
        }
        return {
          valid: false,
          reason: i18n.t("questValidation.handlesLessonTune"),
        };
      }

      // Tune → Tune
      if (sourceNode.data.type === "tune" && targetNode.data.type === "tune") {
        if (sourceHandle === "tune-out" && targetHandle === "tune-in") {
          return { valid: true };
        }
        return {
          valid: false,
          reason: i18n.t("questValidation.handlesTuneTune"),
        };
      }

      // Tune → Lesson
      if (
        sourceNode.data.type === "tune" &&
        targetNode.data.type === "lesson"
      ) {
        if (sourceHandle === "tune-out" && targetHandle === "lesson-in") {
          return { valid: true };
        }
        return {
          valid: false,
          reason: i18n.t("questValidation.handlesTuneLesson"),
        };
      }

      // Tune → Skill
      if (sourceNode.data.type === "tune" && targetNode.data.type === "skill") {
        // Tune "Unlocking" → Skill "Unlocked by"
        if (
          sourceHandle === "tune-unlockable" &&
          targetHandle === "skill-unlockable"
        ) {
          return { valid: true };
        }
        // Tune "Is requiring" → Skill "Is required by"
        if (
          sourceHandle === "tune-required" &&
          targetHandle === "skill-required"
        ) {
          return { valid: true };
        }
        return {
          valid: false,
          reason:
            i18n.t("questValidation.handlesTuneSkill"),
        };
      }

      return { valid: false, reason: i18n.t("notices.invalidHandles") };
    },
    [],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);

      if (!sourceNode || !targetNode) return;

      // Validate handle compatibility
      const handleValidation = validateHandleCompatibility(
        connection.sourceHandle,
        connection.targetHandle,
        sourceNode,
        targetNode,
      );

      if (!handleValidation.valid) {
        toast({
          title: i18n.t("notices.invalidConnection"),
          description: handleValidation.reason,
          variant: "destructive",
        });
        return;
      }

      // Determine edge type from handles
      const edgeType = determineEdgeType(
        connection.sourceHandle,
        connection.targetHandle,
      );

      // Validate node connection limits
      const validation = canConnect(
        sourceNode,
        targetNode,
        connection.sourceHandle,
        connection.targetHandle,
      );
      if (!validation.valid) {
        toast({
          title: i18n.t("notices.invalidConnection"),
          description: validation.reason,
          variant: "destructive",
        });
        return;
      }

      // Create edge with handle IDs
      const newEdge: QuestEdge = {
        id: `edge-${connection.source}-${connection.target}-${edgeType}`,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle || undefined,
        targetHandle: connection.targetHandle || undefined,
        data: { type: edgeType },
        selectable: true,
        deletable: true,
      };

      const newEdges = addEdge(newEdge, edges);
      updateQuestData(nodes, newEdges);
    },
    [
      nodes,
      edges,
      validateHandleCompatibility,
      determineEdgeType,
      canConnect,
      toast,
      updateQuestData,
    ],
  );

  const addNode = useCallback(
    (type: QuestNodeType) => {
      const newNode: QuestNode = {
        id: crypto.randomUUID(),
        type,
        position: { x: Math.random() * 400, y: Math.random() * 400 },
        data: {
          title: `New ${type}`,
          type,
          ...(type === "track" && { order: getFirstAvailableOrder() }),
        },
      };

      const newNodes = [...nodes, newNode];
      updateQuestData(newNodes, edges);
    },
    [nodes, edges, updateQuestData, getFirstAvailableOrder],
  );

  const handleDownload = useCallback(async () => {
    try {
      if (!("showSaveFilePicker" in window)) {
        toast({
          title: i18n.t("notices.picker"),
          description:
            i18n.t("notices.pickerDetail"),
          variant: "destructive",
        });
        return;
      }

      const data: QuestData = { nodes, edges };
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fileHandle = await (window as any).showSaveFilePicker({
        suggestedName: "quest.json",
        types: [
          {
            description: i18n.t("notices.jsonFiles"),
            accept: { "application/json": [".json"] },
          },
        ],
      });

      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();

      toast({
        title: i18n.t("notices.questSaved"),
        description: i18n.t("notices.questFileSaved"),
      });
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        toast({
          title: i18n.t("notices.saveFile"),
          description: error instanceof Error ? error.message : i18n.t("notices.unknown"),
          variant: "destructive",
        });
      }
    }
  }, [nodes, edges, toast]);

  const handleOpenFile = useCallback(async () => {
    try {
      if (!("showOpenFilePicker" in window)) {
        toast({
          title: i18n.t("notices.picker"),
          description:
            i18n.t("notices.pickerDetail"),
          variant: "destructive",
        });
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fileHandles = await (window as any).showOpenFilePicker({
        types: [
          {
            description: i18n.t("notices.jsonFiles"),
            accept: { "application/json": [".json"] },
          },
        ],
        multiple: false,
      });

      if (!fileHandles || fileHandles.length === 0) return;

      const file = await fileHandles[0].getFile();
      const text = await file.text();
      const data: QuestData = JSON.parse(text);

      // Validate structure
      if (
        !data.nodes ||
        !data.edges ||
        !Array.isArray(data.nodes) ||
        !Array.isArray(data.edges)
      ) {
        throw new Error("Invalid quest file format");
      }

      updateQuestData(data.nodes, data.edges);

      toast({
        title: i18n.t("notices.questLoaded"),
        description: i18n.t("notices.questFileLoaded"),
      });
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        toast({
          title: i18n.t("notices.loadFile"),
          description: error instanceof Error ? error.message : i18n.t("notices.unknown"),
          variant: "destructive",
        });
      }
    }
  }, [toast, updateQuestData]);

  // Unified publish flow - opens dialog and auto-runs validation
  const handlePublish = useCallback(() => {
    if (!currentGraph) {
      toast({
        title: i18n.t("notices.noGraph"),
        description: i18n.t("notices.graphFirst"),
        variant: "destructive",
      });
      return;
    }

    // Reset all state
    setPublishDialogTitle(currentGraph.title);
    setValidationResult(null);
    setPublishResult(null);
    setShowPublishDialog(true);
  }, [currentGraph, toast]);

  // Auto-validate when dialog opens
  const runValidation = useCallback(async () => {
    if (!currentGraph) return;

    setIsValidating(true);
    setValidationResult(null);

    try {
      const { data, error } = await supabase.functions.invoke(
        "curriculum-publish",
        {
          body: {
            questGraphId: currentGraph.id,
            mode: "dryRun",
          },
        },
      );

      if (error) {
        throw error;
      }

      setValidationResult({
        validated: true,
        errors: data.errors,
        warnings: data.warnings,
        counts: data.counts,
      });
    } catch (error) {
      console.error("Validation error:", error);
      let errorMessage = i18n.t("notices.unknown");

      if (error instanceof Error) {
        errorMessage = error.message;
        if (
          error.message.includes("Failed to send") ||
          error.message.includes("fetch failed")
        ) {
          errorMessage =
            "Edge Function not deployed or unreachable. Please deploy the 'curriculum-publish' function.";
        }
      } else if (
        typeof error === "object" &&
        error !== null &&
        "message" in error
      ) {
        errorMessage = String(error.message);
      }

      setValidationResult({
        validated: true,
        errors: [errorMessage],
      });
    } finally {
      setIsValidating(false);
    }
  }, [currentGraph]);

  // Run validation when dialog opens
  useEffect(() => {
    if (
      showPublishDialog &&
      currentGraph &&
      !validationResult &&
      !isValidating
    ) {
      runValidation();
    }
  }, [
    showPublishDialog,
    currentGraph,
    validationResult,
    isValidating,
    runValidation,
  ]);

  // Note: bundleTuneAssets has been removed - tunes must be published via Tune Manager first

  const confirmPublish = useCallback(async () => {
    if (!currentGraph) return;

    setIsPublishing(true);

    try {
      // No longer bundling tune assets - they must be published via Tune Manager first
      console.log("[QuestEditor] Publishing curriculum (tunes already in DB)");

      const { data, error } = await supabase.functions.invoke(
        "curriculum-publish",
        {
          body: {
            questGraphId: currentGraph.id,
            publishTitle: publishDialogTitle.trim() || undefined,
            mode: "publish",
            // tuneAssets no longer sent - tunes must be pre-published
          },
        },
      );

      if (error) {
        throw error;
      }

      if (data.success) {
        setPublishResult({
          success: true,
          versionId: data.versionId,
          publishedAt: data.publishedAt,
        });
        toast({
          title: i18n.t("notices.published"),
          description: i18n.t("notices.publishedVersion", { id: data.versionId?.substring(0, 8) }),
        });
      } else {
        // Re-run validation to show the errors
        setValidationResult({
          validated: true,
          errors: data.errors,
          warnings: data.warnings,
          counts: data.counts,
        });
        toast({
          title: i18n.t("editing.publishFailed"),
          description: data.errors?.join(", ") || i18n.t("notices.unknown"),
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Publish error:", error);
      let errorMessage = i18n.t("notices.unknown");

      if (error instanceof Error) {
        errorMessage = error.message;
        if (
          error.message.includes("Failed to send") ||
          error.message.includes("fetch failed")
        ) {
          errorMessage =
            "Edge Function not deployed or unreachable. Please deploy the 'curriculum-publish' function.";
        } else if (error.message.includes("non-2xx")) {
          errorMessage =
            "Edge Function returned an error. Check function logs for details.";
        }
      } else if (typeof error === "object" && error !== null) {
        const errObj = error as Record<string, unknown>;
        if (
          "context" in errObj &&
          errObj.context &&
          typeof errObj.context === "object"
        ) {
          const ctx = errObj.context as Record<string, unknown>;
          if (ctx.body && typeof ctx.body === "string") {
            try {
              const body = JSON.parse(ctx.body);
              if (body.errors && Array.isArray(body.errors)) {
                setValidationResult({
                  validated: true,
                  errors: body.errors,
                  warnings: body.warnings,
                  counts: body.counts,
                });
                toast({
                  title: i18n.t("notices.publishError"),
                  description: body.errors.join(", "),
                  variant: "destructive",
                });
                return;
              }
            } catch {
              // Fall back to the original error if the response is not JSON.
            }
          }
        }
        if ("message" in errObj) {
          errorMessage = String(errObj.message);
        }
      }

      setValidationResult({
        validated: true,
        errors: [errorMessage],
      });
      toast({
        title: i18n.t("notices.publishError"),
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsPublishing(false);
    }
  }, [currentGraph, publishDialogTitle, toast]);

  const hasValidationErrors =
    validationResult?.errors && validationResult.errors.length > 0;
  const canPublish =
    validationResult?.validated &&
    !hasValidationErrors &&
    !publishResult?.success;

  const handleExportSchema = useCallback(async () => {
    try {
      if (!("showSaveFilePicker" in window)) {
        toast({
          title: i18n.t("notices.picker"),
          description:
            i18n.t("notices.pickerDetail"),
          variant: "destructive",
        });
        return;
      }

      const questData: QuestData = { nodes, edges };
      const schemaData = exportGraphToSchema(questData);

      const json = JSON.stringify(schemaData, null, 2);
      const blob = new Blob([json], { type: "application/json" });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fileHandle = await (window as any).showSaveFilePicker({
        suggestedName: "curriculum.schema.json",
        types: [
          {
            description: i18n.t("notices.jsonFiles"),
            accept: { "application/json": [".json"] },
          },
        ],
      });

      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();

      toast({
        title: i18n.t("notices.schemaExported"),
        description: i18n.t("notices.exported", { tracks: schemaData.tracks.length, lessons: schemaData.lessons.length, skills: schemaData.skills.length }),
      });
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        toast({
          title: i18n.t("notices.schemaExportError"),
          description: error instanceof Error ? error.message : i18n.t("notices.unknown"),
          variant: "destructive",
        });
      }
    }
  }, [nodes, edges, toast]);

  const handleImport = useCallback(async () => {
    try {
      if (!("showOpenFilePicker" in window)) {
        toast({
          title: i18n.t("notices.picker"),
          description:
            i18n.t("notices.pickerDetail"),
          variant: "destructive",
        });
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fileHandles = await (window as any).showOpenFilePicker({
        types: [
          {
            description: i18n.t("notices.jsonFiles"),
            accept: { "application/json": [".json"] },
          },
        ],
        multiple: false,
      });

      if (!fileHandles || fileHandles.length === 0) return;

      const file = await fileHandles[0].getFile();
      const text = await file.text();
      const importData = JSON.parse(text);

      // Validate structure
      if (
        !importData.tracks ||
        !importData.lessons ||
        !importData.skills ||
        !Array.isArray(importData.tracks) ||
        !Array.isArray(importData.lessons) ||
        !Array.isArray(importData.skills)
      ) {
        throw new Error("Invalid schema import format");
      }

      // Import the curriculum (merge with existing nodes)
      const result = importCurriculumToGraph(importData, nodes);

      // Show warnings if any
      if (result.warnings.length > 0) {
        const warningMessages = result.warnings
          .map((w) => w.message)
          .join("\n");
        toast({
          title: i18n.t("notices.importWarnings"),
          description: warningMessages,
          variant: "default",
        });
      }

      // Merge imported nodes and edges with existing ones
      const mergedNodes = [...nodes, ...result.data.nodes];
      const mergedEdges = [...edges, ...result.data.edges];

      updateQuestData(mergedNodes, mergedEdges);

      toast({
        title: i18n.t("notices.curriculumImported"),
        description: i18n.t("notices.imported", { tracks: importData.tracks.length, lessons: importData.lessons.length, skills: importData.skills.length }),
      });
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        toast({
          title: i18n.t("notices.curriculumError"),
          description: error instanceof Error ? error.message : i18n.t("notices.unknown"),
          variant: "destructive",
        });
      }
    }
  }, [toast, updateQuestData, nodes, edges]);

  // New: Handle new graph (clear current)
  const handleNew = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowNewConfirmDialog(true);
    } else {
      clearCurrentGraph();
      updateQuestData([], []);
      lastSavedDataRef.current = JSON.stringify({ nodes: [], edges: [] });
      setHasUnsavedChanges(false);
    }
  }, [hasUnsavedChanges, clearCurrentGraph, updateQuestData]);

  const confirmNew = useCallback(() => {
    clearCurrentGraph();
    updateQuestData([], []);
    lastSavedDataRef.current = JSON.stringify({ nodes: [], edges: [] });
    setHasUnsavedChanges(false);
    setShowNewConfirmDialog(false);
  }, [clearCurrentGraph, updateQuestData]);

  // Save: Save current graph to database
  const handleSave = useCallback(async () => {
    if (currentGraph) {
      // Update existing
      const success = await updateQuestGraph(currentGraph.id, { nodes, edges });
      if (success) {
        markAsSaved();
      }
    } else {
      // Show save dialog for new graph
      setSaveDialogTitle("");
      setShowSaveDialog(true);
    }
  }, [currentGraph, nodes, edges, updateQuestGraph, markAsSaved]);

  const confirmSave = useCallback(async () => {
    if (!saveDialogTitle.trim()) {
      toast({
        title: i18n.t("notices.needTitle"),
        description: i18n.t("notices.enterTitle"),
        variant: "destructive",
      });
      return;
    }
    const graph = await saveQuestGraph(saveDialogTitle.trim(), {
      nodes,
      edges,
    });
    if (graph) {
      markAsSaved();
      setShowSaveDialog(false);
    }
  }, [saveDialogTitle, nodes, edges, saveQuestGraph, markAsSaved, toast]);

  // Open: Load a graph from database
  const handleLoadGraph = useCallback(
    (graph: QuestGraph) => {
      if (hasUnsavedChanges) {
        setPendingLoadGraph(graph);
        setShowNewConfirmDialog(true);
      } else {
        loadQuestGraph(graph);
        updateQuestData(graph.data.nodes, graph.data.edges);
        lastSavedDataRef.current = JSON.stringify(graph.data);
        setHasUnsavedChanges(false);
      }
    },
    [hasUnsavedChanges, loadQuestGraph, updateQuestData],
  );

  const confirmLoadPending = useCallback(() => {
    if (pendingLoadGraph) {
      loadQuestGraph(pendingLoadGraph);
      updateQuestData(pendingLoadGraph.data.nodes, pendingLoadGraph.data.edges);
      lastSavedDataRef.current = JSON.stringify(pendingLoadGraph.data);
      setHasUnsavedChanges(false);
      setPendingLoadGraph(null);
    } else {
      // Just creating new
      clearCurrentGraph();
      updateQuestData([], []);
      lastSavedDataRef.current = JSON.stringify({ nodes: [], edges: [] });
      setHasUnsavedChanges(false);
    }
    setShowNewConfirmDialog(false);
  }, [pendingLoadGraph, loadQuestGraph, updateQuestData, clearCurrentGraph]);

  // Delete: Delete current graph from database
  const handleDelete = useCallback(async () => {
    if (currentGraph) {
      setShowDeleteConfirmDialog(true);
    }
  }, [currentGraph]);

  const confirmDelete = useCallback(async () => {
    if (currentGraph) {
      const success = await deleteQuestGraph(currentGraph.id);
      if (success) {
        updateQuestData([], []);
        lastSavedDataRef.current = JSON.stringify({ nodes: [], edges: [] });
        setHasUnsavedChanges(false);
      }
    }
    setShowDeleteConfirmDialog(false);
  }, [currentGraph, deleteQuestGraph, updateQuestData]);

  // Rename: Rename current graph
  const handleRename = useCallback(() => {
    if (currentGraph) {
      setRenameDialogTitle(currentGraph.title);
      setShowRenameDialog(true);
    }
  }, [currentGraph]);

  const confirmRename = useCallback(async () => {
    if (!currentGraph) return;

    if (!renameDialogTitle.trim()) {
      toast({
        title: i18n.t("notices.needTitle"),
        description: i18n.t("notices.enterTitle"),
        variant: "destructive",
      });
      return;
    }

    const success = await updateQuestGraph(
      currentGraph.id,
      { nodes, edges },
      renameDialogTitle.trim(),
    );

    if (success) {
      setShowRenameDialog(false);
      setRenameDialogTitle("");
    }
  }, [currentGraph, renameDialogTitle, nodes, edges, updateQuestGraph, toast]);

  const handleEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      // Filter out deleted edges from current edges
      const deletedEdgeIds = new Set(deletedEdges.map((e) => e.id));
      const remainingEdges = edges.filter((e) => !deletedEdgeIds.has(e.id));
      updateQuestData(nodes, remainingEdges);
    },
    [edges, nodes, updateQuestData],
  );

  const headerActions = useMemo(
    () => (
      <div className="flex gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Plus className="h-4 w-4" />
              {translate("questEditor.add")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>{translate("questEditor.addNode")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => addNode("track")}>
              {translate("questEditor.track")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => addNode("lesson")}>
              {translate("questEditor.lesson")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => addNode("skill")}>
              {translate("questEditor.skill")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => addNode("tune")}>
              {translate("questEditor.tune")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Menu className="h-4 w-4" />
              {translate("questEditor.manage")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48">
            <DropdownMenuItem onClick={handleNew}>
              <FilePlus className="h-4 w-4" />
              {translate("menus.new")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSave} disabled={isDbLoading}>
              <Save className="h-4 w-4" />
              {translate("menus.save")}
              {hasUnsavedChanges && (
                <span className="ml-auto text-xs text-muted-foreground">•</span>
              )}
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FolderOpen className="h-4 w-4" />
                {translate("compose.open")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56">
                {questGraphs.length === 0 ? (
                  <DropdownMenuItem disabled>{translate("questEditor.noGraphs")}</DropdownMenuItem>
                ) : (
                  questGraphs.map((graph) => (
                    <DropdownMenuItem
                      key={graph.id}
                      onClick={() => handleLoadGraph(graph)}
                    >
                      {graph.title}
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem
              onClick={handleRename}
              disabled={!currentGraph || isDbLoading}
            >
              <Pencil className="h-4 w-4" />
              {translate("questEditor.rename")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleDelete}
              disabled={!currentGraph || isDbLoading}
              className="text-destructive focus:bg-destructive focus:text-destructive-foreground"
            >
              <Trash2 className="h-4 w-4" />
              {translate("userMenu.delete")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FileJson className="h-4 w-4" />
                {translate("questEditor.transfer")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-48">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {translate("questEditor.schema")}
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={handleExportSchema}>
                  <Download className="h-4 w-4" />
                  {translate("questEditor.exportSchema")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleImport}>
                  <Upload className="h-4 w-4" />
                  {translate("questEditor.importSchema")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {translate("questEditor.graph")}
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={handleDownload}>
                  <Download className="h-4 w-4" />
                  {translate("questEditor.exportJson")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleOpenFile}>
                  <Upload className="h-4 w-4" />
                  {translate("questEditor.importJson")}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handlePublish}
              disabled={!currentGraph || isDbLoading}
            >
              <Rocket className="h-4 w-4" />
              {translate("questEditor.publish")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    ),
    [
      addNode,
      currentGraph,
      handleDelete,
      handleExportSchema,
      handleImport,
      handleLoadGraph,
      handleNew,
      handleOpenFile,
      handlePublish,
      handleRename,
      handleSave,
      handleDownload,
      hasUnsavedChanges,
      isDbLoading,
      questGraphs,
      translate,
    ],
  );

  useEffect(() => {
    if (!onHeaderActionsChange) {
      return;
    }
    if (isEmbedded && isActive) {
      onHeaderActionsChange(headerActions);
      return;
    }
    onHeaderActionsChange(null);
  }, [headerActions, isActive, isEmbedded, onHeaderActionsChange]);

  const editorTitle = useMemo(() => {
    const baseTitle = translate("questEditor.title");
    if (currentGraph) {
      return `${baseTitle} — ${currentGraph.title}${
        hasUnsavedChanges ? " " + translate("questEditor.unsaved") : ""
      }`;
    }
    if (hasUnsavedChanges) {
      return `${baseTitle} — ${translate("questEditor.unsaved")}`;
    }
    return baseTitle;
  }, [currentGraph, hasUnsavedChanges, translate]);

  useEffect(() => {
    if (!onHeaderTitleChange) {
      return;
    }
    if (isEmbedded && isActive) {
      onHeaderTitleChange(editorTitle);
      return;
    }
    onHeaderTitleChange(null);
  }, [editorTitle, isActive, isEmbedded, onHeaderTitleChange]);

  const editorContent = (
    <>
      {!isEmbedded && (
        <div className="p-3 border-b h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DialogTitle>{translate("questEditor.title")}</DialogTitle>
            {currentGraph && (
              <span className="text-sm text-muted-foreground">
                — {currentGraph.title}
                {hasUnsavedChanges && " (unsaved)"}
              </span>
            )}
            {!currentGraph && hasUnsavedChanges && (
              <span className="text-sm text-muted-foreground">{translate("questEditor.unsaved")}</span>
            )}
          </div>
          <div className="flex gap-2">
            {headerActions}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange?.(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <div
        className="flex-1 relative"
        style={isEmbedded ? undefined : { height: "calc(100vh - 64px)" }}
      >
        <style>{questControlsStyles}</style>
        <ReactFlowProvider>
          <QuestEditorFlow
            isActive={isVisible}
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onEdgesDelete={handleEdgesDelete}
            onConnect={handleConnect}
            onEditNode={handleEditNode}
          />
        </ReactFlowProvider>
      </div>

      <Sheet
        open={editingNodeId !== null}
        onOpenChange={(open) => {
          if (!open) handleCancelEdit();
        }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              {translate("questEditor.edit")}{" "}
              {editingNodeId &&
                nodes.find((n) => n.id === editingNodeId)?.data.type}
            </SheetTitle>
            <SheetDescription>{translate("editing.nodeId")} {editingNodeId}</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">{translate("upload.title")}</Label>
              <Input
                id="title"
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSaveTitle();
                  } else if (e.key === "Escape") {
                    handleCancelEdit();
                  }
                }}
                autoFocus
              />
            </div>
            {editingNodeId &&
              nodes.find((n) => n.id === editingNodeId)?.data.type ===
                "track" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="trackKey">{translate("questEditor.trackKey")}</Label>
                    <Input
                      id="trackKey"
                      type="text"
                      value={editingTrackKey}
                      onChange={(e) => setEditingTrackKey(e.target.value)}
                      aria-invalid={
                        editingTrackKey &&
                        (editingTrackKey.trim() === "" ||
                          editingTrackKey.includes(" ") ||
                          isTrackKeyInUse(
                            editingTrackKey.trim(),
                            editingNodeId,
                          ))
                          ? "true"
                          : "false"
                      }
                      className={
                        editingTrackKey &&
                        (editingTrackKey.trim() === "" ||
                          editingTrackKey.includes(" ") ||
                          isTrackKeyInUse(
                            editingTrackKey.trim(),
                            editingNodeId,
                          ))
                          ? "border-destructive focus-visible:ring-destructive"
                          : ""
                      }
                      placeholder={translate("editing.example", { value: "beginner-piano" })}
                    />
                    {editingTrackKey &&
                      (editingTrackKey.trim() === "" ||
                        editingTrackKey.includes(" ") ||
                        isTrackKeyInUse(
                          editingTrackKey.trim(),
                          editingNodeId,
                        )) && (
                        <p className="text-sm text-destructive">
                          {editingTrackKey.trim() === ""
                            ? i18n.t("notices.keyEmptyTrack")
                            : editingTrackKey.includes(" ")
                              ? i18n.t("notices.keySpacesTrack")
                              : "This track key is already in use"}
                        </p>
                      )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="order">{translate("questEditor.order")}</Label>
                    <Input
                      id="order"
                      type="number"
                      min="1"
                      value={editingOrder}
                      onChange={(e) => setEditingOrder(e.target.value)}
                      aria-invalid={
                        editingOrder &&
                        (isNaN(parseInt(editingOrder, 10)) ||
                          parseInt(editingOrder, 10) <= 0 ||
                          !Number.isInteger(parseFloat(editingOrder)) ||
                          isOrderInUse(
                            parseInt(editingOrder, 10),
                            editingNodeId,
                          ))
                          ? "true"
                          : "false"
                      }
                      className={
                        editingOrder &&
                        (isNaN(parseInt(editingOrder, 10)) ||
                          parseInt(editingOrder, 10) <= 0 ||
                          !Number.isInteger(parseFloat(editingOrder)) ||
                          isOrderInUse(
                            parseInt(editingOrder, 10),
                            editingNodeId,
                          ))
                          ? "border-destructive focus-visible:ring-destructive"
                          : ""
                      }
                    />
                    {editingOrder &&
                      (isNaN(parseInt(editingOrder, 10)) ||
                        parseInt(editingOrder, 10) <= 0 ||
                        !Number.isInteger(parseFloat(editingOrder)) ||
                        isOrderInUse(
                          parseInt(editingOrder, 10),
                          editingNodeId,
                        )) && (
                        <p className="text-sm text-destructive">
                          {isOrderInUse(
                            parseInt(editingOrder, 10),
                            editingNodeId,
                          )
                            ? "This order number is already in use"
                            : i18n.t("notices.orderValue")}
                        </p>
                      )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">{translate("questEditor.description")}</Label>
                    <Textarea
                      id="description"
                      value={editingDescription}
                      onChange={(e) => setEditingDescription(e.target.value)}
                      rows={4}
                    />
                  </div>
                </>
              )}
            {editingNodeId &&
              nodes.find((n) => n.id === editingNodeId)?.data.type ===
                "skill" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="skillKey">{translate("questEditor.skillKey")}</Label>
                    <Input
                      id="skillKey"
                      type="text"
                      value={editingSkillKey}
                      onChange={(e) => setEditingSkillKey(e.target.value)}
                      aria-invalid={
                        editingSkillKey &&
                        (editingSkillKey.trim() === "" ||
                          editingSkillKey.includes(" ") ||
                          isSkillKeyInUse(
                            editingSkillKey.trim(),
                            editingNodeId,
                          ))
                          ? "true"
                          : "false"
                      }
                      className={
                        editingSkillKey &&
                        (editingSkillKey.trim() === "" ||
                          editingSkillKey.includes(" ") ||
                          isSkillKeyInUse(
                            editingSkillKey.trim(),
                            editingNodeId,
                          ))
                          ? "border-destructive focus-visible:ring-destructive"
                          : ""
                      }
                      placeholder={translate("editing.example", { value: "piano_basics" })}
                    />
                    {editingSkillKey &&
                      (editingSkillKey.trim() === "" ||
                        editingSkillKey.includes(" ") ||
                        isSkillKeyInUse(
                          editingSkillKey.trim(),
                          editingNodeId,
                        )) && (
                        <p className="text-sm text-destructive">
                          {editingSkillKey.trim() === ""
                            ? i18n.t("notices.keyEmptySkill")
                            : editingSkillKey.includes(" ")
                              ? i18n.t("notices.keySpacesSkill")
                              : "This skill key is already in use"}
                        </p>
                      )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">{translate("questEditor.description")}</Label>
                    <Textarea
                      id="description"
                      value={editingDescription}
                      onChange={(e) => setEditingDescription(e.target.value)}
                      rows={4}
                      autoResize
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unlockGuidance">{translate("questEditor.unlockGuidance")}</Label>
                    <Textarea
                      id="unlockGuidance"
                      value={editingUnlockGuidance}
                      onChange={(e) => setEditingUnlockGuidance(e.target.value)}
                      rows={4}
                      autoResize
                    />
                  </div>
                </>
              )}
            {editingNodeId &&
              nodes.find((n) => n.id === editingNodeId)?.data.type ===
                "lesson" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="lessonKey">{translate("questEditor.lessonKey")}</Label>
                    <Input
                      id="lessonKey"
                      type="text"
                      value={editingLessonKey}
                      onChange={(e) => setEditingLessonKey(e.target.value)}
                      aria-invalid={
                        editingLessonKey &&
                        (editingLessonKey.trim() === "" ||
                          editingLessonKey.includes(" ") ||
                          isLessonKeyInUse(
                            editingLessonKey.trim(),
                            editingNodeId,
                          ))
                          ? "true"
                          : "false"
                      }
                      className={
                        editingLessonKey &&
                        (editingLessonKey.trim() === "" ||
                          editingLessonKey.includes(" ") ||
                          isLessonKeyInUse(
                            editingLessonKey.trim(),
                            editingNodeId,
                          ))
                          ? "border-destructive focus-visible:ring-destructive"
                          : ""
                      }
                      placeholder={translate("editing.example", { value: "A1.1" })}
                    />
                    {editingLessonKey &&
                      (editingLessonKey.trim() === "" ||
                        editingLessonKey.includes(" ") ||
                        isLessonKeyInUse(
                          editingLessonKey.trim(),
                          editingNodeId,
                        )) && (
                        <p className="text-sm text-destructive">
                          {editingLessonKey.trim() === ""
                            ? i18n.t("notices.keyEmptyLesson")
                            : editingLessonKey.includes(" ")
                              ? i18n.t("notices.keySpacesLesson")
                              : "This lesson key is already in use"}
                        </p>
                      )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="goal">{translate("questEditor.goal")}</Label>
                    <Textarea
                      id="goal"
                      value={editingGoal}
                      onChange={(e) => setEditingGoal(e.target.value)}
                      placeholder={translate("questEditor.exampleGoal")}
                      autoResize
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="level">{translate("questEditor.level")}</Label>
                    <Select
                      value={editingLevel}
                      onValueChange={(value) =>
                        setEditingLevel(
                          value as "beginner" | "intermediate" | "advanced",
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={translate("questEditor.selectLevel")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="beginner">{translate("questEditor.beginner")}</SelectItem>
                        <SelectItem value="intermediate">
                          {translate("questEditor.intermediate")}
                        </SelectItem>
                        <SelectItem value="advanced">{translate("questEditor.advanced")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="setupGuidance">{translate("questEditor.setup")}</Label>
                    <Textarea
                      id="setupGuidance"
                      value={editingSetupGuidance}
                      onChange={(e) => setEditingSetupGuidance(e.target.value)}
                      rows={4}
                      autoResize
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="evaluationGuidance">
                      {translate("questEditor.evaluation")}
                    </Label>
                    <Textarea
                      id="evaluationGuidance"
                      value={editingEvaluationGuidance}
                      onChange={(e) =>
                        setEditingEvaluationGuidance(e.target.value)
                      }
                      rows={4}
                      autoResize
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="difficultyGuidance">
                      {translate("questEditor.difficulty")}
                    </Label>
                    <Textarea
                      id="difficultyGuidance"
                      value={editingDifficultyGuidance}
                      onChange={(e) =>
                        setEditingDifficultyGuidance(e.target.value)
                      }
                      rows={4}
                      autoResize
                    />
                  </div>
                </>
              )}
            {editingNodeId &&
              nodes.find((n) => n.id === editingNodeId)?.data.type ===
                "tune" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="tuneKey">{translate("questEditor.tuneKey")}</Label>
                    <Input
                      id="tuneKey"
                      type="text"
                      value={editingTuneKey}
                      onChange={(e) => setEditingTuneKey(e.target.value)}
                      placeholder={translate("editing.example", { value: "st-louis-blues" })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="musicRef">{translate("questEditor.musicRef")}</Label>
                    <Select
                      value={editingMusicRef}
                      onValueChange={setEditingMusicRef}
                      disabled={isLoadingTunes}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            isLoadingTunes
                              ? "Loading..."
                              : "Select a published tune..."
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {availablePublishedTunes.length === 0 ? (
                          <SelectItem value="" disabled>
                            {translate("questEditor.noTunes")}
                          </SelectItem>
                        ) : (
                          availablePublishedTunes.map((tune) => (
                            <SelectItem key={tune.key} value={tune.key}>
                              {tune.label}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {translate("questEditor.publishedOnly")}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="level">{translate("questEditor.level")}</Label>
                    <Select
                      value={editingLevel}
                      onValueChange={(value) =>
                        setEditingLevel(
                          value as "beginner" | "intermediate" | "advanced",
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={translate("questEditor.selectLevel")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="beginner">{translate("questEditor.beginner")}</SelectItem>
                        <SelectItem value="intermediate">
                          {translate("questEditor.intermediate")}
                        </SelectItem>
                        <SelectItem value="advanced">{translate("questEditor.advanced")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">{translate("questEditor.description")}</Label>
                    <Textarea
                      id="description"
                      value={editingDescription}
                      onChange={(e) => setEditingDescription(e.target.value)}
                      rows={4}
                      autoResize
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="evaluationGuidance">
                      {translate("questEditor.evaluation")}
                    </Label>
                    <Textarea
                      id="evaluationGuidance"
                      value={editingEvaluationGuidance}
                      onChange={(e) =>
                        setEditingEvaluationGuidance(e.target.value)
                      }
                      rows={4}
                      autoResize
                      placeholder={translate("questEditor.evaluationHint")}
                    />
                    <p className="text-xs text-muted-foreground">
                      {translate("questEditor.optionalEvaluation")}
                    </p>
                  </div>
                </>
              )}
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={handleCancelEdit}>
              {translate("menus.cancel")}
            </Button>
            <Button onClick={handleSaveTitle}>{translate("menus.save")}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );

  return (
    <>
      {isEmbedded ? (
        <div className="flex flex-col flex-1 w-full min-h-[calc(100dvh-4rem)]">
          {editorContent}
        </div>
      ) : (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="max-w-none w-screen h-screen m-0 p-0 gap-0 rounded-none translate-x-0 translate-y-0 left-0 top-0 [&>button]:hidden">
            {editorContent}
          </DialogContent>
        </Dialog>
      )}

      {/* Save Dialog */}
      <AlertDialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{translate("questEditor.saveGraph")}</AlertDialogTitle>
            <AlertDialogDescription>
              {translate("questEditor.graphPrompt")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Input
              placeholder={translate("questEditor.graphTitle")}
              value={saveDialogTitle}
              onChange={(e) => setSaveDialogTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmSave();
              }}
              autoFocus
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{translate("menus.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSave}>{translate("menus.save")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename Dialog */}
      <AlertDialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{translate("questEditor.renameGraph")}</AlertDialogTitle>
            <AlertDialogDescription>
              {translate("questEditor.newGraphTitle")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Input
              placeholder={translate("questEditor.graphTitle")}
              value={renameDialogTitle}
              onChange={(e) => setRenameDialogTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmRename();
              }}
              autoFocus
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{translate("menus.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRename}>
              {translate("questEditor.rename")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Publish Dialog */}
      <Dialog
        open={showPublishDialog}
        onOpenChange={(open) => {
          setShowPublishDialog(open);
          if (!open) {
            setValidationResult(null);
            setPublishResult(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{translate("questEditor.publishCurriculum")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Version Title Input */}
            <div>
              <Label htmlFor="publishTitle">{translate("questEditor.versionTitle")}</Label>
              <Input
                id="publishTitle"
                value={publishDialogTitle}
                onChange={(e) => setPublishDialogTitle(e.target.value)}
                placeholder={translate("questEditor.optionalVersion")}
                disabled={
                  isValidating || isPublishing || publishResult?.success
                }
              />
            </div>

            {/* Loading State */}
            {isValidating && (
              <div className="p-4 bg-muted rounded-md flex items-center gap-2">
                <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                <span className="text-sm text-muted-foreground">
                  {translate("questEditor.validating")}
                </span>
              </div>
            )}

            {/* Publish Success */}
            {publishResult?.success && (
              <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
                <h4 className="font-semibold text-green-900 dark:text-green-100 mb-2">
                  {translate("questEditor.published")}
                </h4>
                {publishResult.versionId && (
                  <p className="text-sm text-green-800 dark:text-green-200">
                    {translate("editing.versionId")} {publishResult.versionId}
                  </p>
                )}
              </div>
            )}

            {/* Critical Errors */}
            {!publishResult?.success && hasValidationErrors && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                <h4 className="font-semibold text-red-900 dark:text-red-100 mb-2">
                  {translate("editing.errors", { count: validationResult?.errors?.length || 0 })}
                </h4>
                <p className="text-xs text-red-700 dark:text-red-300 mb-2">
                  {translate("questEditor.fixBeforePublish")}
                </p>
                <ul className="list-disc list-inside text-sm text-red-700 dark:text-red-300 space-y-1">
                  {validationResult?.errors?.map((error, idx) => (
                    <li key={idx}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Warnings */}
            {validationResult?.warnings &&
              validationResult.warnings.length > 0 && (
                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                  <h4 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-2">
                    {translate("editing.warnings", { count: validationResult.warnings.length })}
                  </h4>
                  <p className="text-xs text-yellow-700 dark:text-yellow-300 mb-2">
                    {translate("questEditor.nonBlocking")}
                  </p>
                  <ul className="list-disc list-inside text-sm text-yellow-800 dark:text-yellow-200 space-y-1">
                    {validationResult.warnings.map((warning, idx) => (
                      <li key={idx}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

            {/* Stats */}
            {validationResult?.counts && !publishResult?.success && (
              <div className="p-3 bg-muted rounded-md text-sm text-muted-foreground">
                <span className="font-medium">{translate("questEditor.stats")}</span>{" "}
                {translate("editing.counts", { ...validationResult.counts })}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowPublishDialog(false);
                  setValidationResult(null);
                  setPublishResult(null);
                }}
                disabled={isValidating || isPublishing}
              >
                {translate(publishResult?.success ? "userMenu.close" : "menus.cancel")}
              </Button>
              {!publishResult?.success && (
                <Button
                  onClick={confirmPublish}
                  disabled={isValidating || isPublishing || !canPublish}
                >
                  {translate(isPublishing ? "editing.publishing" : "questEditor.publish")}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Unsaved Changes Confirm Dialog */}
      <AlertDialog
        open={showNewConfirmDialog}
        onOpenChange={setShowNewConfirmDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{translate("questEditor.unsavedTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {translate("questEditor.discardQuestion")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingLoadGraph(null)}>
              {translate("menus.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmLoadPending}>
              {translate("questEditor.discard")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirm Dialog */}
      <AlertDialog
        open={showDeleteConfirmDialog}
        onOpenChange={setShowDeleteConfirmDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{translate("questEditor.deleteGraph")}</AlertDialogTitle>
            <AlertDialogDescription>
              {translate("editing.confirmDelete", { title: currentGraph?.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{translate("menus.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              {translate("userMenu.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
