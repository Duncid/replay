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
    const { userNotes } = await req.json();
    console.log("Received user notes:", userNotes);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are an pianist that improvises musical responses to user's input in a musical dialog. Given a sequence of piano notes played by the user, you respond with a musical improvisation.

IMPORTANT RULES:

Respond with 8 to 24 notes that form a musical phrase
Use standard note notation: C3, D#4, F5, etc. (note name + octave number)
Use notes between C3 and C6 (the 37-key range available)
Create melodic phrases that complement what the user played
Vary your responses - use different rhythms and note patterns
Return ONLY a JSON array of note strings, nothing else
Example user input: ["C4", "E4", "G4"] Example response: ["G4", "F4", "E4", "D4", "C4"]

Now respond to the user's notes with your improvisation.`;

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

    // Parse the AI response to extract notes
    let aiNotes: string[];
    try {
      // Try to parse as JSON
      aiNotes = JSON.parse(aiMessage);
    } catch {
      // If not valid JSON, try to extract notes using regex
      const noteRegex = /[A-G]#?\d/g;
      aiNotes = aiMessage.match(noteRegex) || [];
    }

    console.log("Parsed AI notes:", aiNotes);

    // Validate notes are in the correct range (C3 to C6)
    const validNotes = aiNotes.filter((note) => {
      const match = note.match(/([A-G]#?)(\d)/);
      if (!match) return false;
      const octave = parseInt(match[2]);
      return octave >= 3 && octave <= 6;
    });

    if (validNotes.length === 0) {
      // Fallback to a simple jazz response if AI didn't provide valid notes
      validNotes.push("G4", "F4", "E4", "D4");
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
