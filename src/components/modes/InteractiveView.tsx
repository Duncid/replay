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
import { Label } from "@/components/ui/label";
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

export function InteractiveViewActionBar() {
  return null;
}

interface InteractiveViewTabContentProps {
  onPlaybackInputEventRef?: React.MutableRefObject<((e: InputNoteEvent) => void) | null>;
  onActivePitchesChange?: (pitches: Set<number>) => void;
  onPlaybackNote?: (payload: { midi: number; durationSec: number }) => void;
}

export function InteractiveViewTabContent({
  onPlaybackInputEventRef,
  onActivePitchesChange,
  onPlaybackNote,
}: InteractiveViewTabContentProps) {
  const localTuneKeys = useMemo(() => getLocalTuneKeys().sort(), []);
  const [selectedTune, setSelectedTune] = useState<string>("");
  const [selectedTarget, setSelectedTarget] = useState<TargetType>("full");
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [selectedHand, setSelectedHand] = useState<HandType>("full");
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [followPlayhead, setFollowPlayhead] = useState(false);

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
        const durationSec = Math.max(0, endTime - playback.playheadTime);
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
    playback.playheadTime,
  ]);

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

  const bpm = useMemo(() => {
    const tempo = sequence.tempos?.[0]?.qpm;
    return Math.round(tempo ?? 120);
  }, [sequence.tempos]);

  const config = useMemo<SheetConfig>(() => {
    const baseUnit = 12;
    return {
      pixelsPerUnit: baseUnit * 4, // Horizontal scale: pixels per time unit
      noteHeight: baseUnit, // Rect height for each note
      noteCornerRadius: baseUnit / 2, // Rounded corner radius for notes
      trackGap: baseUnit * 0, // Gap between note tracks
      trackTopY: baseUnit * 2, // Y position of the top track
      leftPadding: baseUnit * 1.5, // Left margin before first note
      rightPadding: baseUnit * 1.5, // Right margin after last note
      viewWidth: size.width, // Viewport width from container
      viewHeight: size.height, // Viewport height from container
      minNoteWidth: Math.max(6, baseUnit * 0.375), // Minimum rect width
    };
  }, [size.height, size.width]);

  return (
    <TabsContent
      value="interactive"
      className="w-full h-full flex-1 min-h-0 flex items-stretch justify-center"
    >
      <div className="w-full h-full min-h-[240px] p-4 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={selectedTune}
            onValueChange={(value) => setSelectedTune(value)}
          >
            <SelectTrigger className="w-[220px]">
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
            <SelectTrigger className="w-[180px]">
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
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select part" />
              </SelectTrigger>
              <SelectContent>
                {(selectedTarget === "assemblies"
                  ? assemblyIds
                  : nuggetIds
                ).map((id) => (
                  <SelectItem key={id} value={id}>
                    {id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select
            value={selectedHand}
            onValueChange={(value) => setSelectedHand(value as HandType)}
          >
            <SelectTrigger className="w-[160px]">
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
        </div>
        <div className="w-full flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground px-1">
          <span>BPM: {bpm}</span>
          <div className="flex items-center gap-2">
            <Label htmlFor="follow-playhead" className="text-xs">
              Follow playhead
            </Label>
            <input
              id="follow-playhead"
              type="checkbox"
              checked={followPlayhead}
              onChange={(e) => setFollowPlayhead(e.target.checked)}
              className="h-4 w-4"
            />
          </div>
          <div className="flex items-center gap-2">
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
            <Button
              variant="outline"
              size="sm"
              onClick={playback.stop}
              disabled={notes.length === 0}
            >
              Stop
            </Button>
          </div>
        </div>
        <div className="w-full flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground px-1">
          <div className="flex items-center gap-3">
            <span>Phase: {playback.phase}</span>
            <span>Gate: {notes.length > 0 ? playback.gateIndex + 1 : "-"}</span>
            <span>t: {playback.playheadTime.toFixed(2)}s</span>
          </div>
        </div>
        <div className="w-full h-[280px] rounded-lg border bg-background/50 overflow-auto">
          <OpenSheetMusicDisplayView
            xml={xml}
            hasColor
            className="w-full h-full"
            style={{ width: "100%", height: "100%" }}
            centerHorizontally
          />
        </div>
        <div
          ref={containerRef}
          className="w-full h-full min-h-[240px] rounded-lg border bg-background/50 overflow-hidden"
        >
          {size.width > 0 && size.height > 0 && (
            <PianoSheetPixi
              notes={notes}
              config={config}
              timeSignatures={sequence.timeSignatures}
              qpm={bpm}
              playheadTime={playback.playheadTime}
              focusedNoteIds={playback.focusedNoteIds}
              activeNoteIds={playback.activeNoteIds}
              followPlayhead={followPlayhead}
            />
          )}
        </div>
      </div>
    </TabsContent>
  );
}
