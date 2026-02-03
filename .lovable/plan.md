
# Fix: Stale Closure in TuneMode Evaluation

## Problem Summary

The debug sheet shows "No prompt available" because the `handleEvaluate` function is called with a stale closure where `debugMode` is `false`, even when debug mode is actually enabled.

## Root Cause

In `TuneMode.tsx`, the `setTimeout` callback (lines 157-190) captures a reference to `handleEvaluate` at the moment the useEffect runs. Since `handleEvaluate` is a regular function (not memoized), each render creates a new version. The timeout callback holds onto the old version, which may have `debugMode = false` in its closure.

## Technical Details

```text
Timeline of the bug:
1. Component mounts, debugMode = false (initial/default)
2. Recording stops, useEffect creates setTimeout with handleEvaluate[v1] (debugMode=false)
3. debugMode becomes true (user already had it enabled, or localStorage loads)
4. Timeout fires, calls handleEvaluate[v1] with stale debugMode=false
5. if(debugMode) branch is skipped, no debug request made
6. UI shows debug button (current render has debugMode=true) but "No prompt available"
```

## Solution

Wrap `handleEvaluate` in `useCallback` with proper dependencies, including `debugMode`. This ensures the timeout always calls the most current version of the function.

## Files to Modify

| File | Change |
|------|--------|
| `src/components/modes/TuneMode.tsx` | Wrap `handleEvaluate` in `useCallback` with dependencies: `debugMode`, `tuneKey`, `currentNugget`, `localUserId`, `language`, `evaluateAttempt`, state setters |

## Code Changes

1. Import `useCallback` (already imported)

2. Convert `handleEvaluate` from:
```typescript
const handleEvaluate = async (recording: INoteSequence) => {
  // ... function body
};
```

To:
```typescript
const handleEvaluate = useCallback(async (recording: INoteSequence) => {
  // ... function body (unchanged)
}, [
  debugMode,
  tuneKey,
  currentNugget,
  localUserId,
  language,
  evaluateAttempt,
  updateEvaluation,
  onClearRecording,
  state.tuneTitle,
  state.currentIndex,
  state.practicePlan.length,
  t,
]);
```

3. Add `handleEvaluate` to the useEffect dependency array (line 201):
```typescript
}, [isRecording, currentRecording, state.phase, currentNugget, debugMode, 
    getRecordingId, getRecordingSignature, getRecordingStats, handleEvaluate]);
```

## Expected Outcome

After the fix:
- When debug mode is enabled, two requests will be made (one with `debug: true`, one with `debug: false`)
- The prompt will be extracted and set in `lastEvalPrompt`
- The debug sheet will show the actual LLM prompt instead of "No prompt available"
- The LLM reasoning (from our recent Chain-of-Thought feature) will also display correctly

## Testing

1. Enable debug mode via the toggle
2. Start tune practice
3. Record a performance
4. Wait for evaluation
5. Open the Debug sheet
6. Verify the Prompt section shows the full LLM prompt (not "No prompt available")
7. Verify the Answer section shows the evaluation result including `reasoning`
