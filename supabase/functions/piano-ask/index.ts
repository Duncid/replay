import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, model = "google/gemini-2.5-flash" } = await req.json();
    
    if (!prompt || typeof prompt !== 'string') {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'prompt' in request body" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Received prompt: "${prompt}" Model: ${model}`);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are an expert piano player and composer. The user will ask you to play something for them (e.g., "play something jazzy", "play a happy melody", "play a sad tune", "play the C major scale").

Your task is to compose a short piano piece (4-8 seconds) that matches their request.

CRITICAL RULES:
1. Return ONLY a valid JSON array of notes - no explanation, no markdown, no extra text
2. Each note MUST have exactly these properties:
   - "note": A string in the format [NoteName][Octave] (e.g., "C4", "F#5")
   - "duration": A number representing the length in beats (0.25, 0.5, 1, 2, etc.)
   - "startTime": A number representing when the note starts in beats (0, 0.5, 1, 1.5, etc.)
3. Valid note names: C, C#, D, D#, E, F, F#, G, G#, A, A#, B
4. Valid octaves: 3, 4, 5, or 6 (stay within piano range C3-C6)
5. **USE CHORDS AND POLYPHONY**: Piano music sounds richer with chords! Use multiple notes with the same startTime to create harmony. For example:
   - Major chords (C-E-G), minor chords (A-C-E), seventh chords, etc.
   - Bass notes in left hand (octave 3-4) with melody in right hand (octave 4-6)
   - Accompaniment patterns with chords
6. Keep the composition short (total duration 4-8 seconds, which is 8-16 beats since 1 beat = 0.5s)
7. Make it musically interesting and appropriate to the user's request

EXAMPLE OUTPUT WITH CHORDS:
[
  {"note": "C3", "duration": 2, "startTime": 0},
  {"note": "C4", "duration": 1, "startTime": 0},
  {"note": "E4", "duration": 1, "startTime": 0},
  {"note": "G4", "duration": 1, "startTime": 0},
  {"note": "F3", "duration": 2, "startTime": 2},
  {"note": "F4", "duration": 1, "startTime": 2},
  {"note": "A4", "duration": 1, "startTime": 2},
  {"note": "C5", "duration": 1, "startTime": 2},
  {"note": "G3", "duration": 2, "startTime": 4},
  {"note": "G4", "duration": 0.5, "startTime": 4},
  {"note": "B4", "duration": 0.5, "startTime": 4},
  {"note": "D5", "duration": 0.5, "startTime": 4},
  {"note": "C5", "duration": 2, "startTime": 6}
]`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limits exceeded, please try again later." }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required, please add funds to your Lovable AI workspace." }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
    let aiNotes: Array<{ note: string; duration: number; startTime: number }> = [];
    
    try {
      // Try to extract JSON array from the response
      const jsonMatch = aiMessage.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        aiNotes = JSON.parse(jsonMatch[0]);
      } else {
        aiNotes = JSON.parse(aiMessage);
      }
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", parseError);
      console.log("Attempting regex fallback...");
      
      // Fallback: try to extract notes using regex
      const noteRegex = /\{\s*"note"\s*:\s*"([A-G]#?\d)"\s*,\s*"duration"\s*:\s*(\d+\.?\d*)\s*,\s*"startTime"\s*:\s*(\d+\.?\d*)\s*\}/g;
      let match;
      while ((match = noteRegex.exec(aiMessage)) !== null) {
        aiNotes.push({
          note: match[1],
          duration: parseFloat(match[2]),
          startTime: parseFloat(match[3])
        });
      }
    }

    console.log("Parsed AI notes:", aiNotes);

    // Validate and filter notes
    const validNotes = aiNotes.filter((n) => {
      if (!n.note || typeof n.note !== "string") return false;
      if (typeof n.duration !== "number" || n.duration <= 0) return false;
      if (typeof n.startTime !== "number" || n.startTime < 0) return false;

      // Validate note format
      const noteMatch = n.note.match(/^([A-G]#?)(\d)$/);
      if (!noteMatch) return false;

      const [, , octave] = noteMatch;
      const octaveNum = parseInt(octave);

      // Valid range: C3 to C6
      if (octaveNum < 3 || octaveNum > 6) return false;

      // Valid duration values (common note lengths)
      const validDurations = [0.125, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
      const isValidDuration = validDurations.some(d => Math.abs(n.duration - d) < 0.01);
      if (!isValidDuration) return false;

      return true;
    });

    console.log("Final valid notes:", validNotes);

    // If no valid notes, provide a default composition
    if (validNotes.length === 0) {
      console.log("No valid notes generated, using default composition");
      validNotes.push(
        { note: "C4", duration: 1, startTime: 0 },
        { note: "E4", duration: 1, startTime: 1 },
        { note: "G4", duration: 1, startTime: 2 },
        { note: "C5", duration: 2, startTime: 3 }
      );
    }

    return new Response(JSON.stringify({ notes: validNotes }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error("Error in piano-ask function:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "An unknown error occurred" 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
