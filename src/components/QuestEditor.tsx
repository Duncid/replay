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
import { useToast } from "@/hooks/use-toast";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import {
  QuestData,
  QuestEdge,
  QuestEdgeType,
  QuestNode,
  QuestNodeType,
} from "@/types/quest";
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
import { Download, Edit2, Menu, Plus, Upload, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

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
    opacity: 0.9;
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
    <div
      className={`relative px-4 py-3 rounded-lg border-2 bg-pink-950 min-w-[200px] ${
        selected ? "border-pink-500" : "border-pink-300"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase opacity-60">Track</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => onEdit(id)}
        >
          <Edit2 className="h-3 w-3" />
        </Button>
      </div>
      <div className="font-semibold text-sm">
        {data.title || "Untitled Track"}
      </div>
      <div className="text-xs text-muted-foreground mt-2">Out: 1 max</div>
      <Handle type="source" position={Position.Right} id="track-out" />
      <span className="absolute right-[-35px] top-1/2 -translate-y-1/2 text-xs text-sky-600 pointer-events-none whitespace-nowrap">
        Out
      </span>
    </div>
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
    <div
      className={`relative px-4 py-3 rounded-lg border-2 bg-sky-950 min-w-[200px] ${
        selected ? "border-sky-500" : "border-sky-300"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase opacity-60">Lesson</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => onEdit(id)}
        >
          <Edit2 className="h-3 w-3" />
        </Button>
      </div>
      <div className="font-semibold text-sm">
        {data.title || "Untitled Lesson"}
      </div>
      <div className="text-xs text-muted-foreground mt-2">
        In: 1 max | Out: 1 max
      </div>
      <Handle type="target" position={Position.Left} id="lesson-in" />
      <Handle type="source" position={Position.Right} id="lesson-out" />
      <Handle type="source" position={Position.Bottom} id="lesson-unlockable" />
      <Handle type="source" position={Position.Top} id="lesson-required" />
      <span className="absolute left-[-30px] top-1/2 -translate-y-1/2 text-xs text-sky-600 pointer-events-none whitespace-nowrap">
        In
      </span>
      <span className="absolute right-[-30px] top-1/2 -translate-y-1/2 text-xs text-sky-600 pointer-events-none whitespace-nowrap">
        Out
      </span>
      <span className="absolute bottom-[-20px] left-1/2 -translate-x-1/2 text-xs text-emerald-600 pointer-events-none whitespace-nowrap">
        Unlockable
      </span>
      <span className="absolute top-[-20px] left-1/2 -translate-x-1/2 text-xs text-emerald-600 pointer-events-none whitespace-nowrap">
        Required
      </span>
    </div>
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
    <div
      className={`relative px-4 py-3 rounded-lg border-2 bg-emerald-950 min-w-[200px] ${
        selected ? "border-emerald-500" : "border-emerald-300"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase opacity-60">Skill</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => onEdit(id)}
        >
          <Edit2 className="h-3 w-3" />
        </Button>
      </div>
      <div className="font-semibold text-sm">
        {data.title || "Untitled Skill"}
      </div>
      <div className="text-xs text-muted-foreground mt-2">
        In: Multiple required, 1 unlockable
      </div>
      <Handle type="target" position={Position.Top} id="skill-unlockable" />
      <Handle type="target" position={Position.Bottom} id="skill-required" />
      <span className="absolute top-[-20px] left-1/2 -translate-x-1/2 text-xs text-sky-600 pointer-events-none whitespace-nowrap">
        Unlockable
      </span>
      <span className="absolute bottom-[-20px] left-1/2 -translate-x-1/2 text-xs text-sky-600 pointer-events-none whitespace-nowrap">
        Required
      </span>
    </div>
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

  const markerId = `arrowhead-${strokeColor.replace("#", "")}`;

  return (
    <>
      <defs>
        <marker
          id={markerId}
          markerWidth="10"
          markerHeight="10"
          refX="9"
          refY="3"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <polygon points="0 0, 10 3, 0 6" fill={strokeColor} />
        </marker>
      </defs>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: strokeColor,
          strokeWidth: 2,
          strokeDasharray: "0", // Plain (not dashed) for all edges
          opacity: 0.6,
        }}
        markerEnd={`url(#${markerId})`}
      />
    </>
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
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

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
      }
    },
    [nodes]
  );

  const handleSaveTitle = useCallback(() => {
    if (!editingNodeId) return;

    const updatedNodes = nodes.map((node) => {
      if (node.id === editingNodeId) {
        return {
          ...node,
          data: {
            ...node.data,
            title: editingTitle,
          },
        };
      }
      return node;
    });

    updateQuestData(updatedNodes, edges);
    setEditingNodeId(null);
    setEditingTitle("");
  }, [editingNodeId, editingTitle, nodes, edges, updateQuestData]);

  const handleCancelEdit = useCallback(() => {
    setEditingNodeId(null);
    setEditingTitle("");
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
        // For unlockable, check if skill already has one
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
              reason: "Skill can only receive one unlockable connection",
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
      if (
        sourceHandle === "lesson-required" &&
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

      // Lesson → Skill (unlockable)
      if (
        sourceNode.data.type === "lesson" &&
        targetNode.data.type === "skill"
      ) {
        if (
          sourceHandle === "lesson-unlockable" &&
          targetHandle === "skill-unlockable"
        ) {
          return { valid: true };
        }
        if (
          sourceHandle === "lesson-required" &&
          targetHandle === "skill-required"
        ) {
          return { valid: true };
        }
        return {
          valid: false,
          reason:
            "Lesson must connect to Skill using matching handles (unlockable or required)",
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
        },
      };

      const newNodes = [...nodes, newNode];
      updateQuestData(newNodes, edges);
    },
    [nodes, edges, updateQuestData]
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

  const handleOpen = useCallback(async () => {
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none w-screen h-screen m-0 p-0 rounded-none translate-x-0 translate-y-0 left-0 top-0 [&>button]:hidden">
        <DialogHeader className="p-3 border-b h-16">
          <div className="flex items-center justify-between">
            <DialogTitle>Quest Editor</DialogTitle>
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
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={handleDownload}>
                    <Download className="h-4 w-4" />
                    Download JSON
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleOpen}>
                    <Upload className="h-4 w-4" />
                    Open JSON
                  </DropdownMenuItem>
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
          style={{ height: "calc(100vh - 120px)" }}
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
  );
}
