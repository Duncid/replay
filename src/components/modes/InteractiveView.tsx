import { PianoSheetPixi, type NoteEvent, type SheetConfig } from "@/components/PianoSheetPixi";
import { TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { NoteSequence } from "@/types/noteSequence";
import { midiToNoteName } from "@/utils/noteSequenceUtils";
import {
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
  getTuneDspXml,
  getTuneLh,
  getTuneLhXml,
  getTuneNs,
  getTuneRh,
  getTuneRhXml,
  getTuneXml,
} from "@/utils/tuneAssetBundler";
import { OpenSheetMusicDisplayView } from "@/components/OpenSheetMusicDisplayView";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

type TargetType = "full" | "nuggets" | "assemblies";
type HandType = "full" | "left" | "right";

const EMPTY_SEQUENCE: NoteSequence = { notes: [], totalTime: 0 };

export function InteractiveViewActionBar() {
  return null;
}

export function InteractiveViewTabContent() {
  const localTuneKeys = useMemo(() => getLocalTuneKeys().sort(), []);
  const [selectedTune, setSelectedTune] = useState<string>("");
  const [selectedTarget, setSelectedTarget] = useState<TargetType>("full");
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [selectedHand, setSelectedHand] = useState<HandType>("full");
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!selectedTune && localTuneKeys.length > 0) {
      setSelectedTune(localTuneKeys[0]);
    }
  }, [localTuneKeys, selectedTune]);

  const nuggetIds = useMemo(
    () => (selectedTune ? getLocalNuggetIds(selectedTune) : []),
    [selectedTune],
  );
  const assemblyIds = useMemo(
    () => (selectedTune ? getLocalAssemblyIds(selectedTune) : []),
    [selectedTune],
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

  const xml = useMemo(() => {
    if (!selectedTune) return null;
    if (selectedTarget === "full") {
      if (selectedHand === "left") {
        return getTuneLhXml(selectedTune) ?? getTuneXml(selectedTune);
      }
      if (selectedHand === "right") {
        return getTuneRhXml(selectedTune) ?? getTuneXml(selectedTune);
      }
      return getTuneDspXml(selectedTune) ?? getTuneXml(selectedTune);
    }
    if (selectedTarget === "assemblies") {
      return (
        getAssemblyDspXml(selectedTune, selectedItemId) ??
        getAssemblyXml(selectedTune, selectedItemId)
      );
    }
    return (
      getNuggetDspXml(selectedTune, selectedItemId) ??
      getNuggetXml(selectedTune, selectedItemId)
    );
  }, [selectedHand, selectedItemId, selectedTarget, selectedTune]);

  const config = useMemo<SheetConfig>(() => {
    return {
      pixelsPerUnit: 120,
      noteHeight: 14,
      noteCornerRadius: 6,
      staffLineGap: 12,
      staffTopY: 60,
      leftPadding: 24,
      rightPadding: 24,
      viewWidth: size.width,
      viewHeight: size.height,
      minNoteWidth: 6,
      midiRef: 64,
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
            <PianoSheetPixi notes={notes} config={config} />
          )}
        </div>
      </div>
    </TabsContent>
  );
}
