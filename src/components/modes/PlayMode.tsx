import { useState, useCallback, useEffect, useRef } from "react";
import { NoteSequence, Note, PlaybackSegment } from "@/types/noteSequence";
import { beatsToSeconds } from "@/utils/noteSequenceUtils";
import { TrackContainer } from "@/components/TrackContainer";
import { TrackItem } from "@/components/TrackItem";
import { MergeSessionDialog } from "@/components/MergeSessionDialog";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    arrayMove,
    horizontalListSortingStrategy,
} from "@dnd-kit/sortable";

// Unified entry model
export interface PlayEntry {
    id: string;
    sequence: NoteSequence;
    isAiGenerated: boolean;
}

type GapUnit = "beats" | "measures";
type MergeDirection = "previous" | "next";

interface PlayModeProps {
    bpm: number;
    timeSignature: string;
    onReplay: (sequence: NoteSequence) => void;
    onPlayAll: (combinedSequence: NoteSequence, segments?: PlaybackSegment[]) => void;
    onStopPlayback: () => void;
    onClearHistory: () => void;
    liveNotes?: Note[];
    isRecording?: boolean;
    isPlaying?: boolean;
    isPlayingAll?: boolean;
    initialHistory?: PlayEntry[];
    onHistoryChange?: (history: PlayEntry[]) => void;
    onRequestImprov?: (sequence: NoteSequence) => void;
    onRequestVariations?: (sequence: NoteSequence) => void;
    playingSequence?: NoteSequence | null;
    onEditEntry?: (index: number, sequence: NoteSequence) => void;
}

export function PlayMode({
    bpm,
    timeSignature,
    onReplay,
    onPlayAll,
    onStopPlayback,
    onClearHistory,
    liveNotes = [],
    isRecording = false,
    isPlaying = false,
    isPlayingAll = false,
    initialHistory = [],
    onHistoryChange,
    onRequestImprov,
    onRequestVariations,
    playingSequence,
    onEditEntry,
}: PlayModeProps) {
    // Add IDs to initial history if they don't have them
    const [history, setHistory] = useState<PlayEntry[]>(() => {
        return initialHistory.map((entry, index) => ({
            ...entry,
            id: entry.id || `track-${Date.now()}-${index}`,
        }));
    });

    // Keep internal history in sync when the parent provides new data
    useEffect(() => {
        setHistory(
            initialHistory.map((entry, index) => ({
                ...entry,
                id: entry.id || `track-${Date.now()}-${index}`,
            }))
        );
    }, [initialHistory]);
    const trackRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    
    // Configure drag and drop sensors
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8, // Require 8px of movement before drag starts
            },
        }),
        useSensor(KeyboardSensor)
    );

    const beatsPerMeasure = parseInt(timeSignature.split('/')[0]);

    // Notify parent when history changes
    useEffect(() => {
        onHistoryChange?.(history);
    }, [history, onHistoryChange]);

    // Scroll to currently playing track during "Play All"
    useEffect(() => {
        if (isPlayingAll && playingSequence) {
            const playingEntry = history.find(entry => entry.sequence === playingSequence);
            if (playingEntry) {
                const ref = trackRefs.current.get(playingEntry.id);
                if (ref) {
                    ref.scrollIntoView({
                        behavior: 'smooth',
                        block: 'nearest',
                        inline: 'center'
                    });
                }
            }
        }
    }, [playingSequence, isPlayingAll, history]);

    // Add a single entry (user or AI)
    const addEntry = useCallback((sequence: NoteSequence, isAiGenerated: boolean) => {
        setHistory((prev) => [...prev, { 
            id: `track-${Date.now()}-${Math.random()}`,
            sequence, 
            isAiGenerated 
        }]);
    }, []);

    // Update an existing entry
    const updateEntry = useCallback((index: number, sequence: NoteSequence) => {
        setHistory((prev) => {
            const newHistory = [...prev];
            if (index >= 0 && index < newHistory.length) {
                newHistory[index] = { ...newHistory[index], sequence };
            }
            return newHistory;
        });
    }, []);

    const clearHistory = useCallback(() => {
        setHistory([]);
        onClearHistory();
    }, [onClearHistory]);

    // Merge two adjacent entries - result inherits isAiGenerated from target (left entry)
    const mergeSessions = useCallback((
        targetIndex: number,
        sourceIndex: number,
        gapValue: number,
        gapUnit: GapUnit
    ) => {
        setHistory((prev) => {
            if (targetIndex < 0 || sourceIndex >= prev.length) return prev;

            const target = prev[targetIndex];
            const source = prev[sourceIndex];

            // Calculate gap in seconds
            const gapInBeats = gapUnit === "measures" ? gapValue * beatsPerMeasure : gapValue;
            const gapSeconds = beatsToSeconds(gapInBeats, bpm);

            // Offset source notes
            const timeOffset = target.sequence.totalTime + gapSeconds;

            const offsetNotes = source.sequence.notes.map((note) => ({
                ...note,
                startTime: note.startTime + timeOffset,
                endTime: note.endTime + timeOffset,
            }));

            const mergedSequence: NoteSequence = {
                ...target.sequence,
                notes: [...target.sequence.notes, ...offsetNotes],
                totalTime: timeOffset + source.sequence.totalTime,
            };

            // Result inherits isAiGenerated and id from TARGET (merge AI into human = human)
            const mergedEntry: PlayEntry = {
                id: target.id,
                sequence: mergedSequence,
                isAiGenerated: target.isAiGenerated,
            };

            // Remove the source and replace target with merged
            const newHistory = [...prev];
            newHistory[targetIndex] = mergedEntry;
            newHistory.splice(sourceIndex, 1);

            return newHistory;
        });
    }, [bpm, beatsPerMeasure]);

    // Build combined sequence from all entries
    const getCombinedSequence = useCallback((): { sequence: NoteSequence; segments: PlaybackSegment[] } | null => {
        if (history.length === 0) return null;

        // Half measure gap between entries
        const measureGapSeconds = beatsToSeconds(beatsPerMeasure / 2, bpm);

        let combinedNotes: Note[] = [];
        const segments: PlaybackSegment[] = [];
        let currentTime = 0;

        history.forEach((entry, index) => {
            const startTime = currentTime;
            const endTime = currentTime + entry.sequence.totalTime;

            segments.push({
                originalSequence: entry.sequence,
                startTime,
                endTime,
            });

            // Add notes with time offset
            const offsetNotes = entry.sequence.notes.map((note) => ({
                ...note,
                startTime: note.startTime + currentTime,
                endTime: note.endTime + currentTime,
            }));
            combinedNotes = [...combinedNotes, ...offsetNotes];

            currentTime += entry.sequence.totalTime;

            // Add measure gap if not last
            if (index < history.length - 1) {
                currentTime += measureGapSeconds;
            }
        });

        const sequence: NoteSequence = {
            notes: combinedNotes,
            totalTime: currentTime,
            tempos: [{ time: 0, qpm: bpm }],
            timeSignatures: [{ time: 0, numerator: beatsPerMeasure, denominator: parseInt(timeSignature.split('/')[1]) }],
        };

        return { sequence, segments };
    }, [history, bpm, beatsPerMeasure, timeSignature]);

    // Handle playing all sequences
    const handlePlayAll = useCallback(() => {
        const result = getCombinedSequence();
        if (result) {
            onPlayAll(result.sequence, result.segments);
        }
    }, [getCombinedSequence, onPlayAll]);

    // Create a live sequence from current notes for real-time display
    const liveSequence: NoteSequence | null = liveNotes.length > 0 ? {
        notes: liveNotes,
        totalTime: Math.max(...liveNotes.map(n => n.endTime), 0),
        tempos: [{ time: 0, qpm: bpm }],
        timeSignatures: [{
            time: 0,
            numerator: beatsPerMeasure,
            denominator: parseInt(timeSignature.split('/')[1])
        }],
    } : null;

    const hasValidSessions = history.some(entry => entry.sequence.notes.length > 0);

    // State for merge dialog
    const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
    const [mergeEntryIndex, setMergeEntryIndex] = useState(0);
    const [mergeDirection, setMergeDirection] = useState<MergeDirection>("next");

    const openMergeDialog = (index: number, direction: MergeDirection) => {
        setMergeEntryIndex(index);
        setMergeDirection(direction);
        setMergeDialogOpen(true);
    };

    const handleMergeConfirm = (gapValue: number, gapUnit: GapUnit) => {
        const targetIndex = mergeDirection === "previous" ? mergeEntryIndex - 1 : mergeEntryIndex;
        const sourceIndex = mergeDirection === "previous" ? mergeEntryIndex : mergeEntryIndex + 1;
        mergeSessions(targetIndex, sourceIndex, gapValue, gapUnit);
        setMergeDialogOpen(false);
    };

    // Remove an entry by index
    const removeEntry = useCallback((index: number) => {
        setHistory((prev) => prev.filter((_, i) => i !== index));
    }, []);

    // Handle drag end to reorder tracks
    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            setHistory((items) => {
                const oldIndex = items.findIndex((item) => item.id === active.id);
                const newIndex = items.findIndex((item) => item.id === over.id);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };

    const render = () => {
        const trackIds = history.map((entry) => entry.id);
        
        return (
            <>
                <TrackContainer
                    scrollDependency={[history.length, liveNotes.length]}
                    autoScroll={!isPlayingAll && isRecording}
                >
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={trackIds}
                            strategy={horizontalListSortingStrategy}
                        >
                            {/* All entries - each with full controls */}
                            {history.map((entry, index) => (
                                <div 
                                    key={entry.id} 
                                    ref={(el) => {
                                        if (el) {
                                            trackRefs.current.set(entry.id, el);
                                        } else {
                                            trackRefs.current.delete(entry.id);
                                        }
                                    }}
                                >
                                    <TrackItem
                                        id={entry.id}
                                        sequence={entry.sequence}
                                        isPlaying={entry.sequence === playingSequence}
                                        onPlay={() => onReplay(entry.sequence)}
                                        onStop={onStopPlayback}
                                        isFirst={index === 0}
                                        isLast={index === history.length - 1 && !isRecording}
                                        isAiGenerated={entry.isAiGenerated}
                                        onMergePrevious={index > 0 ? () => openMergeDialog(index, "previous") : undefined}
                                        onMergeNext={index < history.length - 1 ? () => openMergeDialog(index, "next") : undefined}
                                        onRemove={() => removeEntry(index)}
                                        onRequestImprov={onRequestImprov}
                                        onRequestVariations={onRequestVariations}
                                        onEdit={onEditEntry ? (sequence) => onEditEntry(index, sequence) : undefined}
                                    />
                                </div>
                            ))}
                        </SortableContext>
                    </DndContext>

                    {/* Current recording (live) - rightmost */}
                    {isRecording && liveSequence && (
                        <TrackItem
                            sequence={liveSequence}
                            isRecording={true}
                        />
                    )}
                </TrackContainer>

                {/* Merge dialog */}
                <MergeSessionDialog
                    sessionIndex={mergeEntryIndex}
                    totalSessions={history.length}
                    onMerge={(direction, gapValue, gapUnit) => handleMergeConfirm(gapValue, gapUnit)}
                    open={mergeDialogOpen}
                    onOpenChange={setMergeDialogOpen}
                    initialDirection={mergeDirection}
                />
            </>
        );
    };

    return {
        history,
        addEntry,
        updateEntry,
        clearHistory,
        hasValidSessions,
        handlePlayAll,
        isPlaying,
        isPlayingAll,
        onStopPlayback,
        getCombinedSequence,
        onPlayAll,
        render,
    };
}
