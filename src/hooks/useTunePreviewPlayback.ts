import { useCallback, useEffect, useRef, useState } from "react";
import { Frequency } from "tone";
import { toast } from "sonner";
import { useTonePiano } from "@/hooks/useTonePiano";
import { audioNow } from "@/lib/highwayAudioClock";
import type { TunePlayback } from "@/utils/tunePreview";

/** One local piano preview at a time; independent of practice and MIDI output. */
export function useTunePreviewPlayback() {
  const { ensureAudioReady, playNote, stopPlayback } = useTonePiano();
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const activeKey = useRef<string | null>(null);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const cancel = useCallback(() => {
    generation.current++;
    activeKey.current = null;
    if (timer.current !== null) clearInterval(timer.current);
    timer.current = null;
    stopPlayback();
  }, [stopPlayback]);

  const stop = useCallback(() => {
    cancel();
    setPlayingKey(null);
  }, [cancel]);

  useEffect(() => cancel, [cancel]);

  const toggle = useCallback(async (key: string, sequence: TunePlayback) => {
    const wasPlaying = activeKey.current === key;
    stop();
    if (wasPlaying) return;
    const request = generation.current;
    activeKey.current = key;
    setPlayingKey(key);
    try {
      // Resume within the click gesture; a stop during resume cancels this request.
      await ensureAudioReady();
      if (generation.current !== request) return;
      const start = audioNow() + 0.04;
      const notes = [...sequence.notes].sort((a, b) => a.startTime - b.startTime);
      let next = 0;
      const tick = () => {
        const elapsed = audioNow() - start;
        if (elapsed >= sequence.duration) { stop(); return; }
        while (next < notes.length && notes[next].startTime <= elapsed + 0.1) {
          const note = notes[next++];
          // If the page was throttled, skip expired notes instead of playing a burst.
          if (note.endTime <= elapsed) continue;
          const at = Math.max(audioNow(), start + note.startTime);
          void playNote(Frequency(note.pitch, "midi").toNote(), start + note.endTime - at, at)
            .catch(() => {
              if (generation.current === request) {
                stop();
                toast.error("Unable to play this preview. Please try again.");
              }
            });
        }
      };
      timer.current = setInterval(tick, 25);
      tick();
    } catch {
      if (generation.current === request) {
        stop();
        toast.error("Unable to play this preview. Please try again.");
      }
    }
  }, [ensureAudioReady, playNote, stop]);

  return { playingKey, toggle, stop };
}
