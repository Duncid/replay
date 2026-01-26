

# Plan: Add Lab Tab with OSMD Sheet Music Display

## Overview

Create a new "lab" tab that displays the "intro" tune's sheet music using OpenSheetMusicDisplay (OSMD). This experimental tab will render MusicXML directly into SVG-based sheet music notation.

## Current State

**Tab System:**
- Uses Radix UI Tabs component
- `ActiveMode` type: `"play" | "learn" | "quest"`
- Tabs stored in localStorage via `useLocalStorage`

**XML Source:**
- `src/music/intro/output/tune.xml` contains the full MusicXML
- Vite glob imports already configured in `QuestEditor.tsx` with `?raw` query

**Existing Sheet Rendering:**
- `SheetMusic.tsx` uses `abcjs` for ABC notation
- OSMD is not currently installed

---

## Implementation Steps

### Step 1: Install OpenSheetMusicDisplay

Add the OSMD package:

```bash
npm install opensheetmusicdisplay
```

---

### Step 2: Update ActiveMode Type

**File: `src/pages/Index.tsx`**

Extend the `ActiveMode` type to include "lab":

```typescript
type ActiveMode = "play" | "learn" | "quest" | "lab";
```

---

### Step 3: Create LabMode Component

**File: `src/components/modes/LabMode.tsx`**

Create a new component that:
1. Loads the intro tune XML from the Vite glob
2. Initializes OSMD with a container ref
3. Renders the sheet music

```text
+--------------------------------------------------+
|  Lab Mode                                         |
|  +----------------------------------------------+|
|  |                                              ||
|  |     [OSMD Rendered Sheet Music]              ||
|  |     - Uses OpenSheetMusicDisplay             ||
|  |     - Displays "intro" tune from local XML   ||
|  |                                              ||
|  +----------------------------------------------+|
+--------------------------------------------------+
```

**Key Implementation Details:**
- Use `useRef` for the container DOM element
- Use `useEffect` to initialize OSMD after mount
- Handle loading states and errors gracefully
- Apply dark mode styling via OSMD options or CSS overrides

---

### Step 4: Add Vite Glob Export

**File: `src/components/QuestEditor.tsx`**

Export the XML helper function for use by LabMode:

```typescript
// Export for use by LabMode
export { getTuneXml };
```

Alternatively, move the glob imports and helpers to a shared module:

**File: `src/utils/tuneAssetGlobs.ts`**

```typescript
// Centralized Vite glob imports for tune assets
export const tuneXmlModules = import.meta.glob<string>(
  "/src/music/*/output/tune.xml",
  { eager: true, query: "?raw", import: "default" }
);

export const getTuneXml = (musicRef: string): string | null => {
  const path = `/src/music/${musicRef}/output/tune.xml`;
  return tuneXmlModules[path] || null;
};
```

---

### Step 5: Update Index.tsx

**File: `src/pages/Index.tsx`**

1. Import the new LabMode component
2. Add the "lab" tab trigger
3. Add the TabsContent for lab mode
4. Hide piano when in lab mode (similar to quest mode)

Changes:
- Add import for LabMode
- Add TabsTrigger: `<TabsTrigger value="lab">Lab</TabsTrigger>`
- Add TabsContent with LabMode component
- Update piano visibility condition: `activeMode !== "quest" && activeMode !== "lab"`

---

### Step 6: OSMD Component Structure

**File: `src/components/modes/LabMode.tsx`**

```typescript
import { useEffect, useRef, useState } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { getTuneXml } from "@/utils/tuneAssetGlobs";

export const LabMode = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initOsmd = async () => {
      if (!containerRef.current) return;
      
      const xml = getTuneXml("intro");
      if (!xml) {
        setError("Intro tune XML not found");
        setIsLoading(false);
        return;
      }

      try {
        const osmd = new OpenSheetMusicDisplay(containerRef.current, {
          autoResize: true,
          backend: "svg",
          drawTitle: true,
        });
        
        await osmd.load(xml);
        osmd.render();
        osmdRef.current = osmd;
        setIsLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to render");
        setIsLoading(false);
      }
    };

    initOsmd();

    return () => {
      // Cleanup if needed
      osmdRef.current = null;
    };
  }, []);

  return (
    <div className="w-full h-full flex flex-col items-center justify-start p-4 overflow-auto">
      <h2 className="text-lg font-semibold mb-4">Lab: OSMD Sheet Music</h2>
      
      {isLoading && <p>Loading sheet music...</p>}
      {error && <p className="text-destructive">{error}</p>}
      
      <div 
        ref={containerRef} 
        className="w-full bg-white rounded-lg p-4"
        style={{ minHeight: 400 }}
      />
    </div>
  );
};
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `package.json` | Modify | Add `opensheetmusicdisplay` dependency |
| `src/utils/tuneAssetGlobs.ts` | Create | Centralized XML glob imports and helpers |
| `src/components/modes/LabMode.tsx` | Create | OSMD-based sheet music display component |
| `src/pages/Index.tsx` | Modify | Add "lab" tab, import LabMode, update piano visibility |
| `src/components/QuestEditor.tsx` | Modify | Remove redundant glob imports (use shared module) |

---

## Technical Notes

- **OSMD Options**: The `autoResize: true` option enables responsive resizing. Additional options include `drawTitle`, `drawSubtitle`, `drawComposer`, `drawingParameters` for styling.
- **Dark Mode**: OSMD renders to SVG. CSS overrides may be needed to invert colors for dark mode compatibility (e.g., `filter: invert(1)` or styling note fills).
- **Performance**: OSMD can be slow for complex scores. The intro tune is 4 measures, so performance should be fine.
- **Build-time Loading**: Using Vite's `?raw` query ensures the XML is bundled as a string at build time, avoiding runtime fetch latency.

---

## Expected Result

After implementation:
1. A new "Lab" tab appears in the header
2. Clicking "Lab" displays the intro tune rendered as professional sheet music
3. OSMD provides higher-fidelity notation than the current abcjs-based SheetMusic component
4. Piano is hidden when viewing the lab tab

