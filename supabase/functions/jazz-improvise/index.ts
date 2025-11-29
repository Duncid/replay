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

    const systemPrompt = `You are a pianist that improvises musical responses with rhythm and duration. Given a sequence of piano notes with durations played by the user, you respond with a musical improvisation.

IMPORTANT RULES:

- Respond with 8 to 24 notes that form a musical phrase
- Each note must have a duration property: 0.25 (quarter), 0.5 (half), or 1.0 (full note)
- Use standard note notation: C3, D#4, F5, etc. (note name + octave number)
- Use notes between C3 and C6 (the 37-key range available)
- Create melodic phrases that complement what the user played
- Vary rhythms - use different note durations to create interesting patterns
- Return ONLY a JSON array of objects with "note" and "duration" properties
- Example input: [{"note": "C4", "duration": 0.5}, {"note": "E4", "duration": 0.25}]
- Example response: [{"note": "G4", "duration": 0.5}, {"note": "F4", "duration": 0.25}, {"note": "E4", "duration": 1.0}]

Now respond to the user's notes with your improvisation.`;

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
          { role: "user", content: `User played: ${JSON.stringify(userNotes)}` },
        ],
        temperature: 0.9, // Higher temperature for more creative improvisation
      }),
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

      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const aiMessage = data.choices[0].message.content;
    console.log("AI response:", aiMessage);

    // Parse the AI response to extract notes with durations
    let aiNotes: Array<{note: string, duration: number}>;
    try {
      // Try to parse as JSON
      aiNotes = JSON.parse(aiMessage);
    } catch {
      // Fallback: extract notes and assign default durations
      const noteRegex = /[A-G]#?\d/g;
      const noteMatches = aiMessage.match(noteRegex) || [];
      aiNotes = noteMatches.map((note: string) => ({ note, duration: 0.5 }));
    }

    console.log("Parsed AI notes:", aiNotes);

    // Validate notes are in the correct range (C3 to C6) and have valid durations
    const validNotes = aiNotes.filter((item) => {
      if (!item.note || typeof item.duration !== 'number') return false;
      const match = item.note.match(/([A-G]#?)(\d)/);
      if (!match) return false;
      const octave = parseInt(match[2]);
      const validOctave = octave >= 3 && octave <= 6;
      const validDuration = [0.25, 0.5, 1.0].includes(item.duration);
      return validOctave && validDuration;
    });

    if (validNotes.length === 0) {
      // Fallback to a simple jazz response with durations
      validNotes.push(
        { note: "G4", duration: 0.5 },
        { note: "F4", duration: 0.25 },
        { note: "E4", duration: 0.25 },
        { note: "D4", duration: 1.0 }
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
