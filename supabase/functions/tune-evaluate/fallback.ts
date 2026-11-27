export interface Note { pitch: number; startTime: number; endTime: number }
export interface Evaluation {
  reasoning: string;
  evaluation: "pass" | "close" | "fail";
  feedbackText: string;
  successCount: number;
  replayDemo: boolean;
  markTuneAcquired?: boolean;
  awardSkills?: boolean;
}

export function readNotes(sequence: unknown): Note[] {
  const notes = (sequence as { notes?: unknown } | null)?.notes;
  if (!Array.isArray(notes) || !notes.every(n => n && Number.isInteger(n.pitch) && n.pitch >= 0 && n.pitch <= 127 &&
    Number.isFinite(n.startTime) && n.startTime >= 0 && Number.isFinite(n.endTime) && n.endTime >= n.startTime)) {
    throw new Error("Invalid note sequence");
  }
  return [...notes].sort((a, b) => a.startTime - b.startTime || a.pitch - b.pitch);
}

export function parseEvaluation(value: unknown): Evaluation {
  const result = value as Evaluation | null;
  if (!result || !["pass", "close", "fail"].includes(result.evaluation) ||
    typeof result.reasoning !== "string" || typeof result.feedbackText !== "string" || typeof result.replayDemo !== "boolean" ||
    !Number.isSafeInteger(result.successCount) || result.successCount < 0 ||
    (result.evaluation === "pass" ? result.successCount < 1 : result.successCount !== 0) ||
    (result.markTuneAcquired !== undefined && typeof result.markTuneAcquired !== "boolean") ||
    (result.awardSkills !== undefined && typeof result.awardSkills !== "boolean") ||
    (result.evaluation !== "pass" && (result.markTuneAcquired || result.awardSkills))) {
    throw new Error("Invalid evaluation result");
  }
  return result;
}

interface Chord { pitches: number[]; start: number; end: number }
function chords(notes: Note[], tolerance: number): Chord[] {
  const result: Chord[] = [];
  for (const note of notes) {
    const last = result.at(-1);
    if (last && note.startTime - last.start <= tolerance) {
      // A unison doubled across instruments is still one physical piano key.
      if (!last.pitches.includes(note.pitch)) last.pitches.push(note.pitch);
      last.end = Math.max(last.end, note.endTime);
    } else result.push({ pitches: [note.pitch], start: note.startTime, end: note.endTime });
  }
  return result;
}

function pitchEdits(a: Chord, b: Chord): number {
  const common = a.pitches.filter(p => b.pitches.includes(p)).length;
  return Math.max(a.pitches.length, b.pitches.length) - common;
}

function timingGrade(target: Chord[], played: Chord[]): number {
  let grade = 0;
  for (let i = 1; i < target.length; i++) {
    const expected = target[i].start - target[i - 1].start;
    const actual = played[i].start - played[i - 1].start;
    const repeated = target[i].pitches.some(p => target[i - 1].pitches.includes(p));
    const tolerance = Math.max(repeated ? 0.2 : 0.08, expected * 0.3);
    const difference = Math.abs(actual - expected);
    if (difference > tolerance + 1e-6) grade = Math.max(grade, difference <= Math.max(tolerance * 2, expected * 0.6) ? 1 : 2);
  }
  // With no onset intervals, a short tap must not pass a long held note.
  if (target.length === 1) {
    const expected = target[0].end - target[0].start;
    const actual = played[0].end - played[0].start;
    if (actual + 0.08 < expected * 0.7) grade = actual < expected * 0.4 ? 2 : 1;
  }
  return grade;
}

/** Weighted subsequence edit distance. Free prefix/suffix ignore warm-up notes;
 * internal additions, missing notes and substitutions still cost an edit.
 * Two DP rows keep memory linear even for full tunes and long recordings.
 */
function bestSegment(target: Chord[], played: Chord[]) {
  let previous = new Float64Array(played.length + 1);
  let starts = Uint32Array.from({ length: played.length + 1 }, (_, i) => i);
  let current = new Float64Array(played.length + 1);
  let nextStarts = new Uint32Array(played.length + 1);
  for (let i = 1; i <= target.length; i++) {
    current[0] = previous[0] + target[i - 1].pitches.length;
    nextStarts[0] = 0;
    for (let j = 1; j <= played.length; j++) {
      const diagonal = previous[j - 1] + pitchEdits(target[i - 1], played[j - 1]);
      const missing = previous[j] + target[i - 1].pitches.length;
      const extra = current[j - 1] + played[j - 1].pitches.length;
      current[j] = Math.min(diagonal, missing, extra);
      nextStarts[j] = current[j] === diagonal ? starts[j - 1] : current[j] === missing ? starts[j] : nextStarts[j - 1];
    }
    [previous, current] = [current, previous];
    [starts, nextStarts] = [nextStarts, starts];
  }
  let best = { edits: Infinity, start: 0, end: 0, timing: 2 };
  for (let end = 0; end <= played.length; end++) {
    const edits = previous[end];
    if (edits > best.edits) continue;
    const start = starts[end];
    const timing = edits === 0 ? timingGrade(target, played.slice(start, end)) : 2;
    if (edits < best.edits || timing <= best.timing) best = { edits, start, end, timing };
  }
  return best;
}

export function evaluateFallback(options: {
  targetSequence: unknown;
  userSequence: unknown;
  language?: string;
  currentStreak: number;
  isFullTune: boolean;
  alreadyAcquired: boolean;
}): Evaluation {
  const target = chords(readNotes(options.targetSequence), 0.001);
  if (!target.length) throw new Error("Target sequence has no notes");
  // Never merge quick melodic notes into a chord merely because the tune is fast.
  const shortestGap = target.slice(1).reduce((gap, chord, i) => Math.min(gap, chord.start - target[i].start), Infinity);
  const played = chords(readNotes(options.userSequence), Math.min(0.06, shortestGap / 2));
  const fr = options.language?.startsWith("fr");
  const best = bestSegment(target, played);
  const count = target.reduce((sum, chord) => sum + chord.pitches.length, 0);
  const evaluation = best.edits === 0 ? (["pass", "close", "fail"] as const)[best.timing]
    : played.length && best.edits <= 2 && best.edits <= count / 2 ? "close" : "fail";
  const feedbackText = !played.length
    ? (fr ? "Aucune note enregistrée. Joue la phrase puis réessaie." : "No notes recorded. Play the phrase and try again.")
    : evaluation === "pass"
      ? (fr ? "Notes et pulsation en place. Garde cette régularité." : "Accurate notes and steady timing. Keep it consistent.")
      : best.edits === 0
        ? (fr ? "Les notes sont justes. Écoute le modèle pour retrouver le rythme." : "The notes are right. Listen to the demo to match the rhythm.")
        : (fr ? "Reprends lentement les notes dans l’ordre, sans en ajouter ni en oublier." : "Try the notes slowly in order, without adding or missing any.");
  const segment = best.end > best.start ? `${played[best.start].start.toFixed(2)}–${played[best.end - 1].end.toFixed(2)}s` : "—";
  const reasoning = fr
    ? `Segment ${segment} : ${best.edits} correction(s) de hauteur ou d’ordre pour ${count} notes attendues. ${best.edits ? "Rythme non validé." : best.timing ? "Rythme hors tolérance." : "Rythme dans la tolérance de 30 % (avec marge pour les accords et notes répétées)."}`
    : `Segment ${segment}: ${best.edits} pitch/order edit(s) for ${count} expected notes. ${best.edits ? "Timing not validated." : best.timing ? "Timing outside tolerance." : "Timing within 30% tolerance (with allowance for chords and repeated notes)."}`;
  // Count one success per submitted evaluation, never inflate mastery from overlapping matches.
  const mastered = evaluation === "pass" && options.isFullTune && options.currentStreak + 1 >= 3;
  return { reasoning, evaluation, feedbackText, successCount: evaluation === "pass" ? 1 : 0,
    replayDemo: evaluation === "fail", markTuneAcquired: mastered && !options.alreadyAcquired,
    awardSkills: mastered };
}
