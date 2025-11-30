import { NoteWithDuration } from "@/components/Piano";

/**
 * Converts our NoteWithDuration format to ABC notation
 * @param notes Array of notes to convert
 * @param title Optional title for the ABC notation
 * @returns ABC notation string
 */
export function notesToAbc(notes: NoteWithDuration[], title: string = "Jazz Improvisation"): string {
  if (notes.length === 0) return "";

  // ABC header
  let abc = `X:1\nT:${title}\nM:4/4\nL:1/4\nK:C\n`;

  // Group notes by start time to identify chords
  const notesByStartTime = new Map<number, NoteWithDuration[]>();
  notes.forEach(note => {
    const startTime = note.startTime || 0;
    if (!notesByStartTime.has(startTime)) {
      notesByStartTime.set(startTime, []);
    }
    notesByStartTime.get(startTime)!.push(note);
  });

  // Sort by start time
  const sortedStartTimes = Array.from(notesByStartTime.keys()).sort((a, b) => a - b);

  // Convert each group to ABC notation
  const abcElements: string[] = [];
  
  sortedStartTimes.forEach(startTime => {
    const simultaneousNotes = notesByStartTime.get(startTime)!;
    
    if (simultaneousNotes.length === 1) {
      // Single note
      const note = simultaneousNotes[0];
      abcElements.push(convertNoteToAbc(note));
    } else {
      // Chord - use the shortest duration among the notes
      const minDuration = Math.min(...simultaneousNotes.map(n => n.duration));
      const abcChord = "[" + simultaneousNotes.map(note => convertNoteToAbc(note, true)).join("") + "]";
      const durationStr = getDurationString(minDuration);
      abcElements.push(abcChord + durationStr);
    }
  });

  abc += abcElements.join(" ");
  
  return abc;
}

function convertNoteToAbc(note: NoteWithDuration, skipDuration: boolean = false): string {
  const noteName = note.note.slice(0, -1); // e.g., "C#" from "C#4"
  const octave = parseInt(note.note.slice(-1)); // e.g., 4 from "C#4"
  
  // Convert note name and accidentals
  let abcNote = noteName.replace("#", "^").replace("b", "_");
  
  // Convert octave notation
  if (octave === 3) {
    abcNote = abcNote.toUpperCase() + ",";
  } else if (octave === 4) {
    abcNote = abcNote.toUpperCase();
  } else if (octave === 5) {
    abcNote = abcNote.toLowerCase();
  } else if (octave === 6) {
    abcNote = abcNote.toLowerCase() + "'";
  }
  
  if (skipDuration) {
    return abcNote;
  }
  
  return abcNote + getDurationString(note.duration);
}

function getDurationString(duration: number): string {
  if (duration === 0.25) return "/2"; // eighth note
  if (duration === 0.5) return ""; // quarter note (default)
  if (duration === 1.0) return "2"; // half note
  if (duration === 2.0) return "4"; // whole note
  if (duration === 4.0) return "8"; // double whole note
  return "";
}

/**
 * Converts ABC notation back to our NoteWithDuration format
 * @param abc ABC notation string
 * @returns Array of NoteWithDuration
 */
export function abcToNotes(abc: string): NoteWithDuration[] {
  const notes: NoteWithDuration[] = [];
  
  // Extract the note line (after the headers)
  const lines = abc.split("\n");
  const noteLineIndex = lines.findIndex(line => line.match(/^[\[A-Ga-g^_,'/\d\s\]]+$/));
  if (noteLineIndex === -1) return notes;
  
  const noteLine = lines[noteLineIndex];
  
  // Split by spaces and parse each element (note or chord)
  const abcElements = noteLine.trim().split(/\s+/);
  
  let currentStartTime = 0;
  
  for (const abcElement of abcElements) {
    if (!abcElement) continue;
    
    // Check if it's a chord (starts with [)
    if (abcElement.startsWith("[")) {
      // Parse chord
      const chordMatch = abcElement.match(/^\[([^\]]+)\](\/?\d*)$/);
      if (!chordMatch) continue;
      
      const [, chordNotes, durationStr] = chordMatch;
      const duration = parseDuration(durationStr);
      
      // Parse each note in the chord
      const noteMatches = chordNotes.matchAll(/([_^]?)([A-Ga-g])([,']*)/g);
      for (const match of noteMatches) {
        const [, accidental, noteLetter, octaveMarkers] = match;
        const parsedNote = parseNote(accidental, noteLetter, octaveMarkers);
        notes.push({
          note: parsedNote,
          duration,
          startTime: currentStartTime,
        });
      }
      
      currentStartTime += duration;
    } else {
      // Parse single note
      const match = abcElement.match(/^([_^]?)([A-Ga-g])([,']*)(\/?\d*)$/);
      if (!match) continue;
      
      const [, accidental, noteLetter, octaveMarkers, durationStr] = match;
      const duration = parseDuration(durationStr);
      const parsedNote = parseNote(accidental, noteLetter, octaveMarkers);
      
      notes.push({
        note: parsedNote,
        duration,
        startTime: currentStartTime,
      });
      
      currentStartTime += duration;
    }
  }
  
  return notes;
}

function parseNote(accidental: string, noteLetter: string, octaveMarkers: string): string {
  // Convert accidental
  let noteName = noteLetter;
  if (accidental === "^") noteName += "#";
  if (accidental === "_") noteName += "b";
  
  // Convert octave
  let octave = 4; // default
  if (noteLetter === noteLetter.toUpperCase()) {
    // Uppercase = octave 4 or 3
    if (octaveMarkers === ",") octave = 3;
    else octave = 4;
  } else {
    // Lowercase = octave 5 or 6
    if (octaveMarkers === "'") octave = 6;
    else octave = 5;
  }
  
  noteName = noteName.toUpperCase();
  return `${noteName}${octave}`;
}

function parseDuration(durationStr: string): number {
  if (durationStr === "/2") return 0.25; // eighth note
  if (durationStr === "2") return 1.0; // half note
  if (durationStr === "4") return 2.0; // whole note
  if (durationStr === "8") return 4.0; // double whole note
  return 0.5; // default quarter note
}
