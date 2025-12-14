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
}

interface EvaluationResponse {
  evaluation: "correct" | "close" | "wrong";
  feedback: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { targetSequence, userSequence, instruction } = await req.json();

    if (!targetSequence || !userSequence) {
      return new Response(JSON.stringify({ error: "Missing target or user sequence" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Evaluating user attempt`);
    console.log("Target notes:", targetSequence.notes?.length || 0);
    console.log("User notes:", userSequence.notes?.length || 0);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Create a simplified comparison for the AI
    const targetSummary = (targetSequence.notes || []).map((n: Note) => ({
      pitch: n.pitch,
      duration: Math.round((n.endTime - n.startTime) * 10) / 10,
      start: Math.round(n.startTime * 10) / 10,
    }));

    const userSummary = (userSequence.notes || []).map((n: Note) => ({
      pitch: n.pitch,
      duration: Math.round((n.endTime - n.startTime) * 10) / 10,
      start: Math.round(n.startTime * 10) / 10,
    }));

    const systemPrompt = `You are a friendly, casual piano teacher giving quick feedback on a student's attempt.

The lesson was: "${instruction || 'Play the sequence'}"

TARGET SEQUENCE (what they should play):
${JSON.stringify(targetSummary, null, 2)}

USER'S ATTEMPT:
${JSON.stringify(userSummary, null, 2)}

Respond with ONLY a JSON object:
{
  "evaluation": "correct" | "close" | "wrong",
  "feedback": "Short casual comment (max 8 words)"
}

EVALUATION CRITERIA (BE LENIENT):
- "correct": The pitches are in the correct order. Timing doesn't matter!
- "close": Most pitches correct but 1 note is wrong or missing
- "wrong": Multiple wrong notes or completely different sequence

FEEDBACK STYLE - Be conversational and varied! Examples:
- "Great!" / "Perfect!" / "Nailed it!" / "Nice work!"
- "The notes are right, watch the timing"
- "Second note was off - try again"
- "Close! Third note needs work"
- "You're getting there!"
- "Almost! One note was wrong"
- "Keep at it, listen again"

Keep it SHORT and natural, like a friend giving feedback.`;

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
          { role: "user", content: "Evaluate this attempt." },
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
      throw new Error("AI returned empty response");
    }

    console.log("AI evaluation:", aiMessage);

    let evaluation: EvaluationResponse;

    try {
      const jsonMatch = aiMessage.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        evaluation = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON object found");
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      // Simple fallback evaluation based on note count comparison
      const targetNotes = targetSequence.notes?.length || 0;
      const userNotes = userSequence.notes?.length || 0;
      
      if (Math.abs(targetNotes - userNotes) <= 1) {
        evaluation = { evaluation: "close", feedback: "Good try! Keep practicing." };
      } else {
        evaluation = { evaluation: "wrong", feedback: "Try again!" };
      }
    }

    // Validate evaluation
    if (!["correct", "close", "wrong"].includes(evaluation.evaluation)) {
      evaluation.evaluation = "close";
    }
    if (!evaluation.feedback || typeof evaluation.feedback !== "string") {
      evaluation.feedback = "Keep practicing!";
    }

    console.log("Final evaluation:", JSON.stringify(evaluation));

    return new Response(JSON.stringify(evaluation), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in piano-evaluate function:", error);
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
