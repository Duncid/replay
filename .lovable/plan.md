
# Plan: Add Reasoning Field to Force LLM to Show Its Work

## Overview

Add a mandatory `reasoning` field to the LLM tool call that forces it to compare notes one-by-one **before** making an evaluation decision. This Chain-of-Thought approach reduces hallucinations by making the LLM explicitly validate its analysis.

## Problem

The LLM is hallucinating evaluation results because it skips directly to a grade without verifying its note-by-note comparison. In your example, it claimed "incorrect pitches" when all 7 pitches were perfect matches.

## Solution

Force the LLM to output its reasoning **first** using a structured format that:
1. Shows the segment it chose to evaluate
2. Compares each note pitch: `72: good, 73: good, 71: mistake(expected 72), ...`
3. Notes any additions or missing notes
4. Explains timing assessment

## Technical Changes

### 1. Update LLM Tool Definition (tune-evaluate)

Add `reasoning` as the **first** required property:

```typescript
parameters: {
  type: "object",
  properties: {
    reasoning: {
      type: "string",
      description: `REQUIRED FIRST: Show your work by comparing the chosen segment note-by-note.
Format for pitch analysis: "Note 1: 72 vs 72 (good), Note 2: 73 vs 73 (good), Note 3: 71 vs 72 (mistake), Note 4: (addition), Note 5: (missing 66)"
Then briefly explain timing assessment.
This field MUST be completed before deciding the evaluation grade.`,
    },
    evaluation: {
      type: "string",
      enum: ["pass", "close", "fail"],
      description: "Overall evaluation based on the reasoning above",
    },
    // ... other fields unchanged
  },
  required: ["reasoning", "evaluation", "feedbackText", "successCount", "replayDemo"],
}
```

### 2. Update System Prompt

Add explicit instructions for the reasoning format:

```text
REASONING REQUIREMENT:
Before giving your evaluation, you MUST show your note-by-note comparison in the "reasoning" field.
Format: "Segment [start-end]: Note 1: [user pitch] vs [target pitch] (good/mistake), Note 2: ..."
For each note, mark as:
- "good" if pitches match
- "mistake([expected])" if pitch is wrong, showing what was expected
- "(addition)" if user played an extra note not in target
- "(missing [pitch])" if a target note was not played
Then briefly note timing observations.
Your evaluation grade MUST be consistent with this analysis.
```

### 3. Add Reasoning to Response

Include reasoning in the edge function response and debug data:

```typescript
// Parse from LLM
const evalResult = JSON.parse(toolCall.function.arguments) as {
  reasoning: string;  // NEW
  evaluation: "pass" | "close" | "fail";
  feedbackText: string;
  // ...
};

// Include in response
return new Response(
  JSON.stringify({
    evaluation: evalResult.evaluation,
    feedbackText: evalResult.feedbackText,
    reasoning: evalResult.reasoning,  // NEW
    // ...
  })
);
```

### 4. Update Response Type

Add `reasoning` to `TuneEvaluationResponse`:

```typescript
export interface TuneEvaluationResponse {
  evaluation: 'pass' | 'close' | 'fail';
  feedbackText: string;
  reasoning?: string;  // NEW
  // ... rest unchanged
}
```

### 5. Display Reasoning in Debug UI

Update `TuneEvaluationDebugCard` or feedback display to show the reasoning:

```tsx
{debugData.reasoning && (
  <div className="mt-2">
    <h4 className="text-sm font-medium mb-1">LLM Reasoning</h4>
    <pre className="text-xs bg-muted p-2 rounded whitespace-pre-wrap">
      {debugData.reasoning}
    </pre>
  </div>
)}
```

---

## Expected LLM Output

For the example you showed (perfect 7/7 match), the LLM would now output:

```json
{
  "reasoning": "Segment [0-6]: Note 1: 72 vs 72 (good), Note 2: 72 vs 72 (good), Note 3: 73 vs 73 (good), Note 4: 74 vs 74 (good), Note 5: 70 vs 70 (good), Note 6: 69 vs 69 (good), Note 7: 72 vs 72 (good). All 7 pitches match. Timing: slightly compressed but within 30% tolerance.",
  "evaluation": "pass",
  "feedbackText": "All notes correct with good timing!",
  "successCount": 1,
  "replayDemo": false
}
```

This forces the LLM to explicitly verify each pitch match before deciding the grade, making it much harder to hallucinate "incorrect pitches" when the reasoning clearly shows all matches.

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/tune-evaluate/index.ts` | Add `reasoning` to tool definition, update system prompt with reasoning format, include reasoning in response |
| `src/types/tunePractice.ts` | Add `reasoning?: string` to `TuneEvaluationResponse` |
| `src/components/TuneEvaluationDebugCard.tsx` | Display reasoning in debug view |

---

## Benefits

1. **Self-verification** - LLM must show its work before deciding
2. **Debuggable** - You can see exactly what the LLM compared
3. **Consistent** - Explicit comparison reduces hallucinations
4. **No code-side analysis needed** - Keeps evaluation in LLM domain
5. **Transparent** - Reasoning visible in debug mode for auditing
