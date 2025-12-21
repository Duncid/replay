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
import { useQuestGraphs, QuestGraph } from "@/hooks/useQuestGraphs";
import {
  CurriculumExport,
  QuestData,
  QuestEdge,
  QuestEdgeType,
  QuestNode,
  QuestNodeType,
} from "@/types/quest";
import { compileCurriculum } from "@/utils/curriculumCompiler";
import { importCurriculumToGraph } from "@/utils/importCurriculumToGraph";
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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ChevronRight,
  Download,
  FileJson,
  FileOutput,
  FilePlus,
  FolderOpen,
  Menu,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";

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
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  variation: "track" | "lesson" | "skill";
  id: string;
  data: { title: string; type: QuestNodeType };
  selected?: boolean;
  onEdit: (nodeId: string) => void;
  infoText: string;
  children: ReactNode;
}) {
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
          Edit
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
      />
      <Handle
        type="source"
        position={Position.Top}
        id="track-required"
        isConnectable={true}
        style={{ zIndex: 10 }}
      />
      <span className="absolute right-[-50px] top-1/2 -translate-y-1/2 text-xs text-sky-600 pointer-events-none whitespace-nowrap">
        Initial
      </span>
      <span className="absolute top-[-20px] left-1/2 -translate-x-1/2 text-xs text-emerald-600 pointer-events-none whitespace-nowrap">
        Is requiring
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
  return (
    <QuestNodeBase
      variation="lesson"
      id={id}
      data={data}
      selected={selected}
      onEdit={onEdit}
      infoText="Previous: 1 max | Next: 1 max"
    >
      <Handle type="target" position={Position.Left} id="lesson-in" />
      <Handle type="source" position={Position.Right} id="lesson-out" />
      <Handle type="source" position={Position.Bottom} id="lesson-unlockable" />
      <Handle type="source" position={Position.Top} id="lesson-required" />
      <span className="absolute left-[-40px] top-1/2 -translate-y-1/2 text-xs text-sky-600 pointer-events-none whitespace-nowrap">
        Prev
      </span>
      <span className="absolute right-[-30px] top-1/2 -translate-y-1/2 text-xs text-sky-600 pointer-events-none whitespace-nowrap">
        Next
      </span>
      <span className="absolute bottom-[-20px] left-1/2 -translate-x-1/2 text-xs text-emerald-600 pointer-events-none whitespace-nowrap">
        Unlocking
      </span>
      <span className="absolute top-[-20px] left-1/2 -translate-x-1/2 text-xs text-emerald-600 pointer-events-none whitespace-nowrap">
        Is requiring
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
  return (
    <QuestNodeBase
      variation="skill"
      id={id}
      data={data}
      selected={selected}
      onEdit={onEdit}
      infoText="In: Multiple required, 1 unlockable"
    >
      <Handle type="target" position={Position.Top} id="skill-unlockable" />
      <Handle type="target" position={Position.Bottom} id="skill-required" />
      <span className="absolute top-[-20px] left-1/2 -translate-x-1/2 text-xs text-sky-600 pointer-events-none whitespace-nowrap">
        Unlocked by
      </span>
      <span className="absolute bottom-[-20px] left-1/2 -translate-x-1/2 text-xs text-sky-600 pointer-events-none whitespace-nowrap">
        Is required by
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

function QuestEditorFlow({
  onNodesChange,
  onEdgesChange,
  onEdgesDelete,
  nodes,
  edges,
  onConnect,
  onEditNode,
}: {
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onEdgesDelete?: (edges: Edge[]) => void;
  nodes: QuestNode[];
  edges: QuestEdge[];
  onConnect: (connection: Connection) => void;
  onEditNode: (nodeId: string) => void;
}) {
  const nodeTypes: NodeTypes = {
    track: (props: NodeComponentProps) => (
      <TrackNode {...props} onEdit={onEditNode} />
    ),
    lesson: (props: NodeComponentProps) => (
      <LessonNode {...props} onEdit={onEditNode} />
    ),
    skill: (props: NodeComponentProps) => (
      <SkillNode {...props} onEdit={onEditNode} />
    ),
  };

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
      <Background />
      <Controls className="quest-controls" />
      <MiniMap
        className="quest-minimap"
        nodeColor={(node) => {
          const nodeType = node.data?.type;
          if (nodeType === "track") return "rgb(219, 39, 119)"; // pink-500
          if (nodeType === "lesson") return "rgb(14, 165, 233)"; // sky-500
          if (nodeType === "skill") return "rgb(16, 185, 129)"; // emerald-500
          return "hsl(var(--muted))";
        }}
      />
    </ReactFlow>
  );
}

export function QuestEditor({ open, onOpenChange }: QuestEditorProps) {
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

  const [questData, setQuestData] = useLocalStorage<QuestData>(
    "quest-editor-data",
    {
      nodes: [],
      edges: [],
    }
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<QuestNode>(
    questData.nodes
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<QuestEdge>(
    questData.edges
  );

  // Track unsaved changes
  const lastSavedDataRef = useRef<string>("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Dialog states
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showNewConfirmDialog, setShowNewConfirmDialog] = useState(false);
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const [saveDialogTitle, setSaveDialogTitle] = useState("");
  const [pendingLoadGraph, setPendingLoadGraph] = useState<QuestGraph | null>(null);

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
  const [editingSetupGuidance, setEditingSetupGuidance] = useState<string>("");
  const [editingEvaluationGuidance, setEditingEvaluationGuidance] =
    useState<string>("");
  const [editingDifficultyGuidance, setEditingDifficultyGuidance] =
    useState<string>("");

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
    [setQuestData, setNodes, setEdges]
  );

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
          setEditingSetupGuidance(node.data.setupGuidance || "");
          setEditingEvaluationGuidance(node.data.evaluationGuidance || "");
          setEditingDifficultyGuidance(node.data.difficultyGuidance || "");
          setEditingOrder("");
          setEditingDescription("");
          setEditingTrackKey("");
          setEditingSkillKey("");
          setEditingUnlockGuidance("");
        } else {
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
        }
      }
    },
    [nodes]
  );

  // Helper function to get first available order number
  const getFirstAvailableOrder = useCallback((): number => {
    const trackNodes = nodes.filter((n) => n.data.type === "track");
    const usedOrders = trackNodes
      .map((n) => n.data.order)
      .filter(
        (order): order is number => typeof order === "number" && order > 0
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
          n.data.order === order
      );
    },
    [nodes]
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
          n.data.skillKey === skillKey.trim()
      );
    },
    [nodes]
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
          n.data.lessonKey === lessonKey.trim()
      );
    },
    [nodes]
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
          n.data.trackKey === trackKey.trim()
      );
    },
    [nodes]
  );

  const handleSaveTitle = useCallback(() => {
    if (!editingNodeId) return;

    const currentNode = nodes.find((n) => n.id === editingNodeId);
    if (!currentNode) return;

    // Validate track-specific fields
    if (currentNode.data.type === "track") {
      if (!editingTrackKey || editingTrackKey.trim() === "") {
        toast({
          title: "Track key required",
          description: "Track key cannot be empty",
          variant: "destructive",
        });
        return;
      }

      if (editingTrackKey.includes(" ")) {
        toast({
          title: "Invalid track key",
          description: "Track key cannot contain spaces",
          variant: "destructive",
        });
        return;
      }

      if (isTrackKeyInUse(editingTrackKey.trim(), editingNodeId)) {
        toast({
          title: "Track key already in use",
          description: "This track key is already assigned to another track",
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
          title: "Invalid order",
          description: "Order must be a positive integer greater than 0",
          variant: "destructive",
        });
        return;
      }

      if (isOrderInUse(orderValue, editingNodeId)) {
        toast({
          title: "Order already in use",
          description: "This order number is already assigned to another track",
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
          title: "Invalid skill key",
          description: "Skill key cannot be empty",
          variant: "destructive",
        });
        return;
      }

      if (trimmedSkillKey.includes(" ")) {
        toast({
          title: "Invalid skill key",
          description: "Skill key cannot contain spaces",
          variant: "destructive",
        });
        return;
      }

      if (isSkillKeyInUse(trimmedSkillKey, editingNodeId)) {
        toast({
          title: "Skill key already in use",
          description: "This skill key is already assigned to another skill",
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
          title: "Invalid lesson key",
          description: "Lesson key cannot be empty",
          variant: "destructive",
        });
        return;
      }

      if (trimmedLessonKey.includes(" ")) {
        toast({
          title: "Invalid lesson key",
          description: "Lesson key cannot contain spaces",
          variant: "destructive",
        });
        return;
      }

      if (isLessonKeyInUse(trimmedLessonKey, editingNodeId)) {
        toast({
          title: "Lesson key already in use",
          description: "This lesson key is already assigned to another lesson",
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
          updatedData.setupGuidance = editingSetupGuidance || undefined;
          updatedData.evaluationGuidance =
            editingEvaluationGuidance || undefined;
          updatedData.difficultyGuidance =
            editingDifficultyGuidance || undefined;
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
    editingSetupGuidance,
    editingEvaluationGuidance,
    editingDifficultyGuidance,
    nodes,
    edges,
    updateQuestData,
    isOrderInUse,
    isTrackKeyInUse,
    isSkillKeyInUse,
    isLessonKeyInUse,
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
      targetHandle: string | null | undefined
    ): { valid: boolean; reason?: string } => {
      // Track → Lesson (using track-out → lesson-in)
      if (source.data.type === "track" && target.data.type === "lesson") {
        const outgoingCount = edges.filter(
          (e) => e.source === source.id && e.sourceHandle === "track-out"
        ).length;
        if (outgoingCount >= 1) {
          return {
            valid: false,
            reason: "Track can only have one outgoing connection",
          };
        }
        return { valid: true };
      }

      // Track → Skill (using track-required → skill-required)
      if (source.data.type === "track" && target.data.type === "skill") {
        // No limit on required connections from track to skills
        return { valid: true };
      }

      // Lesson → Lesson (using lesson-out → lesson-in)
      if (source.data.type === "lesson" && target.data.type === "lesson") {
        // Check if source already has lesson-out connection
        const sourceOutgoing = edges.filter(
          (e) => e.source === source.id && e.sourceHandle === "lesson-out"
        ).length;
        if (sourceOutgoing >= 1) {
          return {
            valid: false,
            reason:
              "Lesson can only have one outgoing connection to another lesson",
          };
        }
        // Check if target already has incoming connection
        const targetIncoming = edges.filter(
          (e) => e.target === target.id && e.targetHandle === "lesson-in"
        ).length;
        if (targetIncoming >= 1) {
          return {
            valid: false,
            reason: "Lesson can only have one incoming connection",
          };
        }
        return { valid: true };
      }

      // Lesson → Skill (using lesson-unlockable/required → skill-unlockable/required)
      if (source.data.type === "lesson" && target.data.type === "skill") {
        // Check if lesson already has outgoing connection to another lesson
        const lessonOutgoing = edges.filter(
          (e) => e.source === source.id && e.sourceHandle === "lesson-out"
        ).length;
        if (lessonOutgoing >= 1) {
          return {
            valid: false,
            reason:
              "Lesson can only have one outgoing connection to another lesson",
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
              e.data?.type === "unlockable"
          );
          if (existingUnlockable) {
            return {
              valid: false,
              reason: "Skill can only receive one 'Unlocked by' connection",
            };
          }
        }
        return { valid: true };
      }

      return { valid: false, reason: "Invalid connection type" };
    },
    [edges]
  );

  // Determine edge type from handle IDs
  const determineEdgeType = useCallback(
    (
      sourceHandle: string | null | undefined,
      targetHandle: string | null | undefined
    ): QuestEdgeType => {
      if (
        sourceHandle === "lesson-unlockable" &&
        targetHandle === "skill-unlockable"
      ) {
        return "unlockable";
      }
      // Lesson/Track "Is requiring" → Skill "Is required by"
      if (
        (sourceHandle === "lesson-required" ||
          sourceHandle === "track-required") &&
        targetHandle === "skill-required"
      ) {
        return "requirement";
      }
      return "default";
    },
    []
  );

  // Validate handle compatibility
  const validateHandleCompatibility = useCallback(
    (
      sourceHandle: string | null | undefined,
      targetHandle: string | null | undefined,
      sourceNode: QuestNode,
      targetNode: QuestNode
    ): { valid: boolean; reason?: string } => {
      // Track → Lesson
      if (
        sourceNode.data.type === "track" &&
        targetNode.data.type === "lesson"
      ) {
        if (sourceHandle !== "track-out" || targetHandle !== "lesson-in") {
          return {
            valid: false,
            reason: "Track must connect to Lesson using correct handles",
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
            "Track must connect to Skill using track-required → skill-required (Is requiring → Is required by)",
        };
      }

      // Lesson → Lesson
      if (
        sourceNode.data.type === "lesson" &&
        targetNode.data.type === "lesson"
      ) {
        if (sourceHandle !== "lesson-out" || targetHandle !== "lesson-in") {
          return {
            valid: false,
            reason: "Lesson must connect to Lesson using correct handles",
          };
        }
        return { valid: true };
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
            "Lesson must connect to Skill using matching handles (Unlocking → Unlocked by, or Is requiring → Is required by)",
        };
      }

      return { valid: false, reason: "Invalid handle combination" };
    },
    []
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
        targetNode
      );

      if (!handleValidation.valid) {
        toast({
          title: "Invalid connection",
          description: handleValidation.reason,
          variant: "destructive",
        });
        return;
      }

      // Determine edge type from handles
      const edgeType = determineEdgeType(
        connection.sourceHandle,
        connection.targetHandle
      );

      // Validate node connection limits
      const validation = canConnect(
        sourceNode,
        targetNode,
        connection.sourceHandle,
        connection.targetHandle
      );
      if (!validation.valid) {
        toast({
          title: "Invalid connection",
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
    ]
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
    [nodes, edges, updateQuestData, getFirstAvailableOrder]
  );

  const handleDownload = useCallback(async () => {
    try {
      if (!("showSaveFilePicker" in window)) {
        toast({
          title: "File picker not supported",
          description:
            "Your browser doesn't support the File System Access API.",
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
            description: "JSON files",
            accept: { "application/json": [".json"] },
          },
        ],
      });

      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();

      toast({
        title: "Quest saved",
        description: "Quest data has been saved to file.",
      });
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        toast({
          title: "Error saving file",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      }
    }
  }, [nodes, edges, toast]);

  const handleExport = useCallback(async () => {
    try {
      if (!("showSaveFilePicker" in window)) {
        toast({
          title: "File picker not supported",
          description:
            "Your browser doesn't support the File System Access API.",
          variant: "destructive",
        });
        return;
      }

      const questData: QuestData = { nodes, edges };
      const result = compileCurriculum(questData);

      if (!result.success) {
        const errorMessages = result.errors.map((e) => e.message).join("\n");
        toast({
          title: "Export validation failed",
          description: errorMessages,
          variant: "destructive",
        });
        return;
      }

      if (!result.export) {
        toast({
          title: "Export failed",
          description: "Failed to generate export",
          variant: "destructive",
        });
        return;
      }

      const json = JSON.stringify(result.export, null, 2);
      const blob = new Blob([json], { type: "application/json" });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fileHandle = await (window as any).showSaveFilePicker({
        suggestedName: "curriculum.export.json",
        types: [
          {
            description: "JSON files",
            accept: { "application/json": [".json"] },
          },
        ],
      });

      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();

      toast({
        title: "Export successful",
        description: "Curriculum export has been saved to file.",
      });
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        toast({
          title: "Error exporting file",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      }
    }
  }, [nodes, edges, toast]);

  const handleOpenFile = useCallback(async () => {
    try {
      if (!("showOpenFilePicker" in window)) {
        toast({
          title: "File picker not supported",
          description:
            "Your browser doesn't support the File System Access API.",
          variant: "destructive",
        });
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fileHandles = await (window as any).showOpenFilePicker({
        types: [
          {
            description: "JSON files",
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
        title: "Quest loaded",
        description: "Quest data has been loaded from file.",
      });
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        toast({
          title: "Error loading file",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      }
    }
  }, [toast, updateQuestData]);

  const handleImport = useCallback(async () => {
    try {
      if (!("showOpenFilePicker" in window)) {
        toast({
          title: "File picker not supported",
          description:
            "Your browser doesn't support the File System Access API.",
          variant: "destructive",
        });
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fileHandles = await (window as any).showOpenFilePicker({
        types: [
          {
            description: "JSON files",
            accept: { "application/json": [".json"] },
          },
        ],
        multiple: false,
      });

      if (!fileHandles || fileHandles.length === 0) return;

      const file = await fileHandles[0].getFile();
      const text = await file.text();
      const exportData: CurriculumExport = JSON.parse(text);

      // Validate structure
      if (
        !exportData.tracks ||
        !exportData.lessons ||
        !exportData.skills ||
        !Array.isArray(exportData.tracks) ||
        !Array.isArray(exportData.lessons) ||
        !Array.isArray(exportData.skills)
      ) {
        throw new Error("Invalid curriculum export format");
      }

      // Import the curriculum
      const result = importCurriculumToGraph(exportData);

      // Show warnings if any
      if (result.warnings.length > 0) {
        const warningMessages = result.warnings
          .map((w) => w.message)
          .join("\n");
        toast({
          title: "Import completed with warnings",
          description: warningMessages,
          variant: "default",
        });
      }

      updateQuestData(result.data.nodes, result.data.edges);

      toast({
        title: "Curriculum imported",
        description: `Imported ${exportData.tracks.length} tracks, ${exportData.lessons.length} lessons, and ${exportData.skills.length} skills.`,
      });
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        toast({
          title: "Error importing curriculum",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      }
    }
  }, [toast, updateQuestData]);

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
        title: "Title required",
        description: "Please enter a title for the quest graph",
        variant: "destructive",
      });
      return;
    }
    const graph = await saveQuestGraph(saveDialogTitle.trim(), { nodes, edges });
    if (graph) {
      markAsSaved();
      setShowSaveDialog(false);
    }
  }, [saveDialogTitle, nodes, edges, saveQuestGraph, markAsSaved, toast]);

  // Open: Load a graph from database
  const handleLoadGraph = useCallback((graph: QuestGraph) => {
    if (hasUnsavedChanges) {
      setPendingLoadGraph(graph);
      setShowNewConfirmDialog(true);
    } else {
      loadQuestGraph(graph);
      updateQuestData(graph.data.nodes, graph.data.edges);
      lastSavedDataRef.current = JSON.stringify(graph.data);
      setHasUnsavedChanges(false);
    }
  }, [hasUnsavedChanges, loadQuestGraph, updateQuestData]);

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

  const handleEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      // Filter out deleted edges from current edges
      const deletedEdgeIds = new Set(deletedEdges.map((e) => e.id));
      const remainingEdges = edges.filter((e) => !deletedEdgeIds.has(e.id));
      updateQuestData(nodes, remainingEdges);
    },
    [edges, nodes, updateQuestData]
  );

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none w-screen h-screen m-0 p-0 gap-0 rounded-none translate-x-0 translate-y-0 left-0 top-0 [&>button]:hidden">
        <DialogHeader className="p-3 border-b h-16">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DialogTitle>Quest Editor</DialogTitle>
              {currentGraph && (
                <span className="text-sm text-muted-foreground">
                  — {currentGraph.title}
                  {hasUnsavedChanges && " (unsaved)"}
                </span>
              )}
              {!currentGraph && hasUnsavedChanges && (
                <span className="text-sm text-muted-foreground">(unsaved)</span>
              )}
            </div>
            <div className="flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Plus className="h-4 w-4" />
                    Add
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Add Node</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => addNode("track")}>
                    Track
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => addNode("lesson")}>
                    Lesson
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => addNode("skill")}>
                    Skill
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Menu className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-48">
                  <DropdownMenuItem onClick={handleNew}>
                    <FilePlus className="h-4 w-4" />
                    New
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleSave} disabled={isDbLoading}>
                    <Save className="h-4 w-4" />
                    Save
                    {hasUnsavedChanges && <span className="ml-auto text-xs text-muted-foreground">•</span>}
                  </DropdownMenuItem>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <FolderOpen className="h-4 w-4" />
                      Open
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-56">
                      {questGraphs.length === 0 ? (
                        <DropdownMenuItem disabled>
                          No saved graphs
                        </DropdownMenuItem>
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
                    onClick={handleDelete}
                    disabled={!currentGraph || isDbLoading}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <FileJson className="h-4 w-4" />
                      Graph Export
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem onClick={handleDownload}>
                        <Download className="h-4 w-4" />
                        Save as JSON
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleOpenFile}>
                        <Upload className="h-4 w-4" />
                        Import JSON
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <FileOutput className="h-4 w-4" />
                      Export Schema
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem onClick={handleExport}>
                        <Download className="h-4 w-4" />
                        Export Schema
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleImport}>
                        <Upload className="h-4 w-4" />
                        Import Schema
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div
          className="flex-1 relative"
          style={{ height: "calc(100vh - 64px)" }}
        >
          <style>{questControlsStyles}</style>
          <ReactFlowProvider>
            <QuestEditorFlow
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
                Edit{" "}
                {editingNodeId &&
                  nodes.find((n) => n.id === editingNodeId)?.data.type}
              </SheetTitle>
              <SheetDescription>Node ID: {editingNodeId}</SheetDescription>
            </SheetHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
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
                      <Label htmlFor="trackKey">Track Key</Label>
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
                              editingNodeId
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
                              editingNodeId
                            ))
                            ? "border-destructive focus-visible:ring-destructive"
                            : ""
                        }
                        placeholder="e.g., beginner-piano"
                      />
                      {editingTrackKey &&
                        (editingTrackKey.trim() === "" ||
                          editingTrackKey.includes(" ") ||
                          isTrackKeyInUse(
                            editingTrackKey.trim(),
                            editingNodeId
                          )) && (
                          <p className="text-sm text-destructive">
                            {editingTrackKey.trim() === ""
                              ? "Track key cannot be empty"
                              : editingTrackKey.includes(" ")
                              ? "Track key cannot contain spaces"
                              : "This track key is already in use"}
                          </p>
                        )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="order">Order</Label>
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
                              editingNodeId
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
                              editingNodeId
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
                            editingNodeId
                          )) && (
                          <p className="text-sm text-destructive">
                            {isOrderInUse(
                              parseInt(editingOrder, 10),
                              editingNodeId
                            )
                              ? "This order number is already in use"
                              : "Order must be a positive integer greater than 0"}
                          </p>
                        )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
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
                      <Label htmlFor="skillKey">Skill Key</Label>
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
                              editingNodeId
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
                              editingNodeId
                            ))
                            ? "border-destructive focus-visible:ring-destructive"
                            : ""
                        }
                        placeholder="e.g., piano_basics"
                      />
                      {editingSkillKey &&
                        (editingSkillKey.trim() === "" ||
                          editingSkillKey.includes(" ") ||
                          isSkillKeyInUse(
                            editingSkillKey.trim(),
                            editingNodeId
                          )) && (
                          <p className="text-sm text-destructive">
                            {editingSkillKey.trim() === ""
                              ? "Skill key cannot be empty"
                              : editingSkillKey.includes(" ")
                              ? "Skill key cannot contain spaces"
                              : "This skill key is already in use"}
                          </p>
                        )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        value={editingDescription}
                        onChange={(e) => setEditingDescription(e.target.value)}
                        rows={4}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="unlockGuidance">Unlock Guidance</Label>
                      <Textarea
                        id="unlockGuidance"
                        value={editingUnlockGuidance}
                        onChange={(e) =>
                          setEditingUnlockGuidance(e.target.value)
                        }
                        rows={4}
                      />
                    </div>
                  </>
                )}
              {editingNodeId &&
                nodes.find((n) => n.id === editingNodeId)?.data.type ===
                  "lesson" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="lessonKey">Lesson Key</Label>
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
                              editingNodeId
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
                              editingNodeId
                            ))
                            ? "border-destructive focus-visible:ring-destructive"
                            : ""
                        }
                        placeholder="e.g., A1.1"
                      />
                      {editingLessonKey &&
                        (editingLessonKey.trim() === "" ||
                          editingLessonKey.includes(" ") ||
                          isLessonKeyInUse(
                            editingLessonKey.trim(),
                            editingNodeId
                          )) && (
                          <p className="text-sm text-destructive">
                            {editingLessonKey.trim() === ""
                              ? "Lesson key cannot be empty"
                              : editingLessonKey.includes(" ")
                              ? "Lesson key cannot contain spaces"
                              : "This lesson key is already in use"}
                          </p>
                        )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="goal">Goal</Label>
                      <Input
                        id="goal"
                        type="text"
                        value={editingGoal}
                        onChange={(e) => setEditingGoal(e.target.value)}
                        placeholder="e.g., Lock steady quarter notes to the metronome"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="setupGuidance">Setup Guidance</Label>
                      <Textarea
                        id="setupGuidance"
                        value={editingSetupGuidance}
                        onChange={(e) =>
                          setEditingSetupGuidance(e.target.value)
                        }
                        rows={4}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="evaluationGuidance">
                        Evaluation Guidance
                      </Label>
                      <Textarea
                        id="evaluationGuidance"
                        value={editingEvaluationGuidance}
                        onChange={(e) =>
                          setEditingEvaluationGuidance(e.target.value)
                        }
                        rows={4}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="difficultyGuidance">
                        Difficulty Guidance
                      </Label>
                      <Textarea
                        id="difficultyGuidance"
                        value={editingDifficultyGuidance}
                        onChange={(e) =>
                          setEditingDifficultyGuidance(e.target.value)
                        }
                        rows={4}
                      />
                    </div>
                  </>
                )}
            </div>
            <SheetFooter>
              <Button variant="outline" onClick={handleCancelEdit}>
                Cancel
              </Button>
              <Button onClick={handleSaveTitle}>Save</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </DialogContent>
    </Dialog>

    {/* Save Dialog */}
    <AlertDialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Save Quest Graph</AlertDialogTitle>
          <AlertDialogDescription>
            Enter a title for your quest graph.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-4">
          <Input
            placeholder="Quest graph title"
            value={saveDialogTitle}
            onChange={(e) => setSaveDialogTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmSave();
            }}
            autoFocus
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={confirmSave}>Save</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Unsaved Changes Confirm Dialog */}
    <AlertDialog open={showNewConfirmDialog} onOpenChange={setShowNewConfirmDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes. Do you want to discard them?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setPendingLoadGraph(null)}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={confirmLoadPending}>Discard Changes</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Delete Confirm Dialog */}
    <AlertDialog open={showDeleteConfirmDialog} onOpenChange={setShowDeleteConfirmDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Quest Graph</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete "{currentGraph?.title}"? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
