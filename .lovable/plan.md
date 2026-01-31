

# Plan: Add Edit/Delete for Published Tunes and Improve Unpublished Detection

## Overview

Add management capabilities for published tunes (Rename and Delete) and improve the unpublished tune detection to only show folders that have an `output/` subfolder with the required files.

## Current State Analysis

**Published Tunes:**
- Currently, published tunes can only be "updated" by republishing from a local folder
- No way to rename a tune's key or title after publishing
- No way to delete a published tune

**Unpublished Tune Detection:**
- Currently uses `getLocalTuneKeys()` which scans for `teacher.json` files
- This shows `st-louis-blues-complex` even though it has no `output/` folder
- No validation of required files before publishing

**Required Files for Publishing:**
Based on `bundleSingleTuneAssets()`:
1. `output/tune.ns.json` (required - blocks publish if missing)
2. `teacher.json` (optional but needed for nuggets/assemblies)
3. Various XMLs (optional but desirable)

---

## Implementation Steps

### Step 1: Add Edit Dropdown for Published Tunes

**File: `src/components/modes/LabMode.tsx`**

Add an "Edit" button next to published tunes in the dropdown with Rename and Delete options:

```tsx
{/* Inside published tune submenu, after the tune name */}
<DropdownMenuSub key={`published-${tune}`}>
  <DropdownMenuSubTrigger className="flex items-center justify-between">
    <span>{tune}</span>
  </DropdownMenuSubTrigger>
  <DropdownMenuSubContent className="bg-popover">
    <DropdownMenuItem onClick={() => selectTune("published", tune, "full", "")}>
      Full
    </DropdownMenuItem>
    {/* ... existing Nuggets/Assemblies submenus ... */}
    
    <DropdownMenuSeparator />
    
    {/* Edit Actions */}
    <DropdownMenuItem onClick={() => openRenameDialog(tune)}>
      <Pencil className="h-4 w-4 mr-2" />
      Rename
    </DropdownMenuItem>
    <DropdownMenuItem 
      onClick={() => openDeleteDialog(tune)}
      className="text-destructive"
    >
      <Trash2 className="h-4 w-4 mr-2" />
      Delete
    </DropdownMenuItem>
  </DropdownMenuSubContent>
</DropdownMenuSub>
```

### Step 2: Add Rename Dialog State and UI

**File: `src/components/modes/LabMode.tsx`**

```tsx
// New state
const [showRenameDialog, setShowRenameDialog] = useState(false);
const [renameTargetKey, setRenameTargetKey] = useState<string>("");
const [newTitle, setNewTitle] = useState("");
const [isRenaming, setIsRenaming] = useState(false);

// Dialog UI
<Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Rename Tune</DialogTitle>
    </DialogHeader>
    <div className="space-y-4 py-4">
      <p className="text-sm text-muted-foreground">
        Tune key: <strong>{renameTargetKey}</strong>
      </p>
      <div className="space-y-2">
        <Label>New Title</Label>
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Enter new title..."
        />
      </div>
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setShowRenameDialog(false)}>
        Cancel
      </Button>
      <Button onClick={handleRename} disabled={isRenaming || !newTitle.trim()}>
        {isRenaming ? "Renaming..." : "Rename"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Step 3: Add Delete Confirmation Dialog

**File: `src/components/modes/LabMode.tsx`**

```tsx
// New state
const [showDeleteDialog, setShowDeleteDialog] = useState(false);
const [deleteTargetKey, setDeleteTargetKey] = useState<string>("");
const [isDeleting, setIsDeleting] = useState(false);

// Dialog UI
<Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Delete Tune</DialogTitle>
    </DialogHeader>
    <div className="py-4">
      <p className="text-sm text-muted-foreground">
        Are you sure you want to delete <strong>{deleteTargetKey}</strong>?
      </p>
      <p className="text-sm text-destructive mt-2">
        This action cannot be undone.
      </p>
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
        Cancel
      </Button>
      <Button 
        variant="destructive" 
        onClick={handleDelete} 
        disabled={isDeleting}
      >
        {isDeleting ? "Deleting..." : "Delete"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Step 4: Implement Rename Handler

**File: `src/components/modes/LabMode.tsx`**

```tsx
const openRenameDialog = useCallback((tuneKey: string) => {
  const tuneInfo = tuneList?.find(t => t.tune_key === tuneKey);
  setRenameTargetKey(tuneKey);
  setNewTitle(tuneInfo?.briefing?.title || tuneKey);
  setShowRenameDialog(true);
}, [tuneList]);

const handleRename = useCallback(async () => {
  if (!renameTargetKey || !newTitle.trim()) return;
  
  setIsRenaming(true);
  try {
    const { error } = await supabase.functions.invoke("tune-manage", {
      body: {
        action: "rename",
        tuneKey: renameTargetKey,
        newTitle: newTitle.trim(),
      },
    });
    
    if (error) throw error;
    
    toast({ title: "Tune renamed successfully" });
    setShowRenameDialog(false);
    queryClient.invalidateQueries({ queryKey: ["published-tune-keys"] });
    queryClient.invalidateQueries({ queryKey: ["tune-assets"] });
  } catch (error) {
    toast({
      title: "Rename failed",
      description: error instanceof Error ? error.message : "Unknown error",
      variant: "destructive",
    });
  } finally {
    setIsRenaming(false);
  }
}, [renameTargetKey, newTitle, toast, queryClient]);
```

### Step 5: Implement Delete Handler

**File: `src/components/modes/LabMode.tsx`**

```tsx
const openDeleteDialog = useCallback((tuneKey: string) => {
  setDeleteTargetKey(tuneKey);
  setShowDeleteDialog(true);
}, []);

const handleDelete = useCallback(async () => {
  if (!deleteTargetKey) return;
  
  setIsDeleting(true);
  try {
    const { error } = await supabase.functions.invoke("tune-manage", {
      body: {
        action: "delete",
        tuneKey: deleteTargetKey,
      },
    });
    
    if (error) throw error;
    
    toast({ title: "Tune deleted successfully" });
    setShowDeleteDialog(false);
    
    // If deleted tune was selected, reset selection
    if (selectedTune === deleteTargetKey && selectedSource === "published") {
      setSelectedTune("");
      setSelectedSource("published");
    }
    
    queryClient.invalidateQueries({ queryKey: ["published-tune-keys"] });
    queryClient.invalidateQueries({ queryKey: ["tune-assets"] });
  } catch (error) {
    toast({
      title: "Delete failed",
      description: error instanceof Error ? error.message : "Unknown error",
      variant: "destructive",
    });
  } finally {
    setIsDeleting(false);
  }
}, [deleteTargetKey, selectedTune, selectedSource, toast, queryClient]);
```

---

### Step 6: Create tune-manage Edge Function

**File: `supabase/functions/tune-manage/index.ts`**

```typescript
interface TuneManageRequest {
  action: "rename" | "delete";
  tuneKey: string;
  newTitle?: string; // For rename action
}

// For "rename": Update briefing.title in tune_assets
// For "delete": Delete the tune_assets record

serve(async (req) => {
  // CORS handling...
  
  const { action, tuneKey, newTitle } = await req.json();
  
  if (action === "delete") {
    // Find and delete all tune_assets with this tune_key
    const { error } = await supabase
      .from("tune_assets")
      .delete()
      .eq("tune_key", tuneKey);
    
    if (error) throw error;
    return { success: true };
  }
  
  if (action === "rename") {
    // Get existing tune to preserve other briefing data
    const { data: existing } = await supabase
      .from("tune_assets")
      .select("id, briefing")
      .eq("tune_key", tuneKey)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    
    if (!existing) throw new Error("Tune not found");
    
    // Update briefing with new title
    // Since there's no UPDATE RLS policy, delete and re-insert
    // OR we could use a Supabase function/RPC
    // For now, we'll do a direct update using service role
    const updatedBriefing = { 
      ...(existing.briefing as object || {}), 
      title: newTitle 
    };
    
    // Delete old record
    await supabase.from("tune_assets").delete().eq("id", existing.id);
    
    // Re-insert with updated briefing
    // ... copy all fields with updated briefing
    
    return { success: true };
  }
});
```

Note: Since `tune_assets` lacks an UPDATE RLS policy, the rename operation will need to fetch the full record, delete it, and re-insert with the updated title. Alternatively, we could add an UPDATE RLS policy to the table.

---

### Step 7: Improve Unpublished Tune Detection

**File: `src/utils/tuneAssetBundler.ts`**

Change `getLocalTuneKeys()` to only return folders with an `output/` subfolder:

```typescript
// Add a new glob pattern for output folder detection
const outputFolderModules = import.meta.glob<unknown>(
  "/src/music/*/output/tune.ns.json",
  { eager: true }
);

// Update getLocalTuneKeys to require output folder
export const getLocalTuneKeys = (): string[] => {
  return Object.keys(outputFolderModules)
    .map((path) => {
      const match = path.match(/\/music\/([^/]+)\/output\/tune\.ns\.json$/);
      return match ? match[1] : null;
    })
    .filter(Boolean) as string[];
};
```

This ensures only folders with `output/tune.ns.json` (the required file) are shown as unpublished.

---

### Step 8: Add Pre-Publish Validation

**File: `src/utils/tuneAssetBundler.ts`**

Add a validation function that checks for all required files:

```typescript
export interface TuneValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export const validateTuneForPublishing = (musicRef: string): TuneValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Required: tune.ns.json
  const tuneNs = getTuneNs(musicRef);
  if (!tuneNs) {
    errors.push("Missing output/tune.ns.json (required)");
  } else {
    const notes = (tuneNs as { notes?: unknown[] })?.notes;
    if (!notes || !Array.isArray(notes) || notes.length === 0) {
      errors.push("tune.ns.json has no notes");
    }
  }
  
  // Optional but recommended
  const teacher = getTeacher(musicRef);
  if (!teacher) {
    warnings.push("Missing teacher.json (needed for nuggets/assemblies)");
  }
  
  const tuneXml = getTuneXml(musicRef);
  if (!tuneXml) {
    warnings.push("Missing output/tune.xml");
  }
  
  const tuneDspXml = getTuneDspXml(musicRef);
  if (!tuneDspXml) {
    warnings.push("Missing output/dsp.xml");
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
};
```

**File: `src/components/modes/LabMode.tsx`**

Update publish handler to validate before publishing:

```tsx
const handlePublish = useCallback(async () => {
  if (!selectedTune || selectedSource !== "local") return;

  // Validate first
  const validation = validateTuneForPublishing(selectedTune);
  if (!validation.isValid) {
    toast({
      title: "Cannot publish",
      description: validation.errors.join(", "),
      variant: "destructive",
    });
    return;
  }
  
  if (validation.warnings.length > 0) {
    console.warn("[LabMode] Publish warnings:", validation.warnings);
  }
  
  // Continue with existing publish logic...
}, [...]);
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/components/modes/LabMode.tsx` | Modify | Add Rename/Delete dialogs, handlers, and Edit menu items |
| `supabase/functions/tune-manage/index.ts` | Create | New edge function for rename and delete operations |
| `supabase/config.toml` | Modify | Add tune-manage function |
| `src/utils/tuneAssetBundler.ts` | Modify | Improve unpublished detection, add validation function |

---

## Database Consideration

The `tune_assets` table currently lacks an UPDATE RLS policy. For the rename operation, we have two options:

**Option A (Implemented Above):** Use delete + re-insert pattern (works with existing policies)

**Option B (Recommended):** Add an UPDATE RLS policy to allow updates:
```sql
CREATE POLICY "Allow public update tune_assets" 
ON public.tune_assets 
FOR UPDATE 
TO public 
USING (true);
```

---

## UI Flow Summary

### Published Tune Edit Flow:
```text
[Dropdown] > [Published] > [tune-name] > 
    Full / Nuggets / Assemblies
    ---
    Rename  -> Opens Rename Dialog -> [New Title Input] -> [Cancel | Rename]
    Delete  -> Opens Delete Dialog -> [Cancel | Delete]
```

### Unpublished Tune Detection:
```text
Before: Shows all folders with teacher.json
        - gymnopdie       (has output/)
        - intro           (has output/)
        - st-louis-blues  (has output/)
        - st-louis-blues-complex  (NO output/ - should NOT show)

After:  Shows only folders with output/tune.ns.json
        - gymnopdie
        - intro  
        - st-louis-blues
```

### Pre-Publish Validation:
```text
User clicks Publish -> Validate files:
  REQUIRED:
    - output/tune.ns.json ✓
    - tune.ns.json must have notes ✓
  
  WARNINGS (logged but allows publish):
    - teacher.json missing
    - tune.xml missing
    - dsp.xml missing

If validation fails -> Show error toast, block publish
If validation passes with warnings -> Log warnings, continue publish
```

