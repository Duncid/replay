

# Plan: Replace LabMode Static Imports with Database Fetching

## Overview

Refactor LabMode to fetch tune assets from the database instead of using Vite `import.meta.glob` static imports. This will enable Lab mode to work with published curriculum data, ensuring consistency with the production runtime.

## Current State

**LabMode Asset Loading (Static Imports):**
- Uses 9 separate `import.meta.glob` patterns for:
  - `teacher.json` (for nugget/assembly IDs)
  - `tune.ns.json`, `tune.xml`, `dsp.xml` (full tune)
  - `nuggets/*.ns.json`, `nuggets/*.xml`, `nuggets/*.dsp.xml`
  - `assemblies/*.ns.json`, `assemblies/*.xml`, `assemblies/*.dsp.xml`
- Assets are bundled at build time and accessed synchronously

**Database (`tune_assets` table) - Available Columns:**
| Column | Type | Contains |
|--------|------|----------|
| `note_sequence` | jsonb | Full tune NoteSequence |
| `tune_xml` | text | Full tune MusicXML |
| `tune_dsp_xml` | text | Full tune DSP MusicXML |
| `nuggets` | jsonb (array) | Array of `{id, noteSequence, ...}` objects |
| `nugget_xmls` | jsonb (object) | `{"N1": "<xml>..."}` |
| `nugget_dsp_xmls` | jsonb (object) | `{"N1": "<xml>..."}` |
| `assemblies` | jsonb (array) | Array of `{id, noteSequence, nuggetIds, ...}` objects |
| `assembly_xmls` | jsonb (object) | `{"A1": "<xml>..."}` |
| `assembly_dsp_xmls` | jsonb (object) | `{"A1": "<xml>..."}` |
| `briefing` | jsonb | Contains `teachingOrder`, `assemblyOrder`, `title`, etc. |

**Existing Hook:**
- `useTuneAssets(tuneKey)` already fetches from `tune_assets` table
- Currently orders by `created_at DESC` (should use `published_at` via join)

---

## Implementation Steps

### Step 1: Enhance useTuneAssets Hook

**File: `src/hooks/useTuneQueries.ts`**

Update the hook to properly join with `curriculum_versions` and filter by `status = 'published'`:

```typescript
export function useTuneAssets(tuneKey: string | null) {
  return useQuery({
    queryKey: ["tune-assets", tuneKey],
    queryFn: async () => {
      if (!tuneKey) return null;

      // Query tune_assets joined with curriculum_versions
      // to get the most recently published version
      const { data, error } = await supabase
        .from("tune_assets")
        .select(`
          *,
          curriculum_versions!inner (
            status,
            published_at
          )
        `)
        .eq("tune_key", tuneKey)
        .eq("curriculum_versions.status", "published")
        .order("curriculum_versions.published_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!tuneKey,
  });
}
```

---

### Step 2: Create a New Hook for Lab Mode Tune List

**File: `src/hooks/useTuneQueries.ts`**

Add a hook to fetch all available tune keys from published curriculum:

```typescript
export function usePublishedTuneKeys() {
  return useQuery({
    queryKey: ["published-tune-keys"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tune_assets")
        .select(`
          tune_key,
          briefing,
          curriculum_versions!inner (
            status,
            published_at
          )
        `)
        .eq("curriculum_versions.status", "published")
        .order("curriculum_versions.published_at", { ascending: false });

      if (error) throw new Error(error.message);

      // Dedupe by tune_key (take the most recent published)
      const seen = new Set<string>();
      return (data ?? []).filter(item => {
        if (seen.has(item.tune_key)) return false;
        seen.add(item.tune_key);
        return true;
      });
    },
  });
}
```

---

### Step 3: Define TypeScript Interfaces for Tune Assets

**File: `src/types/tuneAssets.ts`** (new file)

Create typed interfaces for the data structure returned from the database:

```typescript
import type { NoteSequence } from "./noteSequence";

export interface TuneNugget {
  id: string;
  noteSequence: NoteSequence;
  leftHandSequence?: NoteSequence | null;
  rightHandSequence?: NoteSequence | null;
  location?: {
    startMeasure: number;
    endMeasure: number;
    startBeat: number;
    endBeat: number;
  };
  dependsOn?: string[];
}

export interface TuneAssembly {
  id: string;
  noteSequence: NoteSequence;
  leftHandSequence?: NoteSequence | null;
  rightHandSequence?: NoteSequence | null;
  nuggetIds: string[];
  tier?: number;
}

export interface TuneBriefing {
  title?: string;
  teachingOrder?: string[];
  assemblyOrder?: string[];
  // ... other fields
}

export interface TuneAssetData {
  id: string;
  tune_key: string;
  version_id: string;
  note_sequence: NoteSequence;
  tune_xml: string | null;
  tune_dsp_xml: string | null;
  nuggets: TuneNugget[] | null;
  nugget_xmls: Record<string, string> | null;
  nugget_dsp_xmls: Record<string, string> | null;
  assemblies: TuneAssembly[] | null;
  assembly_xmls: Record<string, string> | null;
  assembly_dsp_xmls: Record<string, string> | null;
  briefing: TuneBriefing | null;
}
```

---

### Step 4: Refactor LabMode Component

**File: `src/components/modes/LabMode.tsx`**

Replace the static imports with database queries:

**Remove:** All `import.meta.glob` statements and their helper functions (lines 29-109)

**Add:** Query hooks and derived state:

```typescript
import { useTuneAssets, usePublishedTuneKeys } from "@/hooks/useTuneQueries";

// Inside component:
const { data: tuneList, isLoading: isLoadingList } = usePublishedTuneKeys();
const tuneOptions = useMemo(
  () => tuneList?.map(t => t.tune_key) ?? [],
  [tuneList]
);

const { data: tuneAssets, isLoading: isLoadingAssets } = useTuneAssets(selectedTune);

// Derive nugget/assembly IDs from database briefing
const nuggetIds = useMemo(() => {
  const briefing = tuneAssets?.briefing as TuneBriefing | null;
  return briefing?.teachingOrder ?? [];
}, [tuneAssets]);

const assemblyIds = useMemo(() => {
  const briefing = tuneAssets?.briefing as TuneBriefing | null;
  return briefing?.assemblyOrder ?? [];
}, [tuneAssets]);

// Derive sequences from database
const labSequence = useMemo(() => {
  if (!tuneAssets) return EMPTY_SEQUENCE;
  
  if (selectedTarget === "full") {
    return (tuneAssets.note_sequence as NoteSequence) ?? EMPTY_SEQUENCE;
  }
  
  if (selectedTarget === "assemblies") {
    const assemblies = tuneAssets.assemblies as TuneAssembly[] | null;
    const assembly = assemblies?.find(a => a.id === selectedItemId);
    return assembly?.noteSequence ?? EMPTY_SEQUENCE;
  }
  
  const nuggets = tuneAssets.nuggets as TuneNugget[] | null;
  const nugget = nuggets?.find(n => n.id === selectedItemId);
  return nugget?.noteSequence ?? EMPTY_SEQUENCE;
}, [tuneAssets, selectedTarget, selectedItemId]);

// Derive XMLs from database
const xmlFull = useMemo(() => {
  if (!tuneAssets) return null;
  if (selectedTarget === "full") return tuneAssets.tune_xml;
  if (selectedTarget === "assemblies") {
    const xmls = tuneAssets.assembly_xmls as Record<string, string> | null;
    return xmls?.[selectedItemId] ?? null;
  }
  const xmls = tuneAssets.nugget_xmls as Record<string, string> | null;
  return xmls?.[selectedItemId] ?? null;
}, [tuneAssets, selectedTarget, selectedItemId]);

const xmlDsp = useMemo(() => {
  if (!tuneAssets) return null;
  if (selectedTarget === "full") return tuneAssets.tune_dsp_xml;
  if (selectedTarget === "assemblies") {
    const xmls = tuneAssets.assembly_dsp_xmls as Record<string, string> | null;
    return xmls?.[selectedItemId] ?? null;
  }
  const xmls = tuneAssets.nugget_dsp_xmls as Record<string, string> | null;
  return xmls?.[selectedItemId] ?? null;
}, [tuneAssets, selectedTarget, selectedItemId]);
```

**Update UI:** Add loading states for when data is being fetched:

```typescript
if (isLoadingList || isLoadingAssets) {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <p className="text-muted-foreground">Loading tune assets...</p>
    </div>
  );
}
```

---

### Step 5: Update Dropdown to Use Dynamic Tune List

**File: `src/components/modes/LabMode.tsx`**

The dropdown now uses `tuneOptions` from the database instead of a hardcoded array:

```typescript
// Before (hardcoded):
const tuneOptions = ["intro", "gymnopdie", "st-louis-blues"] as const;

// After (dynamic from DB):
const tuneOptions = useMemo(
  () => tuneList?.map(t => t.tune_key) ?? [],
  [tuneList]
);
```

---

### Step 6: Handle Edge Cases

1. **No published tunes:** Show an empty state message
2. **Selected tune not found:** Reset selection when tune is removed from published set
3. **Missing XML data:** Show fallback UI when XMLs are null (some tunes may not have all XML variants)

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/types/tuneAssets.ts` | Create | TypeScript interfaces for tune asset data |
| `src/hooks/useTuneQueries.ts` | Modify | Enhance `useTuneAssets` with proper join, add `usePublishedTuneKeys` |
| `src/components/modes/LabMode.tsx` | Modify | Remove static imports, use DB queries, add loading states |

---

## Data Flow Diagram

```text
+-------------------+     +----------------------+     +------------------+
| usePublishedTune  | --> | Dropdown shows       | --> | User selects     |
| Keys() hook       |     | available tune_keys  |     | a tune           |
+-------------------+     +----------------------+     +------------------+
                                                               |
                                                               v
                          +----------------------+     +------------------+
                          | useTuneAssets(key)   | <-- | selectedTune     |
                          | fetches full data    |     | state            |
                          +----------------------+     +------------------+
                                    |
                                    v
+------------------------------------------------------------------+
| Derived State (useMemo):                                         |
|   - nuggetIds from briefing.teachingOrder                        |
|   - assemblyIds from briefing.assemblyOrder                      |
|   - labSequence from note_sequence / nuggets[].noteSequence      |
|   - xmlFull from tune_xml / nugget_xmls / assembly_xmls          |
|   - xmlDsp from tune_dsp_xml / nugget_dsp_xmls / assembly_dsp_xmls|
+------------------------------------------------------------------+
                                    |
                                    v
                          +----------------------+
                          | OpenSheetMusicDisplay|
                          | renders XML          |
                          +----------------------+
```

---

## Technical Notes

- **Query Optimization:** The `useTuneAssets` hook fetches all columns at once since LabMode needs most of them. For a production app with large XMLs, consider lazy loading XMLs only when needed.
- **Caching:** React Query will cache the results, so switching between tunes won't re-fetch if data is fresh.
- **Backward Compatibility:** The hook still works if a tune has null XML columns (older published versions).
- **Type Safety:** The `Json` type from Supabase types requires casting to the specific interface; the new `tuneAssets.ts` file provides these types.

