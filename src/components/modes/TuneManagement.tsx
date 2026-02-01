import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { TabsContent } from "@/components/ui/tabs";
import { getNoteColorForNoteName } from "@/constants/noteColors";
import { useToast } from "@/hooks/use-toast";
import { usePublishedTuneKeys, useTuneAssets } from "@/hooks/useTuneQueries";
import { supabase } from "@/integrations/supabase/client";
import type { NoteSequence } from "@/types/noteSequence";
import type {
  TuneAssembly,
  TuneBriefing,
  TuneNugget,
} from "@/types/tuneAssets";
import { midiToNoteName, noteNameToMidi } from "@/utils/noteSequenceUtils";
import {
  bundleSingleTuneAssets,
  getAssemblyDspXml,
  getAssemblyLh,
  getAssemblyNs,
  getAssemblyRh,
  getAssemblyXml,
  getLocalAssemblyIds,
  getLocalNuggetIds,
  getLocalTuneKeys,
  getNuggetDspXml,
  getNuggetLh,
  getNuggetNs,
  getNuggetRh,
  getNuggetXml,
  getTeacher,
  getTuneDspXml,
  getTuneLh,
  getTuneLhXml,
  getTuneNs,
  getTuneRh,
  getTuneRhXml,
  getTuneXml,
} from "@/utils/tuneAssetBundler";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  Pause,
  Pencil,
  Play,
  Trash2,
  Upload,
} from "lucide-react";
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  OpenSheetMusicDisplayView,
  type OpenSheetMusicDisplayViewHandle,
} from "../OpenSheetMusicDisplayView";

interface TuneManagementProps {
  onPlaySequence?: (sequence: NoteSequence) => void;
  onStopPlayback?: () => void;
  isPlaying?: boolean;
  onRegisterNoteHandler?: (handler: ((noteKey: string) => void) | null) => void;
}

const EMPTY_SEQUENCE: NoteSequence = { notes: [], totalTime: 0 };

type TuneSource = "published" | "local";
type TargetType = "full" | "nuggets" | "assemblies";
type HandType = "full" | "left" | "right";

type TuneManagementContextValue = {
  selectedSource: TuneSource;
  setSelectedSource: React.Dispatch<React.SetStateAction<TuneSource>>;
  selectedTune: string;
  setSelectedTune: React.Dispatch<React.SetStateAction<string>>;
  selectedTarget: TargetType;
  setSelectedTarget: React.Dispatch<React.SetStateAction<TargetType>>;
  selectedItemId: string;
  setSelectedItemId: React.Dispatch<React.SetStateAction<string>>;
  selectedHand: HandType;
  setSelectedHand: React.Dispatch<React.SetStateAction<HandType>>;
  showPublishDialog: boolean;
  setShowPublishDialog: React.Dispatch<React.SetStateAction<boolean>>;
  publishMode: "create" | string;
  setPublishMode: React.Dispatch<React.SetStateAction<"create" | string>>;
  newTuneTitle: string;
  setNewTuneTitle: React.Dispatch<React.SetStateAction<string>>;
  isPublishing: boolean;
  publishedFilter: string;
  setPublishedFilter: React.Dispatch<React.SetStateAction<string>>;
  unpublishedFilter: string;
  setUnpublishedFilter: React.Dispatch<React.SetStateAction<string>>;
  showRenameDialog: boolean;
  setShowRenameDialog: React.Dispatch<React.SetStateAction<boolean>>;
  renameTarget: string;
  newName: string;
  setNewName: React.Dispatch<React.SetStateAction<string>>;
  isRenaming: boolean;
  showDeleteDialog: boolean;
  setShowDeleteDialog: React.Dispatch<React.SetStateAction<boolean>>;
  deleteTarget: string;
  isDeleting: boolean;
  isLoadingList: boolean;
  publishedTuneKeys: Set<string>;
  unpublishedTuneKeys: string[];
  filteredPublishedKeys: string[];
  filteredUnpublishedKeys: string[];
  tuneTitleMap: Map<string, string>;
  getTuneTitle: (tuneKey: string, source: TuneSource) => string;
  tuneAssets: ReturnType<typeof useTuneAssets>["data"];
  isLoadingAssets: boolean;
  labSequence: NoteSequence;
  nuggetIds: string[];
  assemblyIds: string[];
  xmlFull: string | null;
  xmlDsp: string | null;
  selectionLabel: string;
  targetLabel: string;
  selectTune: (source: TuneSource, tune: string) => void;
  openRenameDialog: (tuneKey: string) => void;
  handleRename: () => Promise<void>;
  openDeleteDialog: (tuneKey: string) => void;
  handleDelete: () => Promise<void>;
  handlePublish: () => Promise<void>;
  getHandAvailability: (
    target: TargetType,
    itemId: string,
  ) => { left: boolean; right: boolean };
};

const TuneManagementContext = createContext<TuneManagementContextValue | null>(
  null,
);

function useTuneManagementContext() {
  const context = useContext(TuneManagementContext);
  if (!context) {
    throw new Error(
      "TuneManagementContext is missing. Wrap with TuneManagementProvider.",
    );
  }
  return context;
}

function useTuneManagementState(): TuneManagementContextValue {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Selection state
  const [selectedSource, setSelectedSource] = useState<TuneSource>("published");
  const [selectedTune, setSelectedTune] = useState<string>("");
  const [selectedTarget, setSelectedTarget] =
    useState<TargetType>("assemblies");
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [selectedHand, setSelectedHand] = useState<HandType>("full");

  // Publish dialog state
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [publishMode, setPublishMode] = useState<"create" | string>("create");
  const [newTuneTitle, setNewTuneTitle] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);

  // Filter state for tune lists
  const [publishedFilter, setPublishedFilter] = useState("");
  const [unpublishedFilter, setUnpublishedFilter] = useState("");

  // Rename dialog state
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameTarget, setRenameTarget] = useState("");
  const [newName, setNewName] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);

  // Delete dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch published tune keys from database
  const { data: tuneList, isLoading: isLoadingList } = usePublishedTuneKeys();
  const publishedTuneKeys = useMemo(
    () => new Set(tuneList?.map((t) => t.tune_key) ?? []),
    [tuneList],
  );

  // Create a lookup map for tune_key → display title
  const tuneTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    tuneList?.forEach((t) => {
      map.set(t.tune_key, t.briefing?.title || t.tune_key);
    });
    return map;
  }, [tuneList]);

  // Helper to get display title for a tune key
  const getTuneTitle = useCallback(
    (tuneKey: string, source: TuneSource) => {
      if (source === "published") {
        return tuneTitleMap.get(tuneKey) || tuneKey;
      }
      // For local tunes, try to get title from teacher.json
      const teacher = getTeacher(tuneKey);
      return (teacher as { title?: string })?.title || tuneKey;
    },
    [tuneTitleMap],
  );

  // Get local tune keys from file system
  const localTuneKeys = useMemo(() => getLocalTuneKeys(), []);
  const unpublishedTuneKeys = useMemo(() => localTuneKeys, [localTuneKeys]);

  // Filtered tune lists for search (search by key or title)
  const filteredPublishedKeys = useMemo(() => {
    const keys = Array.from(publishedTuneKeys);
    if (!publishedFilter.trim()) return keys;
    const lower = publishedFilter.toLowerCase();
    return keys.filter((key) => {
      const title = tuneTitleMap.get(key) || key;
      return key.toLowerCase().includes(lower) || title.toLowerCase().includes(lower);
    });
  }, [publishedTuneKeys, publishedFilter, tuneTitleMap]);

  const filteredUnpublishedKeys = useMemo(() => {
    if (!unpublishedFilter.trim()) return unpublishedTuneKeys;
    const lower = unpublishedFilter.toLowerCase();
    return unpublishedTuneKeys.filter((key) => {
      const teacher = getTeacher(key);
      const title = (teacher as { title?: string })?.title || key;
      return key.toLowerCase().includes(lower) || title.toLowerCase().includes(lower);
    });
  }, [unpublishedTuneKeys, unpublishedFilter]);

  // Auto-select first tune when list loads
  useEffect(() => {
    if (!selectedTune) {
      if (publishedTuneKeys.size > 0) {
        const firstPublished = Array.from(publishedTuneKeys)[0];
        setSelectedTune(firstPublished);
        setSelectedSource("published");
      } else if (unpublishedTuneKeys.length > 0) {
        setSelectedTune(unpublishedTuneKeys[0]);
        setSelectedSource("local");
      }
    }
  }, [publishedTuneKeys, unpublishedTuneKeys, selectedTune]);

  // Fetch tune assets from database (only when published source)
  const { data: tuneAssets, isLoading: isLoadingAssets } = useTuneAssets(
    selectedSource === "published" ? selectedTune : null,
  );

  // Derive nugget/assembly IDs based on source
  const nuggetIds = useMemo(() => {
    if (selectedSource === "published") {
      const briefing = tuneAssets?.briefing as TuneBriefing | null;
      return briefing?.teachingOrder ?? [];
    }
    return getLocalNuggetIds(selectedTune);
  }, [selectedSource, tuneAssets, selectedTune]);

  const assemblyIds = useMemo(() => {
    if (selectedSource === "published") {
      const briefing = tuneAssets?.briefing as TuneBriefing | null;
      return briefing?.assemblyOrder ?? [];
    }
    return getLocalAssemblyIds(selectedTune);
  }, [selectedSource, tuneAssets, selectedTune]);

  // Helper functions for dropdown (for published tunes from list)
  const getNuggetIdsForTune = useCallback(
    (tuneKey: string, source: TuneSource) => {
      if (source === "published") {
        const tuneInfo = tuneList?.find((t) => t.tune_key === tuneKey);
        return tuneInfo?.briefing?.teachingOrder ?? [];
      }
      return getLocalNuggetIds(tuneKey);
    },
    [tuneList],
  );

  const getAssemblyIdsForTune = useCallback(
    (tuneKey: string, source: TuneSource) => {
      if (source === "published") {
        const tuneInfo = tuneList?.find((t) => t.tune_key === tuneKey);
        return tuneInfo?.briefing?.assemblyOrder ?? [];
      }
      return getLocalAssemblyIds(tuneKey);
    },
    [tuneList],
  );

  const getHandAvailability = useCallback(
    (target: TargetType, itemId: string) => {
      if (!selectedTune) {
        return { left: false, right: false };
      }

      if (selectedSource === "published") {
        if (!tuneAssets) return { left: false, right: false };
        if (target === "full") {
          return {
            left: Boolean(tuneAssets.left_hand_sequence),
            right: Boolean(tuneAssets.right_hand_sequence),
          };
        }
        if (target === "assemblies") {
          const assemblies = tuneAssets.assemblies as TuneAssembly[] | null;
          const assembly = assemblies?.find((a) => a.id === itemId);
          return {
            left: Boolean(assembly?.leftHandSequence),
            right: Boolean(assembly?.rightHandSequence),
          };
        }
        const nuggets = tuneAssets.nuggets as TuneNugget[] | null;
        const nugget = nuggets?.find((n) => n.id === itemId);
        return {
          left: Boolean(nugget?.leftHandSequence),
          right: Boolean(nugget?.rightHandSequence),
        };
      }

      if (target === "full") {
        return {
          left: Boolean(getTuneLh(selectedTune)),
          right: Boolean(getTuneRh(selectedTune)),
        };
      }
      if (target === "assemblies") {
        return {
          left: Boolean(getAssemblyLh(selectedTune, itemId)),
          right: Boolean(getAssemblyRh(selectedTune, itemId)),
        };
      }
      return {
        left: Boolean(getNuggetLh(selectedTune, itemId)),
        right: Boolean(getNuggetRh(selectedTune, itemId)),
      };
    },
    [selectedSource, selectedTune, tuneAssets],
  );

  // Reset item selection when tune or target changes
  useEffect(() => {
    if (selectedTarget === "full") {
      if (selectedItemId) setSelectedItemId("");
      return;
    }
    const options = selectedTarget === "assemblies" ? assemblyIds : nuggetIds;
    if (!options.length) {
      if (selectedItemId) setSelectedItemId("");
      return;
    }
    if (!selectedItemId || !options.includes(selectedItemId)) {
      setSelectedItemId(options[0]);
    }
  }, [assemblyIds, nuggetIds, selectedItemId, selectedTarget, selectedTune]);

  useEffect(() => {
    if (selectedHand === "full") return;
    const availability = getHandAvailability(selectedTarget, selectedItemId);
    if (selectedHand === "left" && !availability.left) {
      setSelectedHand("full");
    }
    if (selectedHand === "right" && !availability.right) {
      setSelectedHand("full");
    }
  }, [getHandAvailability, selectedHand, selectedItemId, selectedTarget]);

  // Derive sequences based on source
  const labSequence = useMemo(() => {
    if (selectedSource === "published") {
      if (!tuneAssets) return EMPTY_SEQUENCE;
      if (selectedTarget === "full") {
        if (selectedHand === "left") {
          return (
            (tuneAssets.left_hand_sequence as NoteSequence) ?? EMPTY_SEQUENCE
          );
        }
        if (selectedHand === "right") {
          return (
            (tuneAssets.right_hand_sequence as NoteSequence) ?? EMPTY_SEQUENCE
          );
        }
        return (tuneAssets.note_sequence as NoteSequence) ?? EMPTY_SEQUENCE;
      }
      if (selectedTarget === "assemblies") {
        const assemblies = tuneAssets.assemblies as TuneAssembly[] | null;
        const assembly = assemblies?.find((a) => a.id === selectedItemId);
        if (selectedHand === "left") {
          return (assembly?.leftHandSequence as NoteSequence) ?? EMPTY_SEQUENCE;
        }
        if (selectedHand === "right") {
          return (
            (assembly?.rightHandSequence as NoteSequence) ?? EMPTY_SEQUENCE
          );
        }
        return (assembly?.noteSequence as NoteSequence) ?? EMPTY_SEQUENCE;
      }
      const nuggets = tuneAssets.nuggets as TuneNugget[] | null;
      const nugget = nuggets?.find((n) => n.id === selectedItemId);
      if (selectedHand === "left") {
        return (nugget?.leftHandSequence as NoteSequence) ?? EMPTY_SEQUENCE;
      }
      if (selectedHand === "right") {
        return (nugget?.rightHandSequence as NoteSequence) ?? EMPTY_SEQUENCE;
      }
      return (nugget?.noteSequence as NoteSequence) ?? EMPTY_SEQUENCE;
    }

    // Local source
    if (!selectedTune) return EMPTY_SEQUENCE;
    if (selectedTarget === "full") {
      if (selectedHand === "left") {
        return (getTuneLh(selectedTune) as NoteSequence) ?? EMPTY_SEQUENCE;
      }
      if (selectedHand === "right") {
        return (getTuneRh(selectedTune) as NoteSequence) ?? EMPTY_SEQUENCE;
      }
      return (getTuneNs(selectedTune) as NoteSequence) ?? EMPTY_SEQUENCE;
    }
    if (selectedTarget === "assemblies") {
      if (selectedHand === "left") {
        return (
          (getAssemblyLh(selectedTune, selectedItemId) as NoteSequence) ??
          EMPTY_SEQUENCE
        );
      }
      if (selectedHand === "right") {
        return (
          (getAssemblyRh(selectedTune, selectedItemId) as NoteSequence) ??
          EMPTY_SEQUENCE
        );
      }
      return (
        (getAssemblyNs(selectedTune, selectedItemId) as NoteSequence) ??
        EMPTY_SEQUENCE
      );
    }
    if (selectedHand === "left") {
      return (
        (getNuggetLh(selectedTune, selectedItemId) as NoteSequence) ??
        EMPTY_SEQUENCE
      );
    }
    if (selectedHand === "right") {
      return (
        (getNuggetRh(selectedTune, selectedItemId) as NoteSequence) ??
        EMPTY_SEQUENCE
      );
    }
    return (
      (getNuggetNs(selectedTune, selectedItemId) as NoteSequence) ??
      EMPTY_SEQUENCE
    );
  }, [
    selectedSource,
    tuneAssets,
    selectedTarget,
    selectedHand,
    selectedItemId,
    selectedTune,
  ]);

  // Derive full XMLs based on source
  const xmlFull = useMemo(() => {
    if (selectedSource === "published") {
      if (!tuneAssets) return null;
      if (selectedTarget === "full") return tuneAssets.tune_xml;
      if (selectedTarget === "assemblies") {
        const xmls = tuneAssets.assembly_xmls as Record<string, string> | null;
        if (selectedHand === "left") {
          return (
            xmls?.[`${selectedItemId}.lh`] ?? xmls?.[selectedItemId] ?? null
          );
        }
        if (selectedHand === "right") {
          return (
            xmls?.[`${selectedItemId}.rh`] ?? xmls?.[selectedItemId] ?? null
          );
        }
        return xmls?.[selectedItemId] ?? null;
      }
      const xmls = tuneAssets.nugget_xmls as Record<string, string> | null;
      if (selectedHand === "left") {
        return xmls?.[`${selectedItemId}.lh`] ?? xmls?.[selectedItemId] ?? null;
      }
      if (selectedHand === "right") {
        return xmls?.[`${selectedItemId}.rh`] ?? xmls?.[selectedItemId] ?? null;
      }
      return xmls?.[selectedItemId] ?? null;
    }

    // Local source
    if (!selectedTune) return null;
    if (selectedTarget === "full") {
      if (selectedHand === "left") {
        return getTuneLhXml(selectedTune) ?? getTuneXml(selectedTune);
      }
      if (selectedHand === "right") {
        return getTuneRhXml(selectedTune) ?? getTuneXml(selectedTune);
      }
      return getTuneXml(selectedTune);
    }
    if (selectedTarget === "assemblies") {
      if (selectedHand === "left") {
        return (
          getAssemblyXml(selectedTune, `${selectedItemId}.lh`) ??
          getAssemblyXml(selectedTune, selectedItemId)
        );
      }
      if (selectedHand === "right") {
        return (
          getAssemblyXml(selectedTune, `${selectedItemId}.rh`) ??
          getAssemblyXml(selectedTune, selectedItemId)
        );
      }
      return getAssemblyXml(selectedTune, selectedItemId);
    }
    if (selectedHand === "left") {
      return (
        getNuggetXml(selectedTune, `${selectedItemId}.lh`) ??
        getNuggetXml(selectedTune, selectedItemId)
      );
    }
    if (selectedHand === "right") {
      return (
        getNuggetXml(selectedTune, `${selectedItemId}.rh`) ??
        getNuggetXml(selectedTune, selectedItemId)
      );
    }
    return getNuggetXml(selectedTune, selectedItemId);
  }, [
    selectedSource,
    tuneAssets,
    selectedTarget,
    selectedHand,
    selectedItemId,
    selectedTune,
  ]);

  // Derive DSP XMLs based on source
  const xmlDsp = useMemo(() => {
    if (selectedSource === "published") {
      if (!tuneAssets) return null;
      if (selectedTarget === "full") {
        if (selectedHand === "left" || selectedHand === "right") {
          return tuneAssets.tune_dsp_xml ?? tuneAssets.tune_xml ?? null;
        }
        return tuneAssets.tune_dsp_xml ?? tuneAssets.tune_xml ?? null;
      }
      if (selectedTarget === "assemblies") {
        const xmls = tuneAssets.assembly_dsp_xmls as Record<
          string,
          string
        > | null;
        if (selectedHand === "left") {
          return (
            xmls?.[`${selectedItemId}.lh`] ?? xmls?.[selectedItemId] ?? null
          );
        }
        if (selectedHand === "right") {
          return (
            xmls?.[`${selectedItemId}.rh`] ?? xmls?.[selectedItemId] ?? null
          );
        }
        return xmls?.[selectedItemId] ?? null;
      }
      const xmls = tuneAssets.nugget_dsp_xmls as Record<string, string> | null;
      if (selectedHand === "left") {
        return xmls?.[`${selectedItemId}.lh`] ?? xmls?.[selectedItemId] ?? null;
      }
      if (selectedHand === "right") {
        return xmls?.[`${selectedItemId}.rh`] ?? xmls?.[selectedItemId] ?? null;
      }
      return xmls?.[selectedItemId] ?? null;
    }

    // Local source
    if (!selectedTune) return null;
    if (selectedTarget === "full") {
      if (selectedHand === "left") {
        return (
          getTuneDspXml(selectedTune) ??
          getTuneLhXml(selectedTune) ??
          getTuneXml(selectedTune)
        );
      }
      if (selectedHand === "right") {
        return (
          getTuneDspXml(selectedTune) ??
          getTuneRhXml(selectedTune) ??
          getTuneXml(selectedTune)
        );
      }
      return getTuneDspXml(selectedTune) ?? getTuneXml(selectedTune);
    }
    if (selectedTarget === "assemblies") {
      if (selectedHand === "left") {
        return (
          getAssemblyDspXml(selectedTune, `${selectedItemId}.lh`) ??
          getAssemblyDspXml(selectedTune, selectedItemId)
        );
      }
      if (selectedHand === "right") {
        return (
          getAssemblyDspXml(selectedTune, `${selectedItemId}.rh`) ??
          getAssemblyDspXml(selectedTune, selectedItemId)
        );
      }
      return getAssemblyDspXml(selectedTune, selectedItemId);
    }
    if (selectedHand === "left") {
      return (
        getNuggetDspXml(selectedTune, `${selectedItemId}.lh`) ??
        getNuggetDspXml(selectedTune, selectedItemId)
      );
    }
    if (selectedHand === "right") {
      return (
        getNuggetDspXml(selectedTune, `${selectedItemId}.rh`) ??
        getNuggetDspXml(selectedTune, selectedItemId)
      );
    }
    return getNuggetDspXml(selectedTune, selectedItemId);
  }, [
    selectedSource,
    tuneAssets,
    selectedTarget,
    selectedHand,
    selectedItemId,
    selectedTune,
  ]);

  const selectionLabel = useMemo(() => {
    if (!selectedTune) return "Select tune...";
    return getTuneTitle(selectedTune, selectedSource);
  }, [selectedTune, selectedSource, getTuneTitle]);

  const targetLabel = useMemo(() => {
    if (!selectedItemId && selectedTarget !== "full") {
      return selectedTarget.charAt(0).toUpperCase() + selectedTarget.slice(1);
    }
    const baseLabel = selectedTarget === "full" ? "Full" : selectedItemId;
    const handSuffix =
      selectedHand === "full"
        ? ""
        : selectedHand === "left"
        ? ", Left hand"
        : ", Right hand";
    return `${baseLabel}${handSuffix}`;
  }, [selectedHand, selectedItemId, selectedTarget]);

  // Selection handler
  const selectTune = useCallback((source: TuneSource, tune: string) => {
    setSelectedSource(source);
    setSelectedTune(tune);
    // Reset target to 'full' when changing tunes
    setSelectedTarget("full");
    setSelectedItemId("");
    setSelectedHand("full");
  }, []);

  // Rename handler
  const openRenameDialog = useCallback((tuneKey: string) => {
    setRenameTarget(tuneKey);
    setNewName(tuneKey);
    setShowRenameDialog(true);
  }, []);

  const handleRename = useCallback(async () => {
    if (!renameTarget || !newName.trim()) return;
    setIsRenaming(true);
    try {
      const { data, error } = await supabase.functions.invoke("tune-manage", {
        body: {
          action: "rename",
          tuneKey: renameTarget,
          newTitle: newName.trim(),
        },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Rename failed");
      toast({
        title: "Renamed",
        description: `Tune renamed to "${newName.trim()}"`,
      });
      setShowRenameDialog(false);
      queryClient.invalidateQueries({ queryKey: ["published-tune-keys"] });
      queryClient.invalidateQueries({ queryKey: ["tune-assets"] });
    } catch (err) {
      console.error("[TuneManagement] Rename failed:", err);
      toast({
        title: "Rename failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsRenaming(false);
    }
  }, [renameTarget, newName, toast, queryClient]);

  // Delete handler
  const openDeleteDialog = useCallback((tuneKey: string) => {
    setDeleteTarget(tuneKey);
    setShowDeleteDialog(true);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("tune-manage", {
        body: {
          action: "delete",
          tuneKey: deleteTarget,
        },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Delete failed");
      toast({
        title: "Deleted",
        description: `Tune "${deleteTarget}" deleted.`,
      });
      setShowDeleteDialog(false);
      if (selectedTune === deleteTarget) {
        setSelectedTune("");
      }
      queryClient.invalidateQueries({ queryKey: ["published-tune-keys"] });
    } catch (err) {
      console.error("[TuneManagement] Delete failed:", err);
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, selectedTune, toast, queryClient]);

  // Publish handler
  const handlePublish = useCallback(async () => {
    if (!selectedTune || selectedSource !== "local") return;

    setIsPublishing(true);
    try {
      const tuneAssets = bundleSingleTuneAssets(selectedTune);
      if (!tuneAssets) {
        throw new Error("Failed to bundle tune assets");
      }

      const finalTuneKey =
        publishMode === "create" ? selectedTune : publishMode;

      const { data, error } = await supabase.functions.invoke("tune-publish", {
        body: {
          tuneKey: selectedTune,
          title:
            publishMode === "create" ? newTuneTitle || selectedTune : undefined,
          tuneAssets,
          mode: publishMode === "create" ? "create" : "update",
          existingTuneKey: publishMode !== "create" ? publishMode : undefined,
        },
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Published successfully",
          description: `Tune "${finalTuneKey}" published.`,
        });
        setShowPublishDialog(false);
        setNewTuneTitle("");
        setPublishMode("create");

        // Invalidate queries to refresh published list
        queryClient.invalidateQueries({ queryKey: ["published-tune-keys"] });
        queryClient.invalidateQueries({ queryKey: ["tune-assets"] });

        // Switch to viewing the published tune
        setSelectedSource("published");
        setSelectedTune(finalTuneKey);
      } else {
        throw new Error(data.error || "Unknown error");
      }
    } catch (error) {
      console.error("[TuneManagement] Publish failed:", error);
      toast({
        title: "Publish failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsPublishing(false);
    }
  }, [
    selectedTune,
    selectedSource,
    publishMode,
    newTuneTitle,
    toast,
    queryClient,
  ]);

  return {
    selectedSource,
    setSelectedSource,
    selectedTune,
    setSelectedTune,
    selectedTarget,
    setSelectedTarget,
    selectedItemId,
    setSelectedItemId,
    selectedHand,
    setSelectedHand,
    showPublishDialog,
    setShowPublishDialog,
    publishMode,
    setPublishMode,
    newTuneTitle,
    setNewTuneTitle,
    isPublishing,
    publishedFilter,
    setPublishedFilter,
    unpublishedFilter,
    setUnpublishedFilter,
    showRenameDialog,
    setShowRenameDialog,
    renameTarget,
    newName,
    setNewName,
    isRenaming,
    showDeleteDialog,
    setShowDeleteDialog,
    deleteTarget,
    isDeleting,
    isLoadingList,
    publishedTuneKeys,
    unpublishedTuneKeys,
    filteredPublishedKeys,
    filteredUnpublishedKeys,
    tuneTitleMap,
    getTuneTitle,
    tuneAssets,
    isLoadingAssets,
    labSequence,
    nuggetIds,
    assemblyIds,
    xmlFull,
    xmlDsp,
    selectionLabel,
    targetLabel,
    selectTune,
    openRenameDialog,
    handleRename,
    openDeleteDialog,
    handleDelete,
    handlePublish,
    getHandAvailability,
  };
}

export function TuneManagementProvider({ children }: { children: ReactNode }) {
  const value = useTuneManagementState();
  return (
    <TuneManagementContext.Provider value={value}>
      {children}
    </TuneManagementContext.Provider>
  );
}

export const TuneManagement = ({
  onPlaySequence,
  onStopPlayback,
  isPlaying = false,
  onRegisterNoteHandler,
}: TuneManagementProps) => {
  const {
    selectedSource,
    selectedTune,
    selectedTarget,
    setSelectedTarget,
    selectedItemId,
    setSelectedItemId,
    selectedHand,
    setSelectedHand,
    showPublishDialog,
    setShowPublishDialog,
    publishMode,
    setPublishMode,
    newTuneTitle,
    setNewTuneTitle,
    isPublishing,
    showRenameDialog,
    setShowRenameDialog,
    renameTarget,
    newName,
    setNewName,
    isRenaming,
    showDeleteDialog,
    setShowDeleteDialog,
    deleteTarget,
    isDeleting,
    isLoadingList,
    publishedTuneKeys,
    unpublishedTuneKeys,
    tuneAssets,
    isLoadingAssets,
    labSequence,
    nuggetIds,
    assemblyIds,
    xmlFull,
    xmlDsp,
    targetLabel,
    handleRename,
    handleDelete,
    handlePublish,
    getHandAvailability,
  } = useTuneManagementContext();

  // Cursor and playback refs
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const osmdDspRef = useRef<OpenSheetMusicDisplay | null>(null);
  const cursorInitializedRef = useRef(false);
  const expectedGroupIndexRef = useRef(0);
  const remainingPitchCountsRef = useRef<Map<number, number>>(new Map());
  const wasPlayingRef = useRef(false);
  const cursorTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const cursorEndTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initCursorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const osmdViewRef = useRef<OpenSheetMusicDisplayViewHandle | null>(null);
  const osmdDspViewRef = useRef<OpenSheetMusicDisplayViewHandle | null>(null);
  const initStyleAppliedRef = useRef(false);

  const handLabel = useCallback((hand: HandType) => {
    return hand === "left" ? "Left hand" : "Right hand";
  }, []);

  const fullHandAvailability = useMemo(
    () => getHandAvailability("full", ""),
    [getHandAvailability],
  );

  const nuggetHandAvailability = useMemo(() => {
    return new Map(
      nuggetIds.map((id) => [id, getHandAvailability("nuggets", id)]),
    );
  }, [getHandAvailability, nuggetIds]);

  const assemblyHandAvailability = useMemo(() => {
    return new Map(
      assemblyIds.map((id) => [id, getHandAvailability("assemblies", id)]),
    );
  }, [assemblyIds, getHandAvailability]);

  const expectedGroups = useMemo(() => {
    if (!labSequence.notes.length) return [];
    const grouped = new Map<number, { startTime: number; pitches: number[] }>();
    labSequence.notes.forEach((note) => {
      const key = Math.round(note.startTime * 1000);
      const existing = grouped.get(key);
      if (existing) {
        existing.pitches.push(note.pitch);
        existing.startTime = Math.min(existing.startTime, note.startTime);
      } else {
        grouped.set(key, { startTime: note.startTime, pitches: [note.pitch] });
      }
    });
    return Array.from(grouped.values()).sort(
      (a, b) => a.startTime - b.startTime,
    );
  }, [labSequence.notes]);

  const buildPitchCounts = useCallback((pitches: number[]) => {
    const counts = new Map<number, number>();
    pitches.forEach((pitch) => {
      counts.set(pitch, (counts.get(pitch) ?? 0) + 1);
    });
    return counts;
  }, []);

  const resetExpectedTracking = useCallback(() => {
    expectedGroupIndexRef.current = 0;
    remainingPitchCountsRef.current = buildPitchCounts(
      expectedGroups[0]?.pitches ?? [],
    );
  }, [buildPitchCounts, expectedGroups]);

  const setCursorColorForGroup = useCallback(
    (groupIndex: number) => {
      const pitches = expectedGroups[groupIndex]?.pitches;
      if (!pitches?.length) return;
      const noteName = midiToNoteName(pitches[0]);
      const noteColor = getNoteColorForNoteName(noteName);
      if (noteColor) {
        osmdDspViewRef.current?.setCursorColor(noteColor);
      }
    },
    [expectedGroups],
  );

  const resetCursor = useCallback(() => {
    const osmd = osmdDspRef.current;
    if (osmd?.cursor) {
      osmd.cursor.reset();
      osmd.cursor.hide();
    }
    cursorInitializedRef.current = false;
  }, []);

  const clearCursorTimers = useCallback(() => {
    cursorTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    cursorTimeoutsRef.current = [];
    if (cursorEndTimeoutRef.current) {
      clearTimeout(cursorEndTimeoutRef.current);
      cursorEndTimeoutRef.current = null;
    }
    if (initCursorTimeoutRef.current) {
      clearTimeout(initCursorTimeoutRef.current);
      initCursorTimeoutRef.current = null;
    }
  }, []);

  const showCursorAtStart = useCallback(() => {
    const osmd = osmdDspRef.current;
    if (osmd?.cursor) {
      osmd.cursor.reset();
      osmd.cursor.show();
      osmd.cursor.update();
    }
    cursorInitializedRef.current = true;
    setCursorColorForGroup(0);
  }, [setCursorColorForGroup]);

  const ensureCursorInitialized = useCallback(() => {
    if (!cursorInitializedRef.current) {
      const osmd = osmdDspRef.current;
      if (osmd?.cursor) {
        osmd.cursor.reset();
        osmd.cursor.show();
        osmd.cursor.update();
      }
      cursorInitializedRef.current = true;
    }
  }, []);

  const advanceCursorToNextPlayableNote = useCallback(() => {
    const cursor = osmdDspRef.current?.cursor;
    if (!cursor) return;
    const getNotesUnderCursor = cursor.NotesUnderCursor?.bind(cursor);
    if (!getNotesUnderCursor) {
      cursor.next();
      cursor.update();
      return;
    }
    let steps = 0;
    const maxSteps = 128;
    do {
      cursor.next();
      steps += 1;
      if (cursor.iterator?.EndReached) break;
      const notes = getNotesUnderCursor() ?? [];
      const hasPlayableNote = notes.some((note) => {
        const typedNote = note as {
          isRest?: boolean | (() => boolean);
          IsCueNote?: boolean;
          IsGraceNote?: boolean;
          isCueNote?: boolean;
          isGraceNote?: boolean;
        };
        const isRest =
          typeof typedNote.isRest === "function"
            ? typedNote.isRest()
            : typedNote.isRest;
        const isCue = typedNote.IsCueNote ?? typedNote.isCueNote;
        const isGrace = typedNote.IsGraceNote ?? typedNote.isGraceNote;
        return !isRest && !isCue && !isGrace;
      });
      if (hasPlayableNote) break;
    } while (steps < maxSteps);
    cursor.update();
  }, []);

  const scheduleCursorPlayback = useCallback(() => {
    const osmd = osmdDspRef.current;
    if (!osmd?.cursor || labSequence.notes.length === 0) return;

    clearCursorTimers();
    resetExpectedTracking();
    showCursorAtStart();

    const minStartTime = Math.min(
      ...labSequence.notes.map((note) => note.startTime),
    );
    const normalizedNotes = labSequence.notes.map((note) => ({
      ...note,
      startTime: note.startTime - minStartTime,
      endTime: note.endTime - minStartTime,
    }));
    const normalizedTotalTime =
      labSequence.totalTime > 0
        ? labSequence.totalTime - minStartTime
        : Math.max(...normalizedNotes.map((note) => note.endTime), 0);

    const startTimes = Array.from(
      new Set(normalizedNotes.map((note) => note.startTime)),
    ).sort((a, b) => a - b);

    startTimes.slice(1).forEach((startTime, index) => {
      const targetIndex = index + 1;
      const timeout = setTimeout(() => {
        const cursor = osmdRef.current?.cursor;
        if (!cursor) return;
        if (expectedGroupIndexRef.current >= targetIndex) return;
        expectedGroupIndexRef.current = targetIndex;
        remainingPitchCountsRef.current = buildPitchCounts(
          expectedGroups[targetIndex]?.pitches ?? [],
        );
        setCursorColorForGroup(targetIndex);
        advanceCursorToNextPlayableNote();
      }, startTime * 1000);
      cursorTimeoutsRef.current.push(timeout);
    });

    cursorEndTimeoutRef.current = setTimeout(() => {
      showCursorAtStart();
      resetExpectedTracking();
    }, normalizedTotalTime * 1000);
  }, [
    advanceCursorToNextPlayableNote,
    buildPitchCounts,
    clearCursorTimers,
    expectedGroups,
    labSequence,
    resetExpectedTracking,
    setCursorColorForGroup,
    showCursorAtStart,
  ]);

  const handleUserNote = useCallback(
    (noteKey: string) => {
      const osmd = osmdDspRef.current;
      if (!osmd?.cursor || expectedGroups.length === 0) return;

      const pitch = noteNameToMidi(noteKey);
      const remaining = remainingPitchCountsRef.current;
      const remainingCount = remaining.get(pitch);
      if (!remainingCount) return;

      ensureCursorInitialized();
      if (remainingCount === 1) {
        remaining.delete(pitch);
      } else {
        remaining.set(pitch, remainingCount - 1);
      }

      if (remaining.size > 0) return;

      const nextIndex = expectedGroupIndexRef.current + 1;
      if (nextIndex >= expectedGroups.length) {
        resetCursor();
        resetExpectedTracking();
        return;
      }

      expectedGroupIndexRef.current = nextIndex;
      remainingPitchCountsRef.current = buildPitchCounts(
        expectedGroups[nextIndex].pitches,
      );
      setCursorColorForGroup(nextIndex);
      advanceCursorToNextPlayableNote();
    },
    [
      advanceCursorToNextPlayableNote,
      buildPitchCounts,
      ensureCursorInitialized,
      expectedGroups,
      resetCursor,
      resetExpectedTracking,
      setCursorColorForGroup,
    ],
  );

  const handlePlayToggle = useCallback(() => {
    if (isPlaying) {
      onStopPlayback?.();
      clearCursorTimers();
      showCursorAtStart();
      resetExpectedTracking();
      return;
    }

    if (!onPlaySequence || labSequence.notes.length === 0) return;
    scheduleCursorPlayback();
    onPlaySequence(labSequence);
  }, [
    clearCursorTimers,
    isPlaying,
    labSequence,
    onPlaySequence,
    onStopPlayback,
    resetExpectedTracking,
    scheduleCursorPlayback,
    showCursorAtStart,
  ]);

  const handleOsmdReady = useCallback((osmd: OpenSheetMusicDisplay) => {
    osmdRef.current = osmd;
    if (osmd.cursor) {
      osmd.cursor.hide();
    }
  }, []);

  const handleOsmdDspReady = useCallback(
    (osmd: OpenSheetMusicDisplay) => {
      osmdDspRef.current = osmd;
      resetExpectedTracking();
      initStyleAppliedRef.current = false;
      if (initCursorTimeoutRef.current) {
        clearTimeout(initCursorTimeoutRef.current);
      }
      initCursorTimeoutRef.current = setTimeout(() => {
        showCursorAtStart();
        setCursorColorForGroup(0);
        initCursorTimeoutRef.current = null;
      }, 300);
    },
    [resetExpectedTracking, setCursorColorForGroup, showCursorAtStart],
  );

  const handleCursorElementReadyDsp = useCallback(
    (cursorElement: HTMLImageElement | null) => {
      if (!cursorElement) {
        initStyleAppliedRef.current = false;
        return;
      }
      if (initStyleAppliedRef.current) return;
      if (initCursorTimeoutRef.current) {
        clearTimeout(initCursorTimeoutRef.current);
      }
      initCursorTimeoutRef.current = setTimeout(() => {
        showCursorAtStart();
        setCursorColorForGroup(0);
        initStyleAppliedRef.current = true;
        initCursorTimeoutRef.current = null;
      }, 300);
    },
    [setCursorColorForGroup, showCursorAtStart],
  );

  useEffect(() => {
    if (wasPlayingRef.current && !isPlaying) {
      clearCursorTimers();
      showCursorAtStart();
      resetExpectedTracking();
    }
    wasPlayingRef.current = isPlaying;
  }, [clearCursorTimers, isPlaying, resetExpectedTracking, showCursorAtStart]);

  useEffect(() => {
    resetExpectedTracking();
  }, [resetExpectedTracking]);

  useEffect(() => {
    onRegisterNoteHandler?.(handleUserNote);
    return () => {
      onRegisterNoteHandler?.(null);
    };
  }, [handleUserNote, onRegisterNoteHandler]);

  useEffect(() => {
    return () => {
      clearCursorTimers();
    };
  }, [clearCursorTimers]);

  useEffect(() => {
    clearCursorTimers();
    resetExpectedTracking();
    if (osmdDspRef.current?.cursor) {
      showCursorAtStart();
    }
  }, [
    clearCursorTimers,
    resetExpectedTracking,
    showCursorAtStart,
    selectedItemId,
    selectedTarget,
    selectedTune,
  ]);

  const selectTarget = useCallback(
    (target: TargetType, itemId: string, hand: HandType) => {
      setSelectedTarget(target);
      setSelectedItemId(itemId);
      setSelectedHand(hand);
    },
    [setSelectedHand, setSelectedItemId, setSelectedTarget],
  );

  // Loading state
  if (isLoadingList) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-muted-foreground">Loading tunes...</p>
      </div>
    );
  }

  // Empty state - no tunes at all
  if (publishedTuneKeys.size === 0 && unpublishedTuneKeys.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-muted-foreground">
          No tunes found. Add tunes to src/music/ to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-full max-w-3xl mx-auto flex flex-col flex-1 items-stretch justify-start">
      <div className="w-full flex flex-wrap items-center gap-2 mb-3">
        {/* Play/Stop Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handlePlayToggle}
          disabled={
            !labSequence.notes.length ||
            (selectedSource === "published" && isLoadingAssets)
          }
        >
          {isPlaying ? (
            <>
              <Pause fill="currentColor" stroke="none" />
              Stop
            </>
          ) : (
            <>
              <Play fill="currentColor" stroke="none" />
              Play
            </>
          )}
        </Button>

        {/* Target Selector Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={!selectedTune}>
              {targetLabel}
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-popover">
            <DropdownMenuItem
              onClick={() => {
                selectTarget("full", "", "full");
              }}
            >
              <span className="flex-1">Full</span>
              {selectedTarget === "full" && selectedHand === "full" && (
                <Check className="h-4 w-4 ml-2" />
              )}
            </DropdownMenuItem>
            {fullHandAvailability.left && (
              <DropdownMenuItem
                onClick={() => selectTarget("full", "", "left")}
              >
                <span className="flex-1">Full, {handLabel("left")}</span>
                {selectedTarget === "full" && selectedHand === "left" && (
                  <Check className="h-4 w-4 ml-2" />
                )}
              </DropdownMenuItem>
            )}
            {fullHandAvailability.right && (
              <DropdownMenuItem
                onClick={() => selectTarget("full", "", "right")}
              >
                <span className="flex-1">Full, {handLabel("right")}</span>
                {selectedTarget === "full" && selectedHand === "right" && (
                  <Check className="h-4 w-4 ml-2" />
                )}
              </DropdownMenuItem>
            )}

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Nuggets</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="bg-popover max-h-60 overflow-y-auto">
                {nuggetIds.length > 0 ? (
                  nuggetIds.map((id) => (
                    <Fragment key={id}>
                      <DropdownMenuItem
                        key={`${id}-full`}
                        onClick={() => selectTarget("nuggets", id, "full")}
                      >
                        <span className="flex-1">{id}</span>
                        {selectedTarget === "nuggets" &&
                          selectedItemId === id &&
                          selectedHand === "full" && (
                            <Check className="h-4 w-4 ml-2" />
                          )}
                      </DropdownMenuItem>
                      {nuggetHandAvailability.get(id)?.left && (
                        <DropdownMenuItem
                          key={`${id}-left`}
                          onClick={() => selectTarget("nuggets", id, "left")}
                        >
                          <span className="flex-1">
                            {id}, {handLabel("left")}
                          </span>
                          {selectedTarget === "nuggets" &&
                            selectedItemId === id &&
                            selectedHand === "left" && (
                              <Check className="h-4 w-4 ml-2" />
                            )}
                        </DropdownMenuItem>
                      )}
                      {nuggetHandAvailability.get(id)?.right && (
                        <DropdownMenuItem
                          key={`${id}-right`}
                          onClick={() => selectTarget("nuggets", id, "right")}
                        >
                          <span className="flex-1">
                            {id}, {handLabel("right")}
                          </span>
                          {selectedTarget === "nuggets" &&
                            selectedItemId === id &&
                            selectedHand === "right" && (
                              <Check className="h-4 w-4 ml-2" />
                            )}
                        </DropdownMenuItem>
                      )}
                    </Fragment>
                  ))
                ) : (
                  <DropdownMenuItem disabled>No nuggets</DropdownMenuItem>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Assemblies</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="bg-popover max-h-60 overflow-y-auto">
                {assemblyIds.length > 0 ? (
                  assemblyIds.map((id) => (
                    <Fragment key={id}>
                      <DropdownMenuItem
                        key={`${id}-full`}
                        onClick={() => selectTarget("assemblies", id, "full")}
                      >
                        <span className="flex-1">{id}</span>
                        {selectedTarget === "assemblies" &&
                          selectedItemId === id &&
                          selectedHand === "full" && (
                            <Check className="h-4 w-4 ml-2" />
                          )}
                      </DropdownMenuItem>
                      {assemblyHandAvailability.get(id)?.left && (
                        <DropdownMenuItem
                          key={`${id}-left`}
                          onClick={() => selectTarget("assemblies", id, "left")}
                        >
                          <span className="flex-1">
                            {id}, {handLabel("left")}
                          </span>
                          {selectedTarget === "assemblies" &&
                            selectedItemId === id &&
                            selectedHand === "left" && (
                              <Check className="h-4 w-4 ml-2" />
                            )}
                        </DropdownMenuItem>
                      )}
                      {assemblyHandAvailability.get(id)?.right && (
                        <DropdownMenuItem
                          key={`${id}-right`}
                          onClick={() =>
                            selectTarget("assemblies", id, "right")
                          }
                        >
                          <span className="flex-1">
                            {id}, {handLabel("right")}
                          </span>
                          {selectedTarget === "assemblies" &&
                            selectedItemId === id &&
                            selectedHand === "right" && (
                              <Check className="h-4 w-4 ml-2" />
                            )}
                        </DropdownMenuItem>
                      )}
                    </Fragment>
                  ))
                ) : (
                  <DropdownMenuItem disabled>No assemblies</DropdownMenuItem>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Sheet music displays */}
      <div className="w-full space-y-6">
        <div className="space-y-2">
          <div className="text-sm font-medium text-muted-foreground">
            Full xml
          </div>
          {xmlFull ? (
            <OpenSheetMusicDisplayView
              ref={osmdViewRef}
              xml={xmlFull}
              compactness="compacttight"
              hasColor
              className="relative w-full"
              onOsmdReady={handleOsmdReady}
            />
          ) : (
            <div className="p-4 text-sm text-muted-foreground border rounded">
              {selectedSource === "published" && isLoadingAssets
                ? "Loading XML..."
                : "No XML available"}
            </div>
          )}
        </div>
        <div className="space-y-2">
          <div className="text-sm font-medium text-muted-foreground">
            Simplified xml
          </div>
          {xmlDsp ? (
            <OpenSheetMusicDisplayView
              ref={osmdDspViewRef}
              xml={xmlDsp}
              compactness="compacttight"
              hasColor
              className="relative w-full"
              onOsmdReady={handleOsmdDspReady}
              onCursorElementReady={handleCursorElementReadyDsp}
            />
          ) : (
            <div className="p-4 text-sm text-muted-foreground border rounded">
              {selectedSource === "published" && isLoadingAssets
                ? "Loading DSP XML..."
                : "No DSP XML available"}
            </div>
          )}
        </div>
      </div>

      {/* Publish Dialog */}
      <Dialog open={showPublishDialog} onOpenChange={setShowPublishDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish Tune</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Publishing: <strong>{selectedTune}</strong>
            </p>

            <div className="space-y-2">
              <Label>Action</Label>
              <Select value={publishMode} onValueChange={setPublishMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="create">Create New Tune</SelectItem>
                  {Array.from(publishedTuneKeys).map((key) => (
                    <SelectItem key={key} value={key}>
                      Update "{key}"
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {publishMode === "create" && (
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={newTuneTitle}
                  onChange={(e) => setNewTuneTitle(e.target.value)}
                  placeholder={`e.g., ${selectedTune}`}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowPublishDialog(false)}
            >
              Cancel
            </Button>
            <Button onClick={handlePublish} disabled={isPublishing}>
              {isPublishing ? "Publishing..." : "Publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Tune</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Renaming: <strong>{renameTarget}</strong>
            </p>
            <div className="space-y-2">
              <Label>New Name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Enter new name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRenameDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRename}
              disabled={isRenaming || !newName.trim()}
            >
              {isRenaming ? "Renaming..." : "Rename"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Tune</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete <strong>{deleteTarget}</strong>?
            </p>
            <p className="text-sm text-destructive">
              This action cannot be undone.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export function TuneManagementActionBar() {
  const {
    selectedSource,
    selectedTune,
    isLoadingAssets,
    selectionLabel,
    publishedFilter,
    setPublishedFilter,
    unpublishedFilter,
    setUnpublishedFilter,
    filteredPublishedKeys,
    filteredUnpublishedKeys,
    tuneTitleMap,
    getTuneTitle,
    selectTune,
    openRenameDialog,
    openDeleteDialog,
    setShowPublishDialog,
  } = useTuneManagementContext();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={selectedSource === "published" && isLoadingAssets}
          >
            {selectedSource === "published" && isLoadingAssets
              ? "Loading..."
              : selectionLabel}
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 bg-popover">
          {/* Published Section */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Published</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="bg-popover w-56 max-h-80 overflow-y-auto">
              {/* Filter Input */}
              <div className="px-2 py-1.5 sticky top-0 bg-popover">
                <Input
                  placeholder="Filter..."
                  value={publishedFilter}
                  onChange={(e) => setPublishedFilter(e.target.value)}
                  className="h-8"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </div>
              <DropdownMenuSeparator />
              {filteredPublishedKeys.length > 0 ? (
                filteredPublishedKeys.map((tune) => (
                  <DropdownMenuItem
                    key={tune}
                    onClick={() => selectTune("published", tune)}
                  >
                    <span className="flex-1">{tuneTitleMap.get(tune) || tune}</span>
                    {selectedTune === tune &&
                      selectedSource === "published" && (
                        <Check className="h-4 w-4 ml-2" />
                      )}
                  </DropdownMenuItem>
                ))
              ) : (
                <DropdownMenuItem disabled>No matches</DropdownMenuItem>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* Un-Published Section */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Un-Published</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="bg-popover w-56 max-h-80 overflow-y-auto">
              {/* Filter Input */}
              <div className="px-2 py-1.5 sticky top-0 bg-popover">
                <Input
                  placeholder="Filter..."
                  value={unpublishedFilter}
                  onChange={(e) => setUnpublishedFilter(e.target.value)}
                  className="h-8"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </div>
              <DropdownMenuSeparator />
              {filteredUnpublishedKeys.length > 0 ? (
                filteredUnpublishedKeys.map((tune) => (
                  <DropdownMenuItem
                    key={tune}
                    onClick={() => selectTune("local", tune)}
                  >
                    <span className="flex-1">{getTuneTitle(tune, "local")}</span>
                    {selectedTune === tune && selectedSource === "local" && (
                      <Check className="h-4 w-4 ml-2" />
                    )}
                  </DropdownMenuItem>
                ))
              ) : (
                <DropdownMenuItem disabled>No matches</DropdownMenuItem>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>

      {selectedTune &&
        (selectedSource === "published" ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Pencil className="h-4 w-4 mr-1" />
                Edit
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-popover">
              <DropdownMenuItem onClick={() => openRenameDialog(selectedTune)}>
                <Pencil />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => openDeleteDialog(selectedTune)}
                className="text-destructive"
              >
                <Trash2 />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button
            variant="default"
            size="sm"
            onClick={() => setShowPublishDialog(true)}
          >
            <Upload className="h-4 w-4 mr-1" />
            Publish
          </Button>
        ))}
    </>
  );
}

interface TuneManagementTabContentProps {
  onPlaySequence?: (sequence: NoteSequence) => void;
  onStopPlayback?: () => void;
  isPlaying?: boolean;
  onRegisterNoteHandler?: (handler: ((noteKey: string) => void) | null) => void;
}

export function TuneManagementTabContent({
  onPlaySequence,
  onStopPlayback,
  isPlaying,
  onRegisterNoteHandler,
}: TuneManagementTabContentProps) {
  return (
    <TabsContent
      value="lab"
      className="w-full h-full flex-1 min-h-0 flex items-start justify-start overflow-auto"
    >
      <TuneManagement
        onPlaySequence={onPlaySequence}
        onStopPlayback={onStopPlayback}
        isPlaying={isPlaying}
        onRegisterNoteHandler={onRegisterNoteHandler}
      />
    </TabsContent>
  );
}
