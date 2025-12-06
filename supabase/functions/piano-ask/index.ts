import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// NoteSequence types
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, model = "google/gemini-2.5-flash" } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      return new Response(JSON.stringify({ error: "Missing or invalid 'prompt' in request body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Received prompt: "${prompt}" Model: ${model}`);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are an expert piano player and composer. The user will ask you to play something for them.

Your task is to compose a piano piece that matches their request and return it as a NoteSequence JSON object.

CRITICAL RULES:
1. Return ONLY a valid JSON object - no explanation, no markdown, no extra text
2. The format must be:
{
  "notes": [
    {"pitch": 60, "startTime": 0, "endTime": 0.5, "velocity": 0.8},
    {"pitch": 64, "startTime": 0.5, "endTime": 1.0, "velocity": 0.7},
    ...
  ],
  "totalTime": 4.0,
  "tempos": [{"time": 0, "qpm": 120}]
}

3. "pitch" is MIDI note number: 48=C3, 60=C4, 72=C5, 84=C6
4. "startTime" and "endTime" are in seconds
5. "velocity" is 0.0-1.0 (dynamics/intensity)
6. Valid range: pitch 48-84 (C3-C6)
7. Create polyphony with overlapping notes (same startTime = chord)
8. Make it musically interesting and appropriate to the user's request

EXAMPLE OUTPUT WITH CHORDS:
{
  "notes": [
    {"pitch": 48, "startTime": 0, "endTime": 1.0, "velocity": 0.7},
    {"pitch": 60, "startTime": 0, "endTime": 0.5, "velocity": 0.8},
    {"pitch": 64, "startTime": 0, "endTime": 0.5, "velocity": 0.8},
    {"pitch": 67, "startTime": 0, "endTime": 0.5, "velocity": 0.8},
    {"pitch": 53, "startTime": 1.0, "endTime": 2.0, "velocity": 0.7},
    {"pitch": 65, "startTime": 1.0, "endTime": 1.5, "velocity": 0.8},
    {"pitch": 69, "startTime": 1.0, "endTime": 1.5, "velocity": 0.8},
    {"pitch": 72, "startTime": 1.0, "endTime": 1.5, "velocity": 0.8}
  ],
  "totalTime": 2.0,
  "tempos": [{"time": 0, "qpm": 120}]
}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
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
    let aiSequence: NoteSequence;

    try {
      const jsonMatch = aiMessage.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        aiSequence = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON object found");
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      // Fallback sequence
      aiSequence = {
        notes: [
          { pitch: 60, startTime: 0, endTime: 0.5, velocity: 0.8 },
          { pitch: 64, startTime: 0.5, endTime: 1.0, velocity: 0.8 },
          { pitch: 67, startTime: 1.0, endTime: 1.5, velocity: 0.8 },
          { pitch: 72, startTime: 1.5, endTime: 2.5, velocity: 0.8 },
        ],
        totalTime: 2.5,
        tempos: [{ time: 0, qpm: 120 }],
      };
    }

    // Validate notes
    const validNotes: Note[] = [];
    for (const note of aiSequence.notes || []) {
      if (typeof note.pitch !== 'number' || note.pitch < 48 || note.pitch > 84) continue;
      if (typeof note.startTime !== 'number' || note.startTime < 0) continue;
      if (typeof note.endTime !== 'number' || note.endTime <= note.startTime) continue;
      
      const velocity = typeof note.velocity === 'number' ? Math.max(0, Math.min(1, note.velocity)) : 0.8;
      validNotes.push({ ...note, velocity });
    }

    if (validNotes.length === 0) {
      validNotes.push(
        { pitch: 60, startTime: 0, endTime: 0.5, velocity: 0.8 },
        { pitch: 64, startTime: 0.5, endTime: 1.0, velocity: 0.8 },
        { pitch: 67, startTime: 1.0, endTime: 1.5, velocity: 0.8 },
        { pitch: 72, startTime: 1.5, endTime: 2.5, velocity: 0.8 },
      );
    }

    const totalTime = Math.max(...validNotes.map(n => n.endTime));

    const resultSequence: NoteSequence = {
      notes: validNotes,
      totalTime,
      tempos: aiSequence.tempos || [{ time: 0, qpm: 120 }],
    };

    console.log("Final sequence:", JSON.stringify(resultSequence));

    return new Response(JSON.stringify({ sequence: resultSequence }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in piano-ask function:", error);
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
