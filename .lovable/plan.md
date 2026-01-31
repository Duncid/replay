

# Plan: Add DSP XML Storage to tune_assets Table

## Overview

Add support for storing the new `dsp.xml` (DSP = Display) MusicXML files in the database alongside the existing `tune.xml` files. These appear to be an alternative/processed version of MusicXML for rendering purposes.

## Current State

**File Structure (discovered):**
- `output/tune.xml` - Full tune MusicXML (already stored)
- `output/dsp.xml` - **NEW** Full tune DSP MusicXML
- `output/dsp.lh.xml` / `output/dsp.rh.xml` - **NEW** Left/right hand DSP variants (for gymnopdie)
- `output/nuggets/N1.xml` - Nugget MusicXML (already stored)
- `output/nuggets/N1.dsp.xml` - **NEW** Nugget DSP MusicXML
- `output/nuggets/N1.lh.dsp.xml` / `N1.rh.dsp.xml` - **NEW** Hand-separated DSP variants
- `output/assemblies/A1.dsp.xml` - **NEW** Assembly DSP MusicXML

**Database (`tune_assets` table) - Current Columns:**
- `tune_xml` (text) - Full tune MusicXML
- `nugget_xmls` (jsonb) - `{"N1": "<xml>..."}`
- `assembly_xmls` (jsonb) - `{"A1": "<xml>..."}`

---

## Design Decision: How to Store DSP XMLs

There are two main approaches:

### Option A: Add New Columns (Recommended)

Add three new columns mirroring the existing XML columns:
- `tune_dsp_xml` (text) - Main DSP XML string
- `nugget_dsp_xmls` (jsonb) - `{"N1": "<xml>...", "N1.lh": "<xml>...", "N1.rh": "<xml>..."}`
- `assembly_dsp_xmls` (jsonb) - Same pattern

**Pros:**
- Clear separation between original XML and DSP XML
- Easy to query and reason about
- Consistent with current pattern

**Cons:**
- More columns on the table

### Option B: Nest in Existing JSONB Columns

Store DSP XMLs nested within the existing jsonb structures:
- `nugget_xmls`: `{"N1": {"xml": "<xml>...", "dsp": "<xml>...", "lhDsp": "<xml>...", "rhDsp": "<xml>..."}}`

**Pros:**
- No schema change
- Groups all XMLs for a nugget together

**Cons:**
- Breaking change for existing code consuming `nugget_xmls`
- More complex to query

**Recommendation:** Option A (new columns) is cleaner and backward compatible.

---

## Implementation Steps

### Step 1: Database Migration

Add three new columns to `tune_assets`:

```sql
ALTER TABLE tune_assets
  ADD COLUMN tune_dsp_xml text,
  ADD COLUMN nugget_dsp_xmls jsonb,
  ADD COLUMN assembly_dsp_xmls jsonb;

COMMENT ON COLUMN tune_assets.tune_dsp_xml IS 'Full tune DSP MusicXML for display rendering';
COMMENT ON COLUMN tune_assets.nugget_dsp_xmls IS 'Mapping of nugget ID to DSP XML strings, including .lh/.rh variants';
COMMENT ON COLUMN tune_assets.assembly_dsp_xmls IS 'Mapping of assembly ID to DSP XML strings, including .lh/.rh variants';
```

**Column Details:**
| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `tune_dsp_xml` | text | Main DSP MusicXML string | Raw XML |
| `nugget_dsp_xmls` | jsonb | Map of ID to DSP XML | `{"N1": "<xml>", "N1.lh": "<xml>", "N1.rh": "<xml>"}` |
| `assembly_dsp_xmls` | jsonb | Map of ID to DSP XML | `{"A1": "<xml>", "A1.lh": "<xml>"}` |

---

### Step 2: Add Vite Glob Imports for DSP XML Files

**File: `src/components/QuestEditor.tsx`**

Add new glob imports for DSP files:

```typescript
// Pre-load all DSP XML files at build time
const tuneDspXmlModules = import.meta.glob<string>(
  "/src/music/*/output/dsp.xml",
  { eager: true, query: "?raw", import: "default" }
);

const tuneLhDspXmlModules = import.meta.glob<string>(
  "/src/music/*/output/dsp.lh.xml",
  { eager: true, query: "?raw", import: "default" }
);

const tuneRhDspXmlModules = import.meta.glob<string>(
  "/src/music/*/output/dsp.rh.xml",
  { eager: true, query: "?raw", import: "default" }
);

const nuggetDspXmlModules = import.meta.glob<string>(
  "/src/music/*/output/nuggets/*.dsp.xml",
  { eager: true, query: "?raw", import: "default" }
);

const assemblyDspXmlModules = import.meta.glob<string>(
  "/src/music/*/output/assemblies/*.dsp.xml",
  { eager: true, query: "?raw", import: "default" }
);
```

Add helper functions:

```typescript
const getTuneDspXml = (musicRef: string): string | null => {
  const path = `/src/music/${musicRef}/output/dsp.xml`;
  return tuneDspXmlModules[path] || null;
};

const getTuneLhDspXml = (musicRef: string): string | null => {
  const path = `/src/music/${musicRef}/output/dsp.lh.xml`;
  return tuneLhDspXmlModules[path] || null;
};

const getTuneRhDspXml = (musicRef: string): string | null => {
  const path = `/src/music/${musicRef}/output/dsp.rh.xml`;
  return tuneRhDspXmlModules[path] || null;
};

const getNuggetDspXml = (musicRef: string, nuggetId: string): string | null => {
  // Match patterns like N1.dsp.xml, N1.lh.dsp.xml, N1.rh.dsp.xml
  const path = `/src/music/${musicRef}/output/nuggets/${nuggetId}.dsp.xml`;
  return nuggetDspXmlModules[path] || null;
};

const getAssemblyDspXml = (musicRef: string, assemblyId: string): string | null => {
  const path = `/src/music/${musicRef}/output/assemblies/${assemblyId}.dsp.xml`;
  return assemblyDspXmlModules[path] || null;
};
```

---

### Step 3: Update TuneAssetBundle Type

**File: `src/components/QuestEditor.tsx`**

Extend the interface with new DSP fields:

```typescript
interface TuneAssetBundle {
  // ... existing fields ...
  tuneXml?: string;
  nuggetXmls?: Record<string, string>;
  assemblyXmls?: Record<string, string>;
  
  // NEW: DSP XML fields
  tuneDspXml?: string;
  nuggetDspXmls?: Record<string, string>;   // {"N1": "...", "N1.lh": "...", "N1.rh": "..."}
  assemblyDspXmls?: Record<string, string>; // {"A1": "...", "A1.lh": "...", "A1.rh": "..."}
}
```

---

### Step 4: Update bundleTuneAssets Function

**File: `src/components/QuestEditor.tsx`**

In the bundling loop, collect DSP XMLs:

```typescript
// Load main tune DSP XML
const tuneDspXml = getTuneDspXml(musicRef);

// Build nugget DSP XMLs map (including .lh and .rh variants)
const nuggetDspXmls: Record<string, string> = {};
if (teacherNuggets && Array.isArray(teacherNuggets)) {
  for (const nugget of teacherNuggets) {
    // Main DSP
    const dspXml = getNuggetDspXml(musicRef, nugget.id);
    if (dspXml) {
      nuggetDspXmls[nugget.id] = dspXml;
    }
    // Left hand DSP
    const lhDspXml = getNuggetDspXml(musicRef, `${nugget.id}.lh`);
    if (lhDspXml) {
      nuggetDspXmls[`${nugget.id}.lh`] = lhDspXml;
    }
    // Right hand DSP
    const rhDspXml = getNuggetDspXml(musicRef, `${nugget.id}.rh`);
    if (rhDspXml) {
      nuggetDspXmls[`${nugget.id}.rh`] = rhDspXml;
    }
  }
}

// Build assembly DSP XMLs map (same pattern)
const assemblyDspXmls: Record<string, string> = {};
if (teacherAssemblies && Array.isArray(teacherAssemblies)) {
  for (const assembly of teacherAssemblies) {
    const dspXml = getAssemblyDspXml(musicRef, assembly.id);
    if (dspXml) {
      assemblyDspXmls[assembly.id] = dspXml;
    }
    // Left hand DSP
    const lhDspXml = getAssemblyDspXml(musicRef, `${assembly.id}.lh`);
    if (lhDspXml) {
      assemblyDspXmls[`${assembly.id}.lh`] = lhDspXml;
    }
    // Right hand DSP
    const rhDspXml = getAssemblyDspXml(musicRef, `${assembly.id}.rh`);
    if (rhDspXml) {
      assemblyDspXmls[`${assembly.id}.rh`] = rhDspXml;
    }
  }
}

// Add to asset bundle
tuneAssets[tuneKey] = {
  // ... existing fields ...
  tuneDspXml: tuneDspXml || undefined,
  nuggetDspXmls: Object.keys(nuggetDspXmls).length > 0 ? nuggetDspXmls : undefined,
  assemblyDspXmls: Object.keys(assemblyDspXmls).length > 0 ? assemblyDspXmls : undefined,
};
```

---

### Step 5: Update curriculum-publish Edge Function

**File: `supabase/functions/curriculum-publish/index.ts`**

Update the TuneAssetBundle interface:

```typescript
interface TuneAssetBundle {
  // ... existing fields ...
  tuneXml?: string;
  nuggetXmls?: Record<string, string>;
  assemblyXmls?: Record<string, string>;
  // NEW: DSP XML fields
  tuneDspXml?: string;
  nuggetDspXmls?: Record<string, string>;
  assemblyDspXmls?: Record<string, string>;
}
```

Update the database insert to include new columns:

```typescript
return {
  version_id: versionId,
  tune_key: tuneKey,
  // ... existing columns ...
  tune_xml: assets.tuneXml || null,
  nugget_xmls: assets.nuggetXmls || null,
  assembly_xmls: assets.assemblyXmls || null,
  // NEW: DSP XML columns
  tune_dsp_xml: assets.tuneDspXml || null,
  nugget_dsp_xmls: assets.nuggetDspXmls || null,
  assembly_dsp_xmls: assets.assemblyDspXmls || null,
};
```

---

### Step 6: Update Logging

Add DSP counts to the bundling log:

```typescript
console.log(`[QuestEditor] Bundled tune assets for ${tuneKey}:`, {
  // ... existing fields ...
  hasTuneXml: !!tuneXml,
  nuggetXmlCount: Object.keys(nuggetXmls).length,
  assemblyXmlCount: Object.keys(assemblyXmls).length,
  // NEW
  hasTuneDspXml: !!tuneDspXml,
  nuggetDspXmlCount: Object.keys(nuggetDspXmls).length,
  assemblyDspXmlCount: Object.keys(assemblyDspXmls).length,
});
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| Database migration | Create | Add `tune_dsp_xml`, `nugget_dsp_xmls`, `assembly_dsp_xmls` columns |
| `src/components/QuestEditor.tsx` | Modify | Add DSP glob imports, helpers, update TuneAssetBundle type, update bundleTuneAssets |
| `supabase/functions/curriculum-publish/index.ts` | Modify | Update TuneAssetBundle interface, include DSP XML in database insert |

---

## Technical Notes

- **File Naming Convention**: The glob pattern `*.dsp.xml` will match both `N1.dsp.xml` and `N1.lh.dsp.xml` / `N1.rh.dsp.xml`
- **JSONB Key Format**: Using `{"N1": "...", "N1.lh": "...", "N1.rh": "..."}` keeps lookup simple and flat
- **Backward Compatible**: All new columns are nullable, existing tunes without DSP XMLs will have null values
- **Storage Consideration**: DSP XMLs are similar size to regular XMLs; the gymnopdie dsp.xml is ~4000 lines vs tune.xml at similar size

