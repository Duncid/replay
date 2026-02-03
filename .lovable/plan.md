
# Plan: Preload Audio Engine to Eliminate First-Note Delay

## Problem Summary

When playing the first notes, there's noticeable latency because:
1. The AudioContext may be suspended (browser autoplay policy)
2. For sampled instruments, audio samples are loaded from a CDN on-demand
3. Preload is only called in specific modes (TuneMode), not globally

## Root Cause Analysis

| Issue | Location | Impact |
|-------|----------|--------|
| AudioContext suspended | Browser policy | ~50-100ms delay on first sound |
| Sample files not preloaded | useTonePiano.ts | ~200-500ms delay for network fetch |
| Preload only in TuneMode | Index.tsx:1412-1416 | Other modes have no preloading |
| No warmup on instrument change | Index.tsx | Switching instruments causes delay |

## Solution Overview

Trigger audio preloading immediately after the first user interaction, regardless of which mode the user is in. This ensures samples are loaded before the user touches the piano.

## Technical Changes

### 1. Expand Warmup to Include Full Preload (Index.tsx)

Currently, `warmupAudio` only calls `ensureAudioReady()`. Change it to also call `preload()`:

```typescript
// Before (line 340-342):
const warmupAudio = () => {
  pianoRef.current?.ensureAudioReady();
};

// After:
const warmupAudio = async () => {
  await pianoRef.current?.ensureAudioReady();
  await pianoRef.current?.preload();
};
```

### 2. Add Preload on Instrument Change (Index.tsx)

When the user changes instruments, preload the new samples:

```typescript
// Add new useEffect after hasUserInteracted warmup effect (~line 363)
useEffect(() => {
  if (!hasUserInteractedRef.current) return;
  pianoRef.current?.preload();
}, [pianoSoundType]);
```

### 3. Remove Mode-Conditional Preload (Index.tsx)

The existing TuneMode-specific preload (lines 1412-1416) becomes redundant:

```typescript
// Before:
useEffect(() => {
  if (!hasUserInteractedRef.current) return;
  if (activeMode !== "learn" || !isInTuneMode) return;
  pianoRef.current?.preload();
}, [activeMode, isInTuneMode, pianoSoundType]);

// After: Remove this effect entirely (covered by global preload)
```

### 4. Ensure Preload Awaits Load Completion (useTonePiano.ts)

The current `preload()` implementation already awaits `loadPromiseRef.current`, but verify it properly chains:

```typescript
const preload = useCallback(async () => {
  if (soundTypeRef.current === null) return;
  try {
    await ensureAudioReady();        // Resume AudioContext + Tone.start()
    await loadPromiseRef.current;    // Wait for samples to load
  } catch (error) {
    console.warn("[AudioEngine] Preload skipped:", error);
  }
}, [ensureAudioReady]);
```

This is already correct.

### 5. Add Loading State Visibility (Optional Enhancement)

The Piano component already shows a loading indicator when `!audio.isLoaded`. No changes needed here.

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Index.tsx` | 1. Update warmupAudio to call preload() 2. Add useEffect to preload on instrument change 3. Remove TuneMode-specific preload effect |

## Implementation Details

### Change 1: Update warmupAudio function

**Location**: `src/pages/Index.tsx` lines 339-346

```typescript
useEffect(() => {
  const warmupAudio = async () => {
    await pianoRef.current?.ensureAudioReady();
    await pianoRef.current?.preload();
  };

  const handleFirstInteraction = () => {
    hasUserInteractedRef.current = true;
    warmupAudio();
    document.removeEventListener("pointerdown", handleFirstInteraction);
    document.removeEventListener("touchstart", handleFirstInteraction);
  };

  document.addEventListener("pointerdown", handleFirstInteraction, {
    once: true,
  });
  document.addEventListener("touchstart", handleFirstInteraction, {
    once: true,
  });

  return () => {
    document.removeEventListener("pointerdown", handleFirstInteraction);
    document.removeEventListener("touchstart", handleFirstInteraction);
  };
}, []);
```

### Change 2: Add instrument change preload

**Location**: Add after line 362 in `src/pages/Index.tsx`

```typescript
// Preload audio samples when instrument changes
useEffect(() => {
  if (!hasUserInteractedRef.current) return;
  pianoRef.current?.preload();
}, [pianoSoundType]);
```

### Change 3: Remove redundant TuneMode preload

**Location**: `src/pages/Index.tsx` lines 1412-1416

Delete this entire useEffect:
```typescript
// DELETE THIS:
useEffect(() => {
  if (!hasUserInteractedRef.current) return;
  if (activeMode !== "learn" || !isInTuneMode) return;
  pianoRef.current?.preload();
}, [activeMode, isInTuneMode, pianoSoundType]);
```

## Expected Behavior After Fix

1. **First interaction** → AudioContext resumes + samples start loading
2. **Instrument switch** → New samples preload immediately
3. **First key press** → Instant sound (no network delay)
4. **Loading indicator** → Shows while samples download (already implemented)

## Testing Checklist

- [ ] Switch to "Acoustic Piano" instrument and verify loading indicator appears
- [ ] After loading completes, press a key - sound should be immediate
- [ ] Switch between instruments - each should preload before use
- [ ] Works in all modes: Play, Learn, Lab
