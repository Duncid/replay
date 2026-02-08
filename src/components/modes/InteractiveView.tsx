import { OpenSheetMusicDisplayView } from "@/components/OpenSheetMusicDisplayView";
import { PianoSheetPixi } from "@/components/PianoSheetPixi";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { TabsContent } from "@/components/ui/tabs";
import type { NoteSequence } from "@/types/noteSequence";
import { midiToNoteName } from "@/utils/noteSequenceUtils";
import {
  getAssemblyLh,
  getAssemblyNs,
  getAssemblyRh,
  getAssemblyXml,
  getLocalAssemblyIds,
  getLocalNuggetIds,
  getLocalTuneKeys,
  getNuggetLh,
  getNuggetNs,
  getNuggetRh,
  getNuggetXml,
  getTuneLh,
  getTuneLhXml,
  getTuneNs,
  getTuneRh,
  getTuneRhXml,
  getTuneXml,
} from "@/utils/tuneAssetBundler";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { NoteEvent, SheetConfig } from "../PianoSheetPixiLayout.ts";
import {
  type InputNoteEvent,
  useSheetPlaybackEngine,
} from "@/hooks/useSheetPlaybackEngine";

type TargetType = "full" | "nuggets" | "assemblies";
type HandType = "full" | "left" | "right";

const EMPTY_SEQUENCE: NoteSequence = { notes: [], totalTime: 0 };

// ── Shared state hook ──────────────────────────────────────────────

export function useInteractiveState() {
  const localTuneKeys = useMemo(() => getLocalTuneKeys().sort(), []);
  const [selectedTune, setSelectedTune] = useState<string>("");
  const [selectedTarget, setSelectedTarget] = useState<TargetType>("full");
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [selectedHand, setSelectedHand] = useState<HandType>("full");
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!selectedTune && localTuneKeys.length > 0) {
      setSelectedTune(localTuneKeys[0]);
    }
  }, [localTuneKeys, selectedTune]);

  const nuggetIds = useMemo(
    () => (selectedTune ? getLocalNuggetIds(selectedTune) : []),
    [selectedTune]
  );
  const assemblyIds = useMemo(
    () => (selectedTune ? getLocalAssemblyIds(selectedTune) : []),
    [selectedTune]
  );

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
  }, [assemblyIds, nuggetIds, selectedItemId, selectedTarget]);

  const handAvailability = useMemo(() => {
    if (!selectedTune) return { left: false, right: false };
    if (selectedTarget === "full") {
      return {
        left: Boolean(getTuneLh(selectedTune)),
        right: Boolean(getTuneRh(selectedTune)),
      };
    }
    if (selectedTarget === "assemblies") {
      return {
        left: Boolean(getAssemblyLh(selectedTune, selectedItemId)),
        right: Boolean(getAssemblyRh(selectedTune, selectedItemId)),
      };
    }
    return {
      left: Boolean(getNuggetLh(selectedTune, selectedItemId)),
      right: Boolean(getNuggetRh(selectedTune, selectedItemId)),
    };
  }, [selectedTune, selectedTarget, selectedItemId]);

  useEffect(() => {
    if (selectedHand === "full") return;
    if (selectedHand === "left" && !handAvailability.left) {
      setSelectedHand("full");
    }
    if (selectedHand === "right" && !handAvailability.right) {
      setSelectedHand("full");
    }
  }, [handAvailability.left, handAvailability.right, selectedHand]);

  const sequence = useMemo(() => {
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
  }, [selectedHand, selectedItemId, selectedTarget, selectedTune]);

  const xml = useMemo(() => {
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
      return getAssemblyXml(selectedTune, selectedItemId);
    }
    return getNuggetXml(selectedTune, selectedItemId);
  }, [selectedHand, selectedItemId, selectedTarget, selectedTune]);

  return {
    localTuneKeys,
    selectedTune,
    setSelectedTune,
    selectedTarget,
    setSelectedTarget,
    selectedItemId,
    setSelectedItemId,
    selectedHand,
    setSelectedHand,
    sheetOpen,
    setSheetOpen,
    nuggetIds,
    assemblyIds,
    handAvailability,
    sequence,
    xml,
  };
}

export type InteractiveState = ReturnType<typeof useInteractiveState>;

// ── Action bar (rendered in topbar) ────────────────────────────────

interface InteractiveViewActionBarProps {
  state: InteractiveState;
}

export function InteractiveViewActionBar({
  state,
}: InteractiveViewActionBarProps) {
  const {
    localTuneKeys,
    selectedTune,
    setSelectedTune,
    selectedTarget,
    setSelectedTarget,
    selectedItemId,
    setSelectedItemId,
    selectedHand,
    setSelectedHand,
    sheetOpen,
    setSheetOpen,
    nuggetIds,
    assemblyIds,
    handAvailability,
    xml,
  } = state;

  return (
    <div className="flex items-center gap-2">
      <Select
        value={selectedTune}
        onValueChange={(value) => setSelectedTune(value)}
      >
        <SelectTrigger className="w-[220px] h-8">
          <SelectValue placeholder="Select tune" />
        </SelectTrigger>
        <SelectContent>
          {localTuneKeys.map((key) => (
            <SelectItem key={key} value={key}>
              {key}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={selectedTarget}
        onValueChange={(value) => setSelectedTarget(value as TargetType)}
      >
        <SelectTrigger className="w-[140px] h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="full">Full tune</SelectItem>
          <SelectItem value="nuggets">Nuggets</SelectItem>
          <SelectItem value="assemblies">Assemblies</SelectItem>
        </SelectContent>
      </Select>
      {selectedTarget !== "full" && (
        <Select
          value={selectedItemId}
          onValueChange={(value) => setSelectedItemId(value)}
        >
          <SelectTrigger className="w-[140px] h-8">
            <SelectValue placeholder="Select part" />
          </SelectTrigger>
          <SelectContent>
            {(selectedTarget === "assemblies" ? assemblyIds : nuggetIds).map(
              (id) => (
                <SelectItem key={id} value={id}>
                  {id}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
      )}
      <Select
        value={selectedHand}
        onValueChange={(value) => setSelectedHand(value as HandType)}
      >
        <SelectTrigger className="w-[120px] h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="full">Full</SelectItem>
          <SelectItem value="left" disabled={!handAvailability.left}>
            Left hand
          </SelectItem>
          <SelectItem value="right" disabled={!handAvailability.right}>
            Right hand
          </SelectItem>
        </SelectContent>
      </Select>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" disabled={!xml}>
            Sheet
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-[50vw] sm:max-w-[50vw]">
          <SheetHeader>
            <SheetTitle>Sheet Music</SheetTitle>
          </SheetHeader>
          <div className="w-full h-full overflow-auto pt-4">
            <OpenSheetMusicDisplayView
              xml={xml}
              hasColor
              className="w-full h-full"
              style={{ width: "100%", height: "100%" }}
              centerHorizontally
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── Tab content ────────────────────────────────────────────────────

interface InteractiveViewTabContentProps {
  state: InteractiveState;
  onPlaybackInputEventRef?: React.MutableRefObject<
    ((e: InputNoteEvent) => void) | null
  >;
  onActivePitchesChange?: (pitches: Set<number>) => void;
  onPlaybackNote?: (payload: { midi: number; durationSec: number }) => void;
}

export function InteractiveViewTabContent({
  state,
  onPlaybackInputEventRef,
  onActivePitchesChange,
  onPlaybackNote,
}: InteractiveViewTabContentProps) {
  const { sequence } = state;

  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const notes = useMemo<NoteEvent[]>(() => {
    return sequence.notes.map((note, index) => {
      const noteName = midiToNoteName(note.pitch);
      return {
        id: `${note.pitch}-${note.startTime}-${index}`,
        midi: note.pitch,
        start: note.startTime,
        dur: Math.max(0, note.endTime - note.startTime),
        accidental: noteName.includes("#") ? "sharp" : null,
      };
    });
  }, [sequence.notes]);

  const noteById = useMemo(() => {
    return new Map(notes.map((note) => [note.id, note]));
  }, [notes]);

  const prevActiveNoteIdsRef = useRef<Set<string>>(new Set());

  const playback = useSheetPlaybackEngine({
    notes,
    enabled: notes.length > 0,
  });

  useEffect(() => {
    if (onPlaybackInputEventRef) {
      onPlaybackInputEventRef.current = playback.handleInputEvent;
    }
    return () => {
      if (onPlaybackInputEventRef) {
        onPlaybackInputEventRef.current = null;
      }
    };
  }, [onPlaybackInputEventRef, playback.handleInputEvent]);

  useEffect(() => {
    const next = playback.activeNoteIds;
    const prev = prevActiveNoteIdsRef.current;
    const added: string[] = [];

    next.forEach((id) => {
      if (!prev.has(id)) {
        added.push(id);
      }
    });

    const activePitches = new Set<number>();
    next.forEach((id) => {
      const note = noteById.get(id);
      if (note) activePitches.add(note.midi);
    });
    onActivePitchesChange?.(activePitches);

    if (playback.isAutoplay && onPlaybackNote) {
      added.forEach((id) => {
        const note = noteById.get(id);
        if (!note) return;
        const endTime = note.start + note.dur;
        const durationSec = Math.max(0, endTime - (playback.playheadTimeRef.current ?? 0));
        if (durationSec > 0) {
          onPlaybackNote({ midi: note.midi, durationSec });
        }
      });
    }

    prevActiveNoteIdsRef.current = new Set(next);
  }, [
    noteById,
    onActivePitchesChange,
    onPlaybackNote,
    playback.activeNoteIds,
    playback.isAutoplay,
    playback.playheadTimeRef,
  ]);

  const bpm = useMemo(() => {
    const tempo = sequence.tempos?.[0]?.qpm;
    return Math.round(tempo ?? 120);
  }, [sequence.tempos]);

  const config = useMemo<SheetConfig>(() => {
    const baseUnit = 12;
    return {
      pixelsPerUnit: baseUnit * 4,
      noteHeight: baseUnit,
      noteCornerRadius: baseUnit / 2,
      trackGap: baseUnit * 0,
      trackTopY: baseUnit * 2,
      leftPadding: baseUnit * 1.5,
      rightPadding: baseUnit * 1.5,
      viewWidth: size.width,
      viewHeight: size.height,
      minNoteWidth: Math.max(6, baseUnit * 0.375),
    };
  }, [size.height, size.width]);

  const isAtStart = playback.playheadTime < 0.01 && (playback.playheadTimeRef.current ?? 0) < 0.01;

  return (
    <TabsContent
      value="interactive"
      forceMount
      className="w-full h-full flex-1 min-h-0 flex items-stretch justify-center data-[state=inactive]:hidden"
    >
      <div className="w-full h-full flex flex-col">
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-2 py-1 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (playback.isAutoplay) {
                playback.pause();
              } else {
                playback.play();
              }
            }}
            disabled={notes.length === 0}
          >
            {playback.isAutoplay ? "Pause" : "Play"}
          </Button>
          {!isAtStart && (
            <Button
              variant="outline"
              size="sm"
              onClick={playback.stop}
              disabled={notes.length === 0}
            >
              Restart
            </Button>
          )}
          <span className="ml-2">BPM: {bpm}</span>
          <span>Phase: {playback.phase}</span>
          <span>
            Gate: {notes.length > 0 ? playback.gateIndex + 1 : "-"}
          </span>
          <span>t: {playback.playheadTime.toFixed(2)}s</span>
        </div>
        <div
          ref={containerRef}
          className="w-full flex-1 min-h-0 overflow-hidden"
        >
          {size.width > 0 && size.height > 0 && (
            <PianoSheetPixi
              notes={notes}
              config={config}
              timeSignatures={sequence.timeSignatures}
              qpm={bpm}
              playheadTimeRef={playback.playheadTimeRef}
              focusedNoteIds={playback.focusedNoteIds}
              activeNoteIds={playback.activeNoteIds}
              followPlayhead
              isAutoplay={playback.isAutoplay}
            />
          )}
        </div>
      </div>
    </TabsContent>
  );
}
