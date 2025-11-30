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

  // Convert notes
  const abcNotes = notes.map(note => {
    const noteName = note.note.slice(0, -1); // e.g., "C#" from "C#4"
    const octave = parseInt(note.note.slice(-1)); // e.g., 4 from "C#4"
    
    // Convert note name and accidentals
    let abcNote = noteName.replace("#", "^").replace("b", "_");
    
    // Convert octave notation
    // ABC: C, = octave 3, C = octave 4, c = octave 5, c' = octave 6
    if (octave === 3) {
      abcNote = abcNote.toUpperCase() + ",";
    } else if (octave === 4) {
      abcNote = abcNote.toUpperCase();
    } else if (octave === 5) {
      abcNote = abcNote.toLowerCase();
    } else if (octave === 6) {
      abcNote = abcNote.toLowerCase() + "'";
    }
    
    // Convert duration (our format: 0.25 = quarter, 0.5 = half, 1.0 = whole)
    // ABC: no number = quarter note, /2 = eighth, 2 = half, 4 = whole
    let durationStr = "";
    if (note.duration === 0.25) {
      durationStr = "/2"; // eighth note
    } else if (note.duration === 0.5) {
      durationStr = ""; // quarter note (default)
    } else if (note.duration === 1.0) {
      durationStr = "2"; // half note
    } else if (note.duration === 2.0) {
      durationStr = "4"; // whole note
    }
    
    return abcNote + durationStr;
  });

  abc += abcNotes.join(" ");
  
  return abc;
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
  const noteLineIndex = lines.findIndex(line => line.match(/^[A-Ga-g^_,'/\d\s]+$/));
  if (noteLineIndex === -1) return notes;
  
  const noteLine = lines[noteLineIndex];
  
  // Split by spaces and parse each note
  const abcNotes = noteLine.trim().split(/\s+/);
  
  for (const abcNote of abcNotes) {
    if (!abcNote) continue;
    
    // Parse note with regex: (accidental?)(note)(octave markers?)(duration?)
    const match = abcNote.match(/^([_^]?)([A-Ga-g])([,']*)(\/?\d*)$/);
    if (!match) continue;
    
    const [, accidental, noteLetter, octaveMarkers, durationStr] = match;
    
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
    
    // Convert duration
    let duration = 0.5; // default (quarter note in our system)
    if (durationStr === "/2") duration = 0.25; // eighth note
    else if (durationStr === "2") duration = 1.0; // half note
    else if (durationStr === "4") duration = 2.0; // whole note
    
    notes.push({
      note: `${noteName}${octave}`,
      duration,
    });
  }
  
  return notes;
}
