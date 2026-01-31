

# Plan: Add Tune Manager to LabMode with Publishing Workflow

## Overview

Transform LabMode into a "Tune Manager" that allows browsing both published (from database) and unpublished (from local `src/music/` files) tunes, with the ability to publish unpublished tunes directly from this interface. This decouples tune publishing from the Quest Editor, where tunes will only reference already-published tune assets.

## Current Architecture

**LabMode (current):**
- Fetches published tunes from database via `usePublishedTuneKeys()` and `useTuneAssets()`
- Displays sheet music (XML and DSP XML) for selected tune/nugget/assembly

**QuestEditor (current):**
- Contains `bundleTuneAssets()` function that reads local `src/music/*/` files via Vite globs
- Publishing bundles tune assets when curriculum is published
- Tune nodes reference `musicRef` (folder name) and `tuneKey` (published key)

**Proposed Flow:**
1. Tune Manager shows both Published and Un-Published tunes
2. User can preview any tune's sheet music
3. User can publish unpublished tunes (create new or update existing)
4. Quest Editor references only already-published tunes

---

## UI Design

### Dropdown Structure

```text
[Select Tune] v
+--------------------------------------------------+
| Published (from DB)                              |
|   > st-louis-blues                               |
|       Full                                       |
|       Nuggets >                                  |
|           N1, N2, N3...                          |
|       Assemblies >                               |
|           A1, A2...                              |
|   > intro                                        |
|       Full                                       |
|       Nuggets >                                  |
|       Assemblies >                               |
+--------------------------------------------------+
| Un-Published (local files)                       |
|   > gymnopdie                                    |
|       Full                                       |
|       Nuggets >                                  |
|       Assemblies >                               |
+--------------------------------------------------+
```

### Top Bar Actions

When an **unpublished** tune is selected, show a "Publish" button in the top bar:

```text
[Play] [Stop] [Select Tune: gymnopdie / full] [Publish]
```

### Publish Dialog

When user clicks "Publish", show a dialog:

```text
+------------------------------------------+
|              Publish Tune                |
+------------------------------------------+
| Tune: gymnopdie                          |
|                                          |
| Action:                                  |
| [v Create New Tune                    ]  |
|     - Create New Tune                    |
|     - Update "st-louis-blues"            |
|     - Update "intro"                     |
|                                          |
| +--------------------------------------+ |
| | Title: [Gymnopedie No. 1          ]  | |  <- Only shown for "Create New"
| +--------------------------------------+ |
|                                          |
| [Cancel]                    [Publish]    |
+------------------------------------------+
```

---

## Implementation Steps

### Step 1: Move Glob Imports to LabMode

**File: `src/components/modes/LabMode.tsx`**

Move all the Vite glob imports and helper functions from `QuestEditor.tsx` to `LabMode.tsx` (or a shared module):

```typescript
// Pre-load all local music files at build time
const teacherModules = import.meta.glob<{ default: Record<string, unknown> }>(
  "/src/music/*/teacher.json",
  { eager: true }
);

const tuneNsModules = import.meta.glob<{ default: object }>(
  "/src/music/*/output/tune.ns.json",
  { eager: true }
);

// ... all other glob patterns for nuggets, assemblies, XMLs, DSP XMLs
```

Extract the list of available local tunes:

```typescript
const localTuneKeys = useMemo(() => {
  return Object.keys(teacherModules)
    .map(path => {
      const match = path.match(/\/music\/([^/]+)\/teacher\.json$/);
      return match ? match[1] : null;
    })
    .filter(Boolean) as string[];
}, []);
```

---

### Step 2: Compute Published vs Unpublished Tunes

**File: `src/components/modes/LabMode.tsx`**

```typescript
const publishedTuneKeys = useMemo(
  () => new Set(tuneList?.map(t => t.tune_key) ?? []),
  [tuneList]
);

const unpublishedTuneKeys = useMemo(
  () => localTuneKeys.filter(key => !publishedTuneKeys.has(key)),
  [localTuneKeys, publishedTuneKeys]
);
```

---

### Step 3: Track Selection Source (Published vs Local)

**File: `src/components/modes/LabMode.tsx`**

Add state to track whether selection is from DB or local:

```typescript
type TuneSource = "published" | "local";

const [selectedSource, setSelectedSource] = useState<TuneSource>("published");
const [selectedTune, setSelectedTune] = useState<string>("");
```

---

### Step 4: Derive Data Based on Source

**File: `src/components/modes/LabMode.tsx`**

When source is "published", use database data (existing logic).
When source is "local", use glob modules:

```typescript
const { sequence, xmlFull, xmlDsp, nuggetIds, assemblyIds } = useMemo(() => {
  if (selectedSource === "published" && tuneAssets) {
    // Existing database-based logic
    return { ... };
  }
  
  if (selectedSource === "local" && selectedTune) {
    // Use local glob modules
    const teacher = getTeacher(selectedTune);
    const noteSequence = getTuneNs(selectedTune);
    const tuneXml = getTuneXml(selectedTune);
    const tuneDspXml = getTuneDspXml(selectedTune);
    
    // Extract nugget/assembly based on selectedTarget and selectedItemId
    // ...
    
    return { ... };
  }
  
  return { sequence: EMPTY_SEQUENCE, xmlFull: null, xmlDsp: null, nuggetIds: [], assemblyIds: [] };
}, [selectedSource, selectedTune, selectedTarget, selectedItemId, tuneAssets]);
```

---

### Step 5: Update Dropdown UI

**File: `src/components/modes/LabMode.tsx`**

Update the dropdown to show two sections:

```tsx
<DropdownMenuContent>
  {/* Published tunes section */}
  <DropdownMenuLabel>Published</DropdownMenuLabel>
  {Array.from(publishedTuneKeys).map(tune => (
    <DropdownMenuSub key={`published-${tune}`}>
      <DropdownMenuSubTrigger>{tune}</DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuItem onClick={() => selectTune("published", tune, "full", "")}>
          Full
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Nuggets</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {getNuggetIdsForTune(tune).map(id => (
              <DropdownMenuItem key={id} onClick={() => selectTune("published", tune, "nuggets", id)}>
                {id}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Assemblies</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {getAssemblyIdsForTune(tune).map(id => (
              <DropdownMenuItem key={id} onClick={() => selectTune("published", tune, "assemblies", id)}>
                {id}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  ))}

  <DropdownMenuSeparator />

  {/* Unpublished tunes section */}
  <DropdownMenuLabel>Un-Published</DropdownMenuLabel>
  {unpublishedTuneKeys.map(tune => (
    <DropdownMenuSub key={`local-${tune}`}>
      <DropdownMenuSubTrigger>{tune}</DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuItem onClick={() => selectTune("local", tune, "full", "")}>
          Full
        </DropdownMenuItem>
        {/* Similar nugget/assembly submenus using local data */}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  ))}
</DropdownMenuContent>
```

---

### Step 6: Add Publish Button (Conditional)

**File: `src/components/modes/LabMode.tsx`**

Show Publish button only when an unpublished tune is selected:

```tsx
{selectedSource === "local" && selectedTune && (
  <Button variant="default" size="sm" onClick={() => setShowPublishDialog(true)}>
    <Upload className="h-4 w-4 mr-2" />
    Publish
  </Button>
)}
```

---

### Step 7: Create Publish Dialog Component

**File: `src/components/modes/LabMode.tsx`** (or separate component)

```tsx
const [showPublishDialog, setShowPublishDialog] = useState(false);
const [publishMode, setPublishMode] = useState<"create" | string>("create"); // "create" or existing tune_key
const [newTuneTitle, setNewTuneTitle] = useState("");
const [isPublishing, setIsPublishing] = useState(false);

// Dialog UI
<Dialog open={showPublishDialog} onOpenChange={setShowPublishDialog}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Publish Tune</DialogTitle>
    </DialogHeader>
    <div className="space-y-4 py-4">
      <p className="text-sm text-muted-foreground">
        Publishing: <strong>{selectedTune}</strong>
      </p>
      
      <div className="space-y-2">
        <Label>Action</Label>
        <Select value={publishMode} onValueChange={setPublishMode}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="create">Create New Tune</SelectItem>
            {Array.from(publishedTuneKeys).map(key => (
              <SelectItem key={key} value={key}>Update "{key}"</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      {publishMode === "create" && (
        <div className="space-y-2">
          <Label>Title</Label>
          <Input
            value={newTuneTitle}
            onChange={(e) => setNewTuneTitle(e.target.value)}
            placeholder="e.g., Gymnopedie No. 1"
          />
        </div>
      )}
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setShowPublishDialog(false)}>
        Cancel
      </Button>
      <Button onClick={handlePublish} disabled={isPublishing}>
        {isPublishing ? "Publishing..." : "Publish"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

### Step 8: Implement Publish Handler

**File: `src/components/modes/LabMode.tsx`**

Create a `bundleSingleTuneAssets` function that bundles just the selected tune:

```typescript
const bundleSingleTuneAssets = useCallback((musicRef: string): TuneAssetBundle => {
  const teacher = getTeacher(musicRef);
  const noteSequence = getTuneNs(musicRef);
  // ... same logic as bundleTuneAssets but for a single tune
  return bundle;
}, []);

const handlePublish = useCallback(async () => {
  if (!selectedTune) return;
  
  setIsPublishing(true);
  try {
    const tuneAssets = bundleSingleTuneAssets(selectedTune);
    const tuneKey = publishMode === "create" 
      ? selectedTune // Use folder name as tune_key for new tunes
      : publishMode; // Use selected existing tune_key for updates
    
    const { data, error } = await supabase.functions.invoke("tune-publish", {
      body: {
        tuneKey,
        title: publishMode === "create" ? newTuneTitle : undefined,
        tuneAssets,
        mode: publishMode === "create" ? "create" : "update",
      },
    });
    
    if (error) throw error;
    
    toast({ title: "Published successfully" });
    setShowPublishDialog(false);
    // Invalidate query to refresh published list
    queryClient.invalidateQueries({ queryKey: ["published-tune-keys"] });
  } catch (error) {
    toast({ title: "Publish failed", description: error.message, variant: "destructive" });
  } finally {
    setIsPublishing(false);
  }
}, [selectedTune, publishMode, newTuneTitle, bundleSingleTuneAssets, toast]);
```

---

### Step 9: Create New Edge Function for Tune Publishing

**File: `supabase/functions/tune-publish/index.ts`**

Create a dedicated edge function for publishing individual tunes:

```typescript
interface TunePublishRequest {
  tuneKey: string;
  title?: string;
  tuneAssets: TuneAssetBundle;
  mode: "create" | "update";
}

// Handle creating new tune_assets entry or updating existing
// This operates independently of curriculum_versions
// May need a separate "standalone_tune_assets" concept or
// create a dummy curriculum_version for standalone publishes
```

**Alternative approach:** Modify the existing `curriculum-publish` endpoint to support "tune-only" publishing mode.

---

### Step 10: Update QuestEditor to Reference Published Tunes Only

**File: `src/components/QuestEditor.tsx`**

Change the tune node editing to show a dropdown of **published** tunes instead of local `availableTunes`:

```typescript
// In the tune edit section, replace:
// <Select ... onValueChange={setEditingMusicRef}>
//   {availableTunes.map(tune => ...)}
// </Select>

// With a dropdown that fetches from usePublishedTuneKeys():
const { data: publishedTunes } = usePublishedTuneKeys();

// And in the UI:
<Select value={editingMusicRef} onValueChange={setEditingMusicRef}>
  <SelectTrigger>
    <SelectValue placeholder="Select a published tune..." />
  </SelectTrigger>
  <SelectContent>
    {publishedTunes?.map(tune => (
      <SelectItem key={tune.tune_key} value={tune.tune_key}>
        {tune.briefing?.title || tune.tune_key}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

---

### Step 11: Remove bundleTuneAssets from QuestEditor

**File: `src/components/QuestEditor.tsx`**

After tune publishing is moved to Tune Manager:
1. Remove all glob imports (lines 109-194)
2. Remove `bundleTuneAssets` function (lines 2142-2398)
3. Update `confirmPublish` to not bundle tune assets (curriculum-publish will reference existing tune_assets)

The curriculum-publish edge function would then only validate that referenced tuneKeys exist in the database.

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/components/modes/LabMode.tsx` | Modify | Add glob imports, two-section dropdown, publish button, publish dialog |
| `supabase/functions/tune-publish/index.ts` | Create | New edge function for standalone tune publishing |
| `src/components/QuestEditor.tsx` | Modify | Remove glob imports, change tune selection to use published tunes only |
| `supabase/functions/curriculum-publish/index.ts` | Modify | Update to reference existing tune_assets instead of receiving bundles |

---

## Database Consideration

Currently `tune_assets` is tied to `curriculum_versions` via `version_id`. For standalone tune publishing, we have two options:

**Option A (Recommended):** Create a special "standalone" curriculum_version for independently published tunes, or add a nullable `version_id` with a different identifier for standalone assets.

**Option B:** Keep tune publishing tied to curriculum publishing but allow "preview" mode in Tune Manager that uses local files without persisting.

For this plan, we'll implement **Option A** - a simple approach where standalone tunes get their own version_id from a reserved "standalone" curriculum entry.

---

## Technical Notes

- The glob imports are evaluated at build time, so all local music files are bundled into the frontend
- Published tunes come from the database and are fetched at runtime
- The publish workflow creates a new tune_assets entry that can then be referenced by Quest curriculum
- Query invalidation ensures the UI updates after publishing

