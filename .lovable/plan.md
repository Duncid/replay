
# Plan: Add XML Storage to tune_assets Table

## Overview

This plan adds MusicXML storage to the `tune_assets` database table so that sheet music rendering can be decoupled from the frontend bundle. XML files already exist in `src/music/*/output/` and will be bundled alongside the existing JSON note sequences during curriculum publishing.

## Current State

**Database (`tune_assets` table):**
- `note_sequence` (jsonb) - Full tune note sequence
- `left_hand_sequence` / `right_hand_sequence` (jsonb) - Hand-specific sequences
- `nuggets` (jsonb) - Array of nugget definitions with note sequences
- `assemblies` (jsonb) - Array of assembly definitions with note sequences
- `briefing` (jsonb) - Teacher metadata

**Local Files (per tune):**
- `output/tune.xml` - Full tune MusicXML
- `output/nuggets/N1.xml`, `N2.xml`, etc. - Nugget MusicXML files
- `output/assemblies/A1.xml`, `A2.xml`, etc. - Assembly MusicXML files

**Current Flow:**
1. `QuestEditor.tsx` uses Vite `import.meta.glob` to pre-load `.ns.json` files
2. `bundleTuneAssets()` collects note sequences into a bundle
3. `curriculum-publish` edge function stores them in `tune_assets`

---

## Implementation Steps

### Step 1: Database Migration

Add three new columns to `tune_assets`:

```sql
ALTER TABLE tune_assets
  ADD COLUMN tune_xml text,
  ADD COLUMN nugget_xmls jsonb,
  ADD COLUMN assembly_xmls jsonb;
```

**Column Details:**
| Column | Type | Description |
|--------|------|-------------|
| `tune_xml` | text | Full tune MusicXML as string |
| `nugget_xmls` | jsonb | Object mapping nugget ID to XML string: `{"N1": "<xml>...</xml>", "N2": "..."}` |
| `assembly_xmls` | jsonb | Object mapping assembly ID to XML string: `{"A1": "<xml>...</xml>", "A2": "..."}` |

---

### Step 2: Add Vite Glob Imports for XML Files

**File: `src/components/QuestEditor.tsx`**

Add new glob imports alongside existing JSON imports:

```typescript
// Pre-load all tune XML files at build time
const tuneXmlModules = import.meta.glob<string>(
  "/src/music/*/output/tune.xml",
  { eager: true, query: '?raw', import: 'default' }
);

// Pre-load all nugget XML files
const nuggetXmlModules = import.meta.glob<string>(
  "/src/music/*/output/nuggets/*.xml",
  { eager: true, query: '?raw', import: 'default' }
);

// Pre-load all assembly XML files
const assemblyXmlModules = import.meta.glob<string>(
  "/src/music/*/output/assemblies/*.xml",
  { eager: true, query: '?raw', import: 'default' }
);
```

Add helper functions to retrieve XML content:

```typescript
const getTuneXml = (musicRef: string): string | null => {
  const path = `/src/music/${musicRef}/output/tune.xml`;
  return tuneXmlModules[path] || null;
};

const getNuggetXml = (musicRef: string, nuggetId: string): string | null => {
  const path = `/src/music/${musicRef}/output/nuggets/${nuggetId}.xml`;
  return nuggetXmlModules[path] || null;
};

const getAssemblyXml = (musicRef: string, assemblyId: string): string | null => {
  const path = `/src/music/${musicRef}/output/assemblies/${assemblyId}.xml`;
  return assemblyXmlModules[path] || null;
};
```

---

### Step 3: Update TuneAssetBundle Type

**File: `src/components/QuestEditor.tsx`**

Extend the `TuneAssetBundle` interface:

```typescript
interface TuneAssetBundle {
  // ... existing fields ...
  noteSequence: object;
  leftHandSequence?: object;
  rightHandSequence?: object;
  
  // NEW: XML fields
  tuneXml?: string;
  nuggetXmls?: Record<string, string>;   // { "N1": "<xml>...", "N2": "..." }
  assemblyXmls?: Record<string, string>; // { "A1": "<xml>...", "A2": "..." }
}
```

---

### Step 4: Update bundleTuneAssets Function

**File: `src/components/QuestEditor.tsx`**

In the `bundleTuneAssets` function, collect XML alongside JSON:

```typescript
// Load main tune XML
const tuneXml = getTuneXml(musicRef);

// Build nugget XMLs map
const nuggetXmls: Record<string, string> = {};
if (teacherNuggets && Array.isArray(teacherNuggets)) {
  for (const nugget of teacherNuggets) {
    const xml = getNuggetXml(musicRef, nugget.id);
    if (xml) {
      nuggetXmls[nugget.id] = xml;
    }
  }
}

// Build assembly XMLs map
const assemblyXmls: Record<string, string> = {};
if (teacherAssemblies && Array.isArray(teacherAssemblies)) {
  for (const assembly of teacherAssemblies) {
    const xml = getAssemblyXml(musicRef, assembly.id);
    if (xml) {
      assemblyXmls[assembly.id] = xml;
    }
  }
}

// Add to asset bundle
tuneAssets[tuneKey] = {
  // ... existing fields ...
  tuneXml: tuneXml || undefined,
  nuggetXmls: Object.keys(nuggetXmls).length > 0 ? nuggetXmls : undefined,
  assemblyXmls: Object.keys(assemblyXmls).length > 0 ? assemblyXmls : undefined,
};
```

---

### Step 5: Update curriculum-publish Edge Function

**File: `supabase/functions/curriculum-publish/index.ts`**

Update the `TuneAssetBundle` interface:

```typescript
interface TuneAssetBundle {
  briefing?: Record<string, unknown>;
  nuggets?: Array<Record<string, unknown>>;
  assemblies?: Array<Record<string, unknown>>;
  noteSequence: Record<string, unknown>;
  leftHandSequence?: Record<string, unknown>;
  rightHandSequence?: Record<string, unknown>;
  // NEW
  tuneXml?: string;
  nuggetXmls?: Record<string, string>;
  assemblyXmls?: Record<string, string>;
}
```

Update the database insert to include XML columns:

```typescript
const tuneAssetRows = Object.entries(tuneAssets).map(([tuneKey, assets]) => {
  // ... existing briefing merge logic ...
  
  return {
    version_id: versionId,
    tune_key: tuneKey,
    briefing: Object.keys(briefing).length > 0 ? briefing : null,
    note_sequence: assets.noteSequence,
    left_hand_sequence: assets.leftHandSequence || null,
    right_hand_sequence: assets.rightHandSequence || null,
    nuggets: assets.nuggets || null,
    assemblies: assets.assemblies || null,
    // NEW: XML columns
    tune_xml: assets.tuneXml || null,
    nugget_xmls: assets.nuggetXmls || null,
    assembly_xmls: assets.assemblyXmls || null,
  };
});
```

---

### Step 6: Add Logging for XML Bundling

Add console logs to track XML bundling success:

```typescript
console.log(`[QuestEditor] Bundled tune assets for ${tuneKey}:`, {
  hasBriefing: !!teacher,
  nuggetCount: enrichedNuggets?.length || 0,
  assemblyCount: enrichedAssemblies?.length || 0,
  hasLeftHand: !!leftHand,
  hasRightHand: !!rightHand,
  noteCount: noteSequence.notes?.length || 0,
  // NEW
  hasTuneXml: !!tuneXml,
  nuggetXmlCount: Object.keys(nuggetXmls).length,
  assemblyXmlCount: Object.keys(assemblyXmls).length,
});
```

---

## Summary of Files to Modify

| File | Changes |
|------|---------|
| Database migration | Add `tune_xml`, `nugget_xmls`, `assembly_xmls` columns |
| `src/components/QuestEditor.tsx` | Add XML glob imports, helper functions, update TuneAssetBundle type, update bundleTuneAssets |
| `supabase/functions/curriculum-publish/index.ts` | Update TuneAssetBundle interface, include XML in database insert |

---

## Expected Behavior After Implementation

1. **Build time**: Vite pre-loads all XML files as raw strings
2. **Publishing**: XML content is bundled with note sequences and stored in database
3. **Runtime**: Edge functions can retrieve XML from `tune_assets` for higher-fidelity sheet music rendering
4. **Backward compatible**: Existing tunes without XML will have null values in new columns

---

## Technical Notes

- XML files are stored as `text` (not `jsonb`) since they are raw MusicXML strings
- Nugget/assembly XMLs use `jsonb` maps for efficient key-based lookup
- The `?raw` query parameter tells Vite to import file content as a string rather than processed
- No validation is added for XML content (assumes pipeline produces valid MusicXML)
