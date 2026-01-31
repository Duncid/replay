# Plan: Simplify Tune Selector UI

## Overview

Restructure the tune selector to be cleaner and more intuitive:

1. **Tune Selector Dropdown** - Lists tunes under "Published" and "Un-Published" sub-triggers with filter search
2. **Target Selector Dropdown** - Separate dropdown for Full / Nuggets / Assemblies (with item sub-selection)
3. **Action Button** - Context-sensitive action to the right of the tune selector:
   - Published: Edit dropdown (Rename / Delete)
   - Unpublished: Publish button

## Current Structure (Nested)

```text
[Tune Selector ▾]
  └─ ☁️ Published
       └─ tune-name ►
            ├─ Full
            ├─ Nuggets ► [id1, id2...]
            ├─ Assemblies ► [id1, id2...]
            ├─ ─────────
            ├─ Rename
            └─ Delete
  └─ 📁 Un-Published
       └─ tune-name ►
            ├─ Full
            ├─ Nuggets ► ...
            └─ Assemblies ► ...
```

**Problems:**

- Too many nested levels (up to 4 deep)
- Edit actions buried inside tune submenu
- No search/filter capability
- Publish button separate from the selector

---

## New Structure (Flat with Filters)

```text
┌─────────────────────────────────────────────────────────────────┐
│  [Tune Selector ▾]   [Target: Full ▾]   [Edit ▾ / Publish]     │
└─────────────────────────────────────────────────────────────────┘
```

### Tune Selector Dropdown:

```text
[Tune Selector ▾]
  ├─ ☁️ Published
  │     [🔍 Filter...]
  │     tune-name-1  ✓
  │     tune-name-2
  │     ...
  │
  ├─ 📁 Un-Published
  │     [🔍 Filter...]
  │     local-tune-1
  │     local-tune-2
  └─────────────────
```

### Target Selector Dropdown:

```text
[Full ▾]
  ├─ Full  ✓
  ├─ Nuggets ►
  │     [id-1, id-2, ...]
  └─ Assemblies ►
        [id-1, id-2, ...]
```

### Action Button (Context-Sensitive):

- **Published tune selected:** Shows "Edit" dropdown with Rename/Delete
- **Unpublished tune selected:** Shows "Publish" button

---

## Implementation Details

### Step 1: Add Filter State

```tsx
// New state for filter search
const [publishedFilter, setPublishedFilter] = useState("");
const [unpublishedFilter, setUnpublishedFilter] = useState("");

// Filtered lists
const filteredPublishedKeys = useMemo(() => {
  if (!publishedFilter.trim()) return Array.from(publishedTuneKeys);
  const lower = publishedFilter.toLowerCase();
  return Array.from(publishedTuneKeys).filter((key) =>
    key.toLowerCase().includes(lower),
  );
}, [publishedTuneKeys, publishedFilter]);

const filteredUnpublishedKeys = useMemo(() => {
  if (!unpublishedFilter.trim()) return unpublishedTuneKeys;
  const lower = unpublishedFilter.toLowerCase();
  return unpublishedTuneKeys.filter((key) => key.toLowerCase().includes(lower));
}, [unpublishedTuneKeys, unpublishedFilter]);
```

### Step 2: Simplified Tune Selector

Replace the current deeply nested dropdown with a flatter structure:

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="outline" size="sm">
      {selectedSource === "published" ? "☁️" : "📁"}{" "}
      {selectedTune || "Select tune..."}
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="start" className="w-64 bg-popover">
    {/* Published Section */}
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>Published</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="bg-popover w-56">
        {/* Filter Input */}
        <div className="px-2 py-1.5">
          <Input
            placeholder="Filter..."
            value={publishedFilter}
            onChange={(e) => setPublishedFilter(e.target.value)}
            className="h-8"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
        <DropdownMenuSeparator />
        {/* Tune List */}
        {filteredPublishedKeys.map((tune) => (
          <DropdownMenuItem
            key={tune}
            onClick={() => {
              setSelectedSource("published");
              setSelectedTune(tune);
            }}
          >
            {tune}
            {selectedTune === tune && selectedSource === "published" && " ✓"}
          </DropdownMenuItem>
        ))}
        {filteredPublishedKeys.length === 0 && (
          <DropdownMenuItem disabled>No matches</DropdownMenuItem>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>

    {/* Un-Published Section */}
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>Un-Published</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="bg-popover w-56">
        {/* Filter Input */}
        <div className="px-2 py-1.5">
          <Input
            placeholder="Filter..."
            value={unpublishedFilter}
            onChange={(e) => setUnpublishedFilter(e.target.value)}
            className="h-8"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
        <DropdownMenuSeparator />
        {/* Tune List */}
        {filteredUnpublishedKeys.map((tune) => (
          <DropdownMenuItem
            key={tune}
            onClick={() => {
              setSelectedSource("local");
              setSelectedTune(tune);
            }}
          >
            {tune}
            {selectedTune === tune && selectedSource === "local" && " ✓"}
          </DropdownMenuItem>
        ))}
        {filteredUnpublishedKeys.length === 0 && (
          <DropdownMenuItem disabled>No matches</DropdownMenuItem>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  </DropdownMenuContent>
</DropdownMenu>
```

### Step 3: Target Selector Dropdown

A second dropdown for selecting Full / Nuggets / Assemblies:

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="outline" size="sm" disabled={!selectedTune}>
      {selectedTarget === "full"
        ? "Full"
        : selectedItemId
        ? `${selectedTarget} / ${selectedItemId}`
        : selectedTarget}
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="start" className="bg-popover">
    <DropdownMenuItem
      onClick={() => {
        setSelectedTarget("full");
        setSelectedItemId("");
      }}
    >
      Full {selectedTarget === "full" && "✓"}
    </DropdownMenuItem>

    <DropdownMenuSub>
      <DropdownMenuSubTrigger>Nuggets</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="bg-popover">
        {nuggetIds.length ? (
          nuggetIds.map((id) => (
            <DropdownMenuItem
              key={id}
              onClick={() => {
                setSelectedTarget("nuggets");
                setSelectedItemId(id);
              }}
            >
              {id}{" "}
              {selectedTarget === "nuggets" && selectedItemId === id && "✓"}
            </DropdownMenuItem>
          ))
        ) : (
          <DropdownMenuItem disabled>No nuggets</DropdownMenuItem>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>

    <DropdownMenuSub>
      <DropdownMenuSubTrigger>Assemblies</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="bg-popover">
        {assemblyIds.length ? (
          assemblyIds.map((id) => (
            <DropdownMenuItem
              key={id}
              onClick={() => {
                setSelectedTarget("assemblies");
                setSelectedItemId(id);
              }}
            >
              {id}{" "}
              {selectedTarget === "assemblies" && selectedItemId === id && "✓"}
            </DropdownMenuItem>
          ))
        ) : (
          <DropdownMenuItem disabled>No assemblies</DropdownMenuItem>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  </DropdownMenuContent>
</DropdownMenu>
```

### Step 4: Context-Sensitive Action Button

```tsx
{
  /* Action Button - changes based on source */
}
{
  selectedTune &&
    (selectedSource === "published" ? (
      // Edit Dropdown for Published
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Pencil className="h-4 w-4 mr-1" />
            Edit
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="bg-popover">
          <DropdownMenuItem onClick={() => openRenameDialog(selectedTune)}>
            <Pencil className="h-4 w-4 mr-2" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => openDeleteDialog(selectedTune)}
            className="text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : (
      // Publish Button for Unpublished
      <Button
        variant="default"
        size="sm"
        onClick={() => setShowPublishDialog(true)}
      >
        <Upload className="h-4 w-4 mr-1" />
        Publish
      </Button>
    ));
}
```

---

## Updated Toolbar Layout

```tsx
<div className="w-full flex flex-wrap items-center gap-2 mb-3">
  {/* Play/Stop Button */}
  <Button variant="outline" size="sm" onClick={handlePlayToggle} ...>
    {isPlaying ? <><Pause /> Stop</> : <><Play /> Play</>}
  </Button>

  {/* Spacer */}
  <div className="flex-1" />

  {/* Tune Selector */}
  <DropdownMenu>...</DropdownMenu>

  {/* Target Selector */}
  <DropdownMenu>...</DropdownMenu>

  {/* Action Button (Edit/Publish) */}
  {selectedTune && (...)}
</div>
```

---

## Files to Modify

| File                                      | Changes                                                                                                                             |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/modes/TuneManagement.tsx` | Replace nested dropdown with flat structure, add filter state, create separate target selector, add context-sensitive action button |

---

## Visual Summary

**Before (Current):**

```text
[Play] [Publish] [☁️ tune / assemblies / id ▾]
                       └─ Published ► tune ► Full/Nuggets/Assemblies/Rename/Delete
                       └─ Un-Published ► tune ► Full/Nuggets/Assemblies
```

**After (New):**

```text
[Play]                 [☁️ tune ▾]  [Assemblies / id ▾]  [Edit ▾]
                             │              │                │
                     Select tune     Select target     Rename/Delete
                     with filter     (Full/Nug/Asm)    or Publish
```

This simplifies navigation from 4 levels deep to 2 levels maximum, adds searchability, and puts actions in a consistent location.
