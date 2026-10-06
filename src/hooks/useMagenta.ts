import { loadMagentaScript } from "@/lib/magenta";
import { useState, useRef, useCallback, useEffect } from "react";
import type { MagentaNoteSequence as INoteSequence, MusicRNN, MusicVAE } from "@/types/magenta";
import { NoteSequence } from "@/types/noteSequence";

// Magenta model types
export type MagentaModelType = "magenta/music-rnn" | "magenta/music-vae";

interface MagentaState {
  isLoading: boolean;
  isReady: boolean;
  error: string | null;
  loadedModel: MagentaModelType | null;
  magentaLoaded: boolean;
}

// Magenta MusicRNN valid pitch range (model-specific)
const MAGENTA_MIN_PITCH = 36; // C2
const MAGENTA_MAX_PITCH = 81; // A5
const STEPS_PER_QUARTER = 4;

// Clamp pitch to valid range for Magenta models
const clampPitch = (pitch: number): number => {
  if (pitch < MAGENTA_MIN_PITCH) {
    // Transpose up by octaves until in range
    while (pitch < MAGENTA_MIN_PITCH) pitch += 12;
  } else if (pitch > MAGENTA_MAX_PITCH) {
    // Transpose down by octaves until in range
    while (pitch > MAGENTA_MAX_PITCH) pitch -= 12;
  }
  return pitch;
};

// Convert our NoteSequence to Magenta's format
const toMagentaSequence = (sequence: NoteSequence): INoteSequence => {
  return {
    notes: sequence.notes.map((note) => ({
      pitch: clampPitch(note.pitch),
      startTime: note.startTime,
      endTime: note.endTime,
      velocity: Math.round((note.velocity || 0.8) * 127),
    })),
    totalTime: sequence.totalTime,
    tempos: [{ time: 0, qpm: sequence.tempos?.[0]?.qpm || 120 }],
    quantizationInfo: { stepsPerQuarter: STEPS_PER_QUARTER },
  };
};

// Estimate how many quantized steps a NoteSequence spans using tempo and total time
const estimateQuantizedSteps = (
  sequence: NoteSequence,
  stepsPerQuarter: number = STEPS_PER_QUARTER
): number => {
  const bpm = sequence.tempos?.[0]?.qpm ?? 120;
  const totalTime = sequence.totalTime ?? 0;

  if (!totalTime || !bpm) return 0;

  const estimatedSteps = Math.round((totalTime * bpm * stepsPerQuarter) / 60);
  return Number.isFinite(estimatedSteps) ? estimatedSteps : 0;
};

// Convert Magenta's output back to our NoteSequence
const fromMagentaSequence = (magentaSeq: INoteSequence, bpm: number, timeSignature: string): NoteSequence => {
  const [numerator, denominator] = timeSignature.split("/").map(Number);
  
  return {
    notes: (magentaSeq.notes || []).map((note) => ({
      pitch: note.pitch,
      startTime: note.startTime,
      endTime: note.endTime,
      velocity: (note.velocity || 80) / 127,
    })),
    totalTime: magentaSeq.totalTime || 0,
    tempos: [{ time: 0, qpm: bpm }],
    timeSignatures: [{ time: 0, numerator, denominator }],
  };
};

export const useMagenta = () => {
  const [state, setState] = useState<MagentaState>({
    isLoading: false,
    isReady: false,
    error: null,
    loadedModel: null,
    magentaLoaded: false,
  });

  const musicRnnRef = useRef<MusicRNN>(null);
  const musicVaeRef = useRef<MusicVAE>(null);

  const loadModel = useCallback(async (modelType: MagentaModelType) => {
    // Already loaded
    if (state.loadedModel === modelType && state.isReady) {
      return true;
    }

    // Wait for Magenta to be loaded
    if (!state.magentaLoaded && !window.mm) {
      try {
        await loadMagentaScript();
      } catch (error) {
        console.error("[Magenta] Failed to load scripts:", error);
        setState((prev) => ({
          ...prev,
          error: error instanceof Error ? error.message : "Failed to load Magenta",
        }));
        return false;
      }
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const mm = window.mm;
      if (!mm) {
        throw new Error("Magenta library not available");
      }

      if (modelType === "magenta/music-rnn") {
        // MusicRNN with improv_rnn checkpoint for jazz
        const checkpointUrl = "https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/chord_pitches_improv";
        musicRnnRef.current = new mm.MusicRNN(checkpointUrl);
        await musicRnnRef.current.initialize();
        console.log("[Magenta] MusicRNN loaded successfully");
      } else if (modelType === "magenta/music-vae") {
        // MusicVAE with mel_2bar_small checkpoint
        const checkpointUrl = "https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/mel_2bar_small";
        musicVaeRef.current = new mm.MusicVAE(checkpointUrl);
        await musicVaeRef.current.initialize();
        console.log("[Magenta] MusicVAE loaded successfully");
      }

      setState({
        isLoading: false,
        isReady: true,
        error: null,
        loadedModel: modelType,
        magentaLoaded: true,
      });
      return true;
    } catch (error) {
      console.error("[Magenta] Failed to load model:", error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        isReady: false,
        error: error instanceof Error ? error.message : "Failed to load Magenta model",
        loadedModel: null,
      }));
      return false;
    }
  }, [state.loadedModel, state.isReady, state.magentaLoaded]);

  const continueSequence = useCallback(
    async (
      inputSequence: NoteSequence,
      modelType: MagentaModelType,
      bpm: number,
      timeSignature: string,
      options?: { steps?: number; temperature?: number; chordProgression?: string[] }
    ): Promise<NoteSequence | null> => {
      // Ensure model is loaded
      const loaded = await loadModel(modelType);
      if (!loaded) return null;

      try {
        const mm = window.mm;
        if (!mm) {
          throw new Error("Magenta library not available");
        }
        
        const magentaInput = toMagentaSequence(inputSequence);

        // Quantize the input sequence
        const quantizedInput = mm.sequences.quantizeNoteSequence(
          magentaInput,
          STEPS_PER_QUARTER
        );

        const quantizedSteps = quantizedInput.totalQuantizedSteps ?? 0;
        const estimatedSteps = estimateQuantizedSteps(inputSequence);
        const baseSteps = Math.max(quantizedSteps, estimatedSteps);
        const clampedSteps = Math.max(Math.min(baseSteps, 2048), 32);

        let outputSequence: INoteSequence;

        if (modelType === "magenta/music-rnn" && musicRnnRef.current) {
          // MusicRNN continuation
          // Use the quantized length of the user's phrase so generated ideas roughly
          // match the size of the source instead of defaulting to a very short clip.
          const steps = options?.steps ?? clampedSteps;
          const temperature = options?.temperature || 1.0;
          const chordProgression = options?.chordProgression || ["C", "G", "Am", "F"];

          outputSequence = await musicRnnRef.current.continueSequence(
            quantizedInput,
            steps,
            temperature,
            chordProgression
          );
          console.log("[Magenta] MusicRNN generated", outputSequence.notes?.length, "notes");
        } else if (modelType === "magenta/music-vae" && musicVaeRef.current) {
          // MusicVAE - sample similar sequences
          const temperature = options?.temperature || 0.5;
          const targetSteps = options?.steps ?? clampedSteps;

          // mel_2bar_small always decodes to its configured numSteps (32).
          // To better match the user's clip length, tile multiple decoded
          // samples end-to-end until we reach the requested duration.
          const segmentSteps = musicVaeRef.current.dataConverter?.numSteps ?? 32;
          const segmentCount = Math.max(1, Math.ceil(targetSteps / segmentSteps));

          // Encode input and sample around it
          const z = await musicVaeRef.current.encode([quantizedInput]);

          const decodedSegments: INoteSequence[] = [];
          for (let i = 0; i < segmentCount; i += 1) {
            const samples = await musicVaeRef.current.decode(z, temperature);
            const sample = samples[0];
            const offset = i * segmentSteps;

            const offsetNotes = (sample.notes || []).map((note) => {
              const quantizedStart = note.quantizedStartStep ?? note.startTime ?? 0;
              const quantizedEnd = note.quantizedEndStep ?? note.endTime ?? quantizedStart;

              return {
                ...note,
                quantizedStartStep: quantizedStart + offset,
                quantizedEndStep: quantizedEnd + offset,
                startTime: (note.startTime ?? quantizedStart) + offset,
                endTime: (note.endTime ?? quantizedEnd) + offset,
              };
            });

            decodedSegments.push({
              ...sample,
              notes: offsetNotes,
            });
          }

          const mergedNotes = decodedSegments.flatMap((segment) => segment.notes || []);

          const maxQuantizedEnd = mergedNotes.length
            ? Math.max(...mergedNotes.map((note) => note.quantizedEndStep ?? 0))
            : 0;
          const maxEndTime = mergedNotes.length
            ? Math.max(...mergedNotes.map((note) => note.endTime ?? 0))
            : 0;

          const totalQuantizedSteps = Math.max(maxQuantizedEnd, segmentCount * segmentSteps);

          outputSequence = {
            ...decodedSegments[0],
            notes: mergedNotes,
            totalQuantizedSteps,
            totalTime: Math.max(maxEndTime, totalQuantizedSteps),
            quantizationInfo: decodedSegments[0]?.quantizationInfo ?? {
              stepsPerQuarter: STEPS_PER_QUARTER,
            },
          };

          console.log(
            "[Magenta] MusicVAE generated",
            outputSequence.notes?.length,
            "notes across",
            segmentCount,
            "segments"
          );
        }

        if (!outputSequence || !outputSequence.notes?.length) {
          console.warn("[Magenta] No notes generated");
          return null;
        }

        // Unquantize the output sequence to get proper timing in seconds
        // unquantizeSequence already handles tempo conversion correctly
        const unquantizedOutput = mm.sequences.unquantizeSequence(outputSequence);
        
        // Normalize times to start from 0
        const minStartTime = Math.min(...unquantizedOutput.notes.map((n) => n.startTime));
        if (minStartTime > 0) {
          unquantizedOutput.notes.forEach((note) => {
            note.startTime -= minStartTime;
            note.endTime -= minStartTime;
          });
          unquantizedOutput.totalTime -= minStartTime;
        }

        return fromMagentaSequence(unquantizedOutput, bpm, timeSignature);
      } catch (error) {
        console.error("[Magenta] Error generating sequence:", error);
        setState((prev) => ({
          ...prev,
          error: error instanceof Error ? error.message : "Failed to generate sequence",
        }));
        return null;
      }
    },
    [loadModel]
  );

  const isMagentaModel = useCallback((model: string): model is MagentaModelType => {
    return model === "magenta/music-rnn" || model === "magenta/music-vae";
  }, []);

  return {
    ...state,
    loadModel,
    continueSequence,
    isMagentaModel,
  };
};
