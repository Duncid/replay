import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
}

interface LessonResponse {
  instruction: string;
  sequence: NoteSequence;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, difficulty = 1, previousSequence, language = "en" } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      return new Response(JSON.stringify({ error: "Missing or invalid 'prompt' in request body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Generating lesson for: "${prompt}" at difficulty ${difficulty}, language: ${language}`);

    // Dynamic language instruction
    const languageInstruction = language === "fr"
      ? "IMPORTANT: Write all instruction text in French. Be encouraging and use natural French phrasing."
      : "IMPORTANT: Write all instruction text in English. Be encouraging and clear.";

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const difficultyGuide = difficulty === 1 
      ? "Create a VERY simple sequence with 3-5 notes, single notes only (no chords), slow tempo"
      : difficulty <= 3 
        ? `Create a simple sequence with ${4 + difficulty * 2} notes, mostly single notes, moderate tempo`
        : difficulty <= 5
          ? `Create a moderate sequence with ${8 + difficulty} notes, include some simple two-note chords`
          : `Create a challenging sequence with ${12 + difficulty} notes, include chords and varied rhythms`;

    const previousContext = previousSequence 
      ? `\nThe previous sequence was: ${JSON.stringify(previousSequence)}. Make this one slightly more complex.`
      : "";

    const systemPrompt = `You are a piano teacher creating short practice sequences for students.

${languageInstruction}

The student wants to learn: "${prompt}"

Your task is to generate:
1. A brief instruction text (1-2 sentences) explaining what they will play
2. A simple piano sequence as a NoteSequence JSON object

DIFFICULTY LEVEL ${difficulty}: ${difficultyGuide}${previousContext}

CRITICAL RULES:
1. Return ONLY a valid JSON object with "instruction" and "sequence" keys
2. The sequence format must be:
{
  "instruction": "This is a simple C major triad. Listen to the three notes played together.",
  "sequence": {
    "notes": [
      {"pitch": 60, "startTime": 0, "endTime": 1.0, "velocity": 0.8},
      {"pitch": 64, "startTime": 0, "endTime": 1.0, "velocity": 0.8},
      {"pitch": 67, "startTime": 0, "endTime": 1.0, "velocity": 0.8}
    ],
    "totalTime": 1.0,
    "tempos": [{"time": 0, "qpm": 80}]
  }
}

3. "pitch" is MIDI note number: 48=C3, 60=C4, 72=C5, 84=C6
4. "startTime" and "endTime" are in seconds
5. "velocity" is 0.0-1.0 (dynamics/intensity)
6. Valid range: pitch 48-84 (C3-C6)
7. Keep sequences SHORT and LEARNABLE (under 5 seconds for beginners)
8. The instruction should be encouraging and explain what the student will hear/play

EXAMPLE OUTPUT:
{
  "instruction": "Let's start with a simple ascending C major scale. Listen to these four notes going up.",
  "sequence": {
    "notes": [
      {"pitch": 60, "startTime": 0, "endTime": 0.8, "velocity": 0.8},
      {"pitch": 62, "startTime": 0.8, "endTime": 1.6, "velocity": 0.8},
      {"pitch": 64, "startTime": 1.6, "endTime": 2.4, "velocity": 0.8},
      {"pitch": 65, "startTime": 2.4, "endTime": 3.2, "velocity": 0.8}
    ],
    "totalTime": 3.2,
    "tempos": [{"time": 0, "qpm": 80}]
  }
}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Generate a lesson for: ${prompt}` },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required, please add funds to your Lovable AI workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway returned ${response.status}: ${errorText}`);
    }

    const aiData = await response.json();
    const aiMessage = aiData.choices?.[0]?.message?.content;

    if (!aiMessage) {
      console.error("No content in AI response");
      throw new Error("AI returned empty response");
    }

    console.log("AI response:", aiMessage);

    // Parse the AI's response
    let lessonData: LessonResponse;

    try {
      const jsonMatch = aiMessage.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        lessonData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON object found");
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      // Fallback lesson
      lessonData = {
        instruction: "Let's practice a simple ascending pattern. Listen carefully and then repeat.",
        sequence: {
          notes: [
            { pitch: 60, startTime: 0, endTime: 0.8, velocity: 0.8 },
            { pitch: 62, startTime: 0.8, endTime: 1.6, velocity: 0.8 },
            { pitch: 64, startTime: 1.6, endTime: 2.4, velocity: 0.8 },
            { pitch: 65, startTime: 2.4, endTime: 3.2, velocity: 0.8 },
          ],
          totalTime: 3.2,
          tempos: [{ time: 0, qpm: 80 }],
        },
      };
    }

    // Validate notes
    const validNotes: Note[] = [];
    for (const note of lessonData.sequence?.notes || []) {
      if (typeof note.pitch !== 'number' || note.pitch < 48 || note.pitch > 84) continue;
      if (typeof note.startTime !== 'number' || note.startTime < 0) continue;
      if (typeof note.endTime !== 'number' || note.endTime <= note.startTime) continue;
      
      const velocity = typeof note.velocity === 'number' ? Math.max(0, Math.min(1, note.velocity)) : 0.8;
      validNotes.push({ ...note, velocity });
    }

    if (validNotes.length === 0) {
      validNotes.push(
        { pitch: 60, startTime: 0, endTime: 0.8, velocity: 0.8 },
        { pitch: 62, startTime: 0.8, endTime: 1.6, velocity: 0.8 },
        { pitch: 64, startTime: 1.6, endTime: 2.4, velocity: 0.8 },
        { pitch: 65, startTime: 2.4, endTime: 3.2, velocity: 0.8 },
      );
    }

    const totalTime = Math.max(...validNotes.map(n => n.endTime));

    const result: LessonResponse = {
      instruction: lessonData.instruction || "Listen to this sequence and then try to repeat it.",
      sequence: {
        notes: validNotes,
        totalTime,
        tempos: lessonData.sequence?.tempos || [{ time: 0, qpm: 80 }],
      },
    };

    console.log("Final lesson:", JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in piano-learn function:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "An unknown error occurred",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
