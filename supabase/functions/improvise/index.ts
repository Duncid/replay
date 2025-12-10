import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// NoteSequence types (matching frontend)
interface Note {
  pitch: number;
  startTime: number;
  endTime: number;
  velocity: number;
}

interface NoteSequence {
  notes: Note[];
  totalTime: number;
  tempos?: Array<{ time: number; qpm: number }>;
  timeSignatures?: Array<{ time: number; numerator: number; denominator: number }>;
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function midiToNoteName(pitch: number): string {
  const octave = Math.floor(pitch / 12) - 1;
  const noteIndex = pitch % 12;
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

function noteNameToMidi(noteName: string): number {
  const match = noteName.match(/^([A-G]#?)(\d)$/);
  if (!match) throw new Error(`Invalid note name: ${noteName}`);
  const [, note, octaveStr] = match;
  const octave = parseInt(octaveStr);
  const noteIndex = NOTE_NAMES.indexOf(note);
  return (octave + 1) * 12 + noteIndex;
}

// Instrument-specific guidance for idiomatic playing
const INSTRUMENT_GUIDANCE: Record<string, { range: string; minPitch: number; maxPitch: number; style: string }> = {
  "classic": { range: "C3-C6", minPitch: 48, maxPitch: 84, style: "versatile piano patterns, chords and melody lines" },
  "fm-synth": { range: "C3-C6", minPitch: 48, maxPitch: 84, style: "warm electric piano, jazzy voicings, smooth chords" },
  "acoustic-piano": { range: "C3-C6", minPitch: 48, maxPitch: 84, style: "classical piano, full chords, counterpoint, arpeggios" },
  "electric-piano": { range: "C3-C6", minPitch: 48, maxPitch: 84, style: "rhodes-style, soft chords, gentle melodies" },
  "guitar": { range: "E2-E5", minPitch: 40, maxPitch: 76, style: "arpeggios, dyads, fingerpicking patterns, avoid more than 4 simultaneous notes" },
  "cello": { range: "C2-G4", minPitch: 36, maxPitch: 67, style: "lyrical single-note lines, legato phrasing, expressive melodies" },
  "bass": { range: "E1-G3", minPitch: 28, maxPitch: 55, style: "walking bass lines, root-fifth patterns, rhythmic foundations" },
  "organ": { range: "C3-C6", minPitch: 48, maxPitch: 84, style: "sustained chords, smooth voice leading, gospel/jazz voicings" },
  "trumpet": { range: "F#3-D6", minPitch: 54, maxPitch: 86, style: "bebop lines, single notes only, breath-phrased, bold statements" },
  "flute": { range: "C4-C7", minPitch: 60, maxPitch: 96, style: "airy melodic lines, single notes, ornaments, light and flowing" },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userSequence, model = "google/gemini-2.5-flash", metronome, instrument = "classic" } = await req.json();
    console.log("Received user sequence:", JSON.stringify(userSequence), "Model:", model, "Metronome:", metronome, "Instrument:", instrument);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Get instrument guidance
    const instrumentInfo = INSTRUMENT_GUIDANCE[instrument] || INSTRUMENT_GUIDANCE["classic"];

    // Get tempo from sequence or metronome
    const qpm = userSequence?.tempos?.[0]?.qpm ?? metronome?.bpm ?? 120;

    // Build tempo context for the prompt
    let tempoContext = "";
    if (metronome) {
      const tempoFeel = metronome.bpm <= 60 ? "slow and expressive" :
        metronome.bpm <= 90 ? "walking pace, relaxed" :
        metronome.bpm <= 120 ? "moderate groove" :
        metronome.bpm <= 160 ? "upbeat and energetic" :
        "fast, driving rhythm";
      
      tempoContext = `
TEMPO CONTEXT:
- BPM: ${metronome.bpm}
- Time Signature: ${metronome.timeSignature}
- Metronome Active: ${metronome.isActive ? "Yes" : "No"}
- Feel: ${tempoFeel}

Consider the tempo when choosing note durations. Match the rhythmic feel.
`;
    }

    // Build instrument context for the prompt
    const instrumentContext = `
INSTRUMENT CONTEXT:
- Instrument: ${instrument}
- Optimal Range: ${instrumentInfo.range}
- Style Guidance: ${instrumentInfo.style}

IMPORTANT: Tailor your improvisation to be idiomatic for this instrument. Stay within the optimal range and use patterns natural to this instrument.
`;

    // Convert user sequence to readable format for the AI
    const userNotesDescription = userSequence?.notes?.map((n: Note) => 
      `${midiToNoteName(n.pitch)} (${(n.endTime - n.startTime).toFixed(2)}s at ${n.startTime.toFixed(2)}s)`
    ).join(", ") || "No notes";

    const systemPrompt = `You are a musical improvisation assistant. The user will provide you with a sequence of musical notes they played, and you should respond with a creative improvisation that complements their input.

The user's notes are provided in NoteSequence format with MIDI pitch numbers.

You should respond with a JSON object containing a NoteSequence:
{
  "notes": [
    {"pitch": 64, "startTime": 0, "endTime": 0.5, "velocity": 0.8},
    {"pitch": 67, "startTime": 0.5, "endTime": 1.0, "velocity": 0.7},
    ...
  ],
  "totalTime": 4.0,
  "tempos": [{"time": 0, "qpm": ${qpm}}]
}

Where:
- "pitch" is the MIDI note number
- "startTime" and "endTime" are in seconds
- "velocity" is 0.0-1.0 (normalized volume/intensity)
- "totalTime" is the total duration in seconds

${tempoContext}
${instrumentContext}
Guidelines:
- Create a musically coherent response that complements the user's input
- CRITICAL: Stay within the instrument's optimal range (${instrumentInfo.range}, MIDI ${instrumentInfo.minPitch}-${instrumentInfo.maxPitch})
- Aim for 4-12 notes in your response (you can include chords by overlapping startTime/endTime, unless the instrument is monophonic)
- Use music theory: chord tones, passing notes, neighbor notes, melodic contour
- Respond with ONLY the JSON object, no other text or markdown`;

    const requestBody: Record<string, unknown> = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `User played these notes: ${userNotesDescription}\n\nFull NoteSequence: ${JSON.stringify(userSequence)}` },
      ],
    };

    if (model === "gpt-4o" || model === "gpt-4o-mini") {
      requestBody.temperature = 0.9;
    }

    // Add timeout to prevent edge function timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 second timeout

    let response: Response;
    try {
      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        console.error("AI gateway request timed out");
        return new Response(JSON.stringify({ error: "AI request timed out. Try a faster model like gemini-2.5-flash." }), {
          status: 504,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw fetchError;
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please add credits to your Lovable AI workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const aiMessage = data.choices[0].message.content;
    console.log("AI response:", aiMessage);

    // Parse the AI response
    let aiSequence: NoteSequence;
    try {
      const jsonMatch = aiMessage.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        aiSequence = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON object found");
      }
    } catch {
      console.error("Failed to parse AI response, using fallback");
      // Fallback sequence
      aiSequence = {
        notes: [
          { pitch: 67, startTime: 0, endTime: 0.25, velocity: 0.8 },
          { pitch: 65, startTime: 0.25, endTime: 0.375, velocity: 0.7 },
          { pitch: 64, startTime: 0.375, endTime: 0.5, velocity: 0.7 },
          { pitch: 62, startTime: 0.5, endTime: 1.0, velocity: 0.8 },
        ],
        totalTime: 1.0,
        tempos: [{ time: 0, qpm }],
      };
    }

    // Validate notes using instrument-specific range
    const validNotes: Note[] = [];
    for (const note of aiSequence.notes || []) {
      if (typeof note.pitch !== 'number' || note.pitch < instrumentInfo.minPitch || note.pitch > instrumentInfo.maxPitch) {
        console.log(`Invalid pitch for ${instrument}: ${note.pitch} (expected ${instrumentInfo.minPitch}-${instrumentInfo.maxPitch})`);
        continue;
      }
      if (typeof note.startTime !== 'number' || note.startTime < 0) {
        console.log(`Invalid startTime: ${note.startTime}`);
        continue;
      }
      if (typeof note.endTime !== 'number' || note.endTime <= note.startTime) {
        console.log(`Invalid endTime: ${note.endTime}`);
        continue;
      }
      const velocity = typeof note.velocity === 'number' ? Math.max(0, Math.min(1, note.velocity)) : 0.8;
      validNotes.push({ ...note, velocity });
    }

    if (validNotes.length === 0) {
      validNotes.push(
        { pitch: 67, startTime: 0, endTime: 0.25, velocity: 0.8 },
        { pitch: 65, startTime: 0.25, endTime: 0.375, velocity: 0.7 },
        { pitch: 64, startTime: 0.375, endTime: 0.5, velocity: 0.7 },
        { pitch: 62, startTime: 0.5, endTime: 1.0, velocity: 0.8 },
      );
    }

    const totalTime = Math.max(...validNotes.map(n => n.endTime));

    const resultSequence: NoteSequence = {
      notes: validNotes,
      totalTime,
      tempos: [{ time: 0, qpm }],
    };

    console.log("Final sequence:", JSON.stringify(resultSequence));

    return new Response(JSON.stringify({ sequence: resultSequence }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in jazz-improvise function:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
