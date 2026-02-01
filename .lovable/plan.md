
# Plan: Restrict Tune Node Selection to Published Tunes

## Overview

Update the Quest Editor so that Tune nodes can only reference tunes that have already been published to the database. This decouples tune asset management from curriculum publishing, simplifying the workflow.

## Current Flow (Being Changed)

```text
1. User creates Tune node in Quest Editor
2. User selects local folder from src/music/* as "musicRef"
3. On curriculum publish:
   - Frontend bundles all tune assets from local files
   - Sends large payload (~MB of JSON) to edge function
   - Edge function inserts tune_assets to DB
```

## New Flow (After Change)

```text
1. User publishes tunes via Tune Manager (already done)
2. User creates Tune node in Quest Editor
3. User selects from already-published tunes in DB
4. On curriculum publish:
   - Tunes already exist in tune_assets table
   - No bundling needed
   - Smaller, faster publish payload
```

---

## Technical Changes

### 1. QuestEditor.tsx - Add Published Tunes Hook

Import `usePublishedTuneKeys` and use it instead of `availableTunes`:

```typescript
import { usePublishedTuneKeys } from "@/hooks/useTuneQueries";

// Inside QuestEditor component:
const { data: publishedTuneList, isLoading: isLoadingTunes } = usePublishedTuneKeys();

// Transform to selector format
const availablePublishedTunes = useMemo(() => {
  if (!publishedTuneList) return [];
  return publishedTuneList.map(tune => ({
    key: tune.tune_key,
    label: tune.briefing?.title || tune.tune_key,
  }));
}, [publishedTuneList]);
```

### 2. QuestEditor.tsx - Update Tune Node Edit Form

Replace the current musicRef selector (lines 3379-3398) to use published tunes:

**Current code:**
```tsx
<Select value={editingMusicRef} onValueChange={setEditingMusicRef}>
  <SelectTrigger>
    <SelectValue placeholder="Select a tune folder..." />
  </SelectTrigger>
  <SelectContent>
    {availableTunes.map((tune) => (
      <SelectItem key={tune.key} value={tune.key}>
        {tune.label}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
<p className="text-xs text-muted-foreground">
  Select a folder from src/music/
</p>
```

**New code:**
```tsx
<Select 
  value={editingMusicRef} 
  onValueChange={setEditingMusicRef}
  disabled={isLoadingTunes}
>
  <SelectTrigger>
    <SelectValue placeholder={isLoadingTunes ? "Loading..." : "Select a published tune..."} />
  </SelectTrigger>
  <SelectContent>
    {availablePublishedTunes.length === 0 ? (
      <SelectItem value="" disabled>No published tunes available</SelectItem>
    ) : (
      availablePublishedTunes.map((tune) => (
        <SelectItem key={tune.key} value={tune.key}>
          {tune.label}
        </SelectItem>
      ))
    )}
  </SelectContent>
</Select>
<p className="text-xs text-muted-foreground">
  Only tunes published via Tune Manager can be selected
</p>
```

### 3. QuestEditor.tsx - Remove Tune Asset Bundling

The `bundleTuneAssets` function (lines 2142-2398) and all its supporting glob imports (lines 109-310) are no longer needed for publishing.

**Remove these imports/declarations:**
- `teacherModules`, `tuneNsModules`, `tuneLhModules`, `tuneRhModules`
- `nuggetNsModules`, `nuggetLhModules`, `nuggetRhModules`
- `assemblyNsModules`, `assemblyLhModules`, `assemblyRhModules`
- `tuneXmlModules`, `nuggetXmlModules`, `assemblyXmlModules`
- `tuneDspXmlModules`, `nuggetDspXmlModules`, `assemblyDspXmlModules`
- Helper functions: `getGlobModule`, `getTeacher`, `getTuneNs`, etc.
- `availableTunes` variable
- `TuneAssetBundle` interface (frontend version)
- `bundleTuneAssets` callback

**Simplify `confirmPublish`:**
```typescript
const confirmPublish = useCallback(async () => {
  if (!currentGraph) return;

  setIsPublishing(true);

  try {
    // No longer bundling tune assets - they're already published
    console.log("[QuestEditor] Publishing curriculum (tunes already in DB)");

    const { data, error } = await supabase.functions.invoke(
      "curriculum-publish",
      {
        body: {
          questGraphId: currentGraph.id,
          publishTitle: publishDialogTitle.trim() || undefined,
          mode: "publish",
          // tuneAssets no longer sent
        },
      },
    );
    // ... rest unchanged
  }
}, [currentGraph, publishDialogTitle, toast]);
```

### 4. curriculum-publish Edge Function - Handle Pre-Published Tunes

Update the edge function to no longer require `tuneAssets` in the payload. Instead, verify that referenced tunes exist in the database.

**Changes in supabase/functions/curriculum-publish/index.ts:**

1. Remove `TuneAssetBundle` interface (no longer receiving from frontend)
2. Remove `tuneAssets` from request body destructuring
3. Add validation that referenced tune_keys exist in tune_assets table
4. Remove tune_assets insertion logic (step 5)

**Add validation for existing tune assets:**
```typescript
// After transformToRuntime(), validate tune references exist in DB
const tuneNodes = runtimeData.nodes.filter(n => n.kind === "tune");
const tuneKeys = tuneNodes.map(n => n.key);

if (tuneKeys.length > 0) {
  // Check that all referenced tunes exist in tune_assets (any version)
  const { data: existingTunes, error: tuneCheckError } = await supabase
    .from("tune_assets")
    .select("tune_key")
    .in("tune_key", tuneKeys);

  if (tuneCheckError) {
    console.error("[curriculum-publish] Failed to verify tune assets:", tuneCheckError);
  } else {
    const existingKeys = new Set((existingTunes || []).map(t => t.tune_key));
    const missingTunes = tuneKeys.filter(k => !existingKeys.has(k));
    
    if (missingTunes.length > 0) {
      allErrors.push({
        type: "missing_tune_assets",
        message: `Tune assets not found in database: ${missingTunes.join(", ")}. Publish these tunes via Tune Manager first.`,
      });
    }
  }
}
```

**Remove tune asset insertion (lines 840-903):**
The entire section that inserts `tuneAssets` into the database can be removed since:
- Tunes are published separately via `tune-publish` edge function
- Each tune already has a `version_id` from when it was published

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/QuestEditor.tsx` | 1. Add `usePublishedTuneKeys` hook import and usage 2. Replace `availableTunes` with `availablePublishedTunes` 3. Update tune selector UI to show published tunes 4. Remove glob imports and bundling logic 5. Simplify `confirmPublish` to not send tuneAssets |
| `supabase/functions/curriculum-publish/index.ts` | 1. Remove `TuneAssetBundle` interface 2. Remove `tuneAssets` from request handling 3. Add validation that referenced tunes exist in DB 4. Remove tune_assets insertion logic |

---

## Validation Behavior

**During Dry Run / Validation:**
- Check that all Tune nodes have `tuneKey` set
- Verify each `tuneKey` exists in `tune_assets` table
- Show error if any tunes are missing: "Tune assets not found: X, Y. Publish via Tune Manager first."

**During Publish:**
- Same validation as dry run
- Block publish if any tune assets are missing
- No longer insert tune assets (they already exist)

---

## UI Changes Summary

**Before:**
```text
Music Reference: [Select a tune folder...  ▾]
  - st-louis-blues (from local files)
  - hot-house (from local files)
  
Hint: Select a folder from src/music/
```

**After:**
```text
Music Reference: [Select a published tune... ▾]
  - St. Louis Blues (from database)
  - Hot House (from database)
  
Hint: Only tunes published via Tune Manager can be selected
```

---

## Benefits

1. **Smaller publish payloads** - No longer sending MB of tune data
2. **Faster publishing** - Skip bundling and asset serialization
3. **Single source of truth** - Tunes managed exclusively via Tune Manager
4. **Clearer workflow** - Publish tunes first, then reference in curriculum
5. **Reduced code complexity** - Remove ~300 lines of glob/bundling code
