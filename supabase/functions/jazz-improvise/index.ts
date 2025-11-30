import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userNotes, model = "google/gemini-2.5-flash" } = await req.json();
    console.log("Received user notes:", userNotes, "Model:", model);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are a jazz improvisation assistant. The user will provide you with a sequence of musical notes they played, and you should respond with a creative jazz improvisation that complements their input.

The user's notes will be in this format:
[
  {"note": "C4", "duration": 1.0, "startTime": 0},
  {"note": "E4", "duration": 0.5, "startTime": 1.0},
  {"note": "G4", "duration": 0.5, "startTime": 1.0},
  ...
]

Where:
- "note" is the musical note (e.g., "C4", "C#4", "D4", etc.) ranging from C3 to C6
- "duration" is in beats (0.25 = sixteenth note, 0.5 = eighth note, 1.0 = quarter note, 2.0 = half note, 4.0 = whole note)
- "startTime" is the beat position when the note starts (0 = beginning of recording). Notes with the same startTime are played simultaneously (chords).

You should respond with a JSON array in EXACTLY this format:
[
  {"note": "E4", "duration": 0.5, "startTime": 0},
  {"note": "G4", "duration": 0.5, "startTime": 0.5},
  {"note": "B4", "duration": 1.0, "startTime": 1.0},
  {"note": "D5", "duration": 1.0, "startTime": 1.0},
  ...
]

Guidelines:
- Create a musically coherent response that complements the user's input
- Stay in the C3-C6 range
- Use only these durations: 0.25, 0.5, 1.0, 2.0, 4.0
- Aim for 4-12 notes in your response (you can include chords by using the same startTime)
- Consider jazz theory: use chord tones, passing notes, neighbor notes, and harmonies
- You can create chords by giving multiple notes the same startTime
- Respond with ONLY the JSON array, no other text or markdown formatting`;

    // Prepare request body - only include temperature for legacy models that support it
    const requestBody: any = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `User played: ${JSON.stringify(userNotes)}` },
      ],
    };

    // Only add temperature for legacy OpenAI models (gpt-4o, gpt-4o-mini)
    // Newer models (gpt-5, gpt-4.1+) don't support custom temperature
    if (model === "gpt-4o" || model === "gpt-4o-mini") {
      requestBody.temperature = 0.9;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

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
      if (response.status === 503) {
        return new Response(
          JSON.stringify({ error: "AI service temporarily unavailable. Please try again in a moment." }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const aiMessage = data.choices[0].message.content;
    console.log("AI response:", aiMessage);

    // Parse the AI response to extract notes with durations and startTime
    let aiNotes: Array<{note: string, duration: number, startTime?: number}>;
    try {
      // Try to parse as JSON
      aiNotes = JSON.parse(aiMessage);
    } catch {
      // Fallback: extract notes and assign default durations
      const noteRegex = /[A-G]#?\d/g;
      const noteMatches = aiMessage.match(noteRegex) || [];
      aiNotes = noteMatches.map((note: string) => ({ note, duration: 0.5, startTime: 0 }));
    }

    console.log("Parsed AI notes:", aiNotes);

    // Validate notes are in the correct range (C3 to C6) and have valid durations and startTime
    const validNotes: Array<{note: string, duration: number, startTime: number}> = [];
    
    for (let i = 0; i < aiNotes.length; i++) {
      const item = aiNotes[i];
      
      if (!item.note || typeof item.duration !== 'number') {
        console.log(`Skipping invalid note at index ${i}:`, item);
        continue;
      }
      
      const match = item.note.match(/([A-G]#?)(\d)/);
      if (!match) {
        console.log(`Invalid note format at index ${i}:`, item.note);
        continue;
      }
      
      const octave = parseInt(match[2]);
      if (octave < 3 || octave > 6) {
        console.log(`Note ${item.note} is outside valid range (C3-C6)`);
        continue;
      }
      
      const validDurations = [0.25, 0.5, 1.0, 2.0, 4.0];
      if (!validDurations.includes(item.duration)) {
        console.log(`Invalid duration ${item.duration} for note ${item.note}, rounding to nearest valid duration`);
        // Round to nearest valid duration
        item.duration = validDurations.reduce((prev, curr) => 
          Math.abs(curr - item.duration) < Math.abs(prev - item.duration) ? curr : prev
        );
      }
      
      // Validate startTime (must be non-negative number)
      const startTime = typeof item.startTime === 'number' && item.startTime >= 0 
        ? item.startTime 
        : 0;
      
      validNotes.push({
        note: item.note,
        duration: item.duration,
        startTime,
      });
    }

    if (validNotes.length === 0) {
      // Fallback to a simple jazz response with durations and startTime
      validNotes.push(
        { note: "G4", duration: 0.5, startTime: 0 },
        { note: "F4", duration: 0.25, startTime: 0.5 },
        { note: "E4", duration: 0.25, startTime: 0.75 },
        { note: "D4", duration: 1.0, startTime: 1.0 }
      );
    }

    console.log("Final valid notes:", validNotes);

    return new Response(JSON.stringify({ notes: validNotes }), {
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
