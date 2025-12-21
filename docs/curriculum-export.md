# Curriculum Export Format

This document describes the curriculum export compiler that transforms the authoring graph (nodes/edges) into a runtime-ready curriculum JSON format.

## Overview

The compiler takes the visual graph representation created in QuestEditor and compiles it into a structured JSON format that can be consumed by the runtime application without graph traversal. All relationships are inferred from edges and explicitly exported.

## Edge Semantics Mapping

The compiler infers relationships from edges based on handle IDs:

| Source Handle       | Target Handle      | Relationship Type  | Result                                                    |
| ------------------- | ------------------ | ------------------ | --------------------------------------------------------- |
| `track-out`         | `lesson-in`        | Track membership   | Adds lesson to track's `lessonKeys` array                 |
| `lesson-required`   | `skill-required`   | Lesson requirement | Adds skill to lesson's `requiresSkills` array             |
| `lesson-unlockable` | `skill-unlockable` | Lesson unlock      | Adds skill to lesson's `awardsSkills` array               |
| `lesson-out`        | `lesson-in`        | Lesson sequencing  | Adds target lesson to source lesson's `nextLessons` array |
| `track-required`    | `skill-required`   | Track requirement  | Adds skill to track's `requiresSkills` array (optional)   |

### Detailed Edge Semantics

#### Track → Lesson (`track-out` → `lesson-in`)

- **Meaning**: The lesson belongs to this track
- **Export**: Lesson's `trackKey` is set, and lesson key is added to track's `lessonKeys`
- **Validation**: Each lesson must belong to exactly one track

#### Lesson → Skill Requirement (`lesson-required` → `skill-required`)

- **Meaning**: The lesson requires this skill to be unlocked before it can be accessed
- **Export**: Skill key is added to lesson's `requiresSkills` array
- **Reverse Index**: Lesson key is added to skill's `requiredByLessons` array

#### Lesson → Skill Unlock (`lesson-unlockable` → `skill-unlockable`)

- **Meaning**: Completing this lesson successfully unlocks this skill
- **Export**: Skill key is added to lesson's `awardsSkills` array
- **Reverse Index**: Lesson key is added to skill's `awardedByLessons` array

#### Lesson → Lesson (`lesson-out` → `lesson-in`)

- **Meaning**: Suggested next lesson after completing the source lesson
- **Export**: Target lesson key is added to source lesson's `nextLessons` array

#### Track → Skill (`track-required` → `skill-required`)

- **Meaning**: The track requires this skill (optional convenience for track-level requirements)
- **Export**: Skill key is added to track's `requiresSkills` array
- **Reverse Index**: Track key is added to skill's `requiredByTracks` array

## Validation Rules

The compiler performs the following validations:

1. **Required Keys**:

   - All track nodes must have a non-empty `trackKey`
   - All lesson nodes must have a non-empty `lessonKey`
   - All skill nodes must have a non-empty `skillKey`

2. **Key Uniqueness**:

   - `trackKey` values must be unique across all tracks
   - `lessonKey` values must be unique across all lessons
   - `skillKey` values must be unique across all skills

3. **Graph Structure**:

   - All edge source and target nodes must exist
   - Each lesson must belong to exactly one track
   - All referenced keys in inferred relationships must exist

4. **Edge Validation**:
   - Edges must connect nodes with compatible handle types
   - Multiple edges implying duplicates are treated as errors

If any validation fails, the compilation fails and error messages are returned.

## Export Format

The export is a JSON object with three arrays:

```json
{
  "tracks": TrackExport[],
  "lessons": LessonExport[],
  "skills": SkillExport[]
}
```

### TrackExport

```typescript
{
  trackKey: string;              // Authored: unique identifier
  title: string;                 // Authored: display title
  description?: string;          // Authored: optional description
  lessonKeys: string[];          // INFERRED: lessons in this track
  requiresSkills?: string[];     // INFERRED: track-level skill requirements (optional)
  _debug?: {                     // Optional: debug metadata
    nodeId: string;              // Original node UUID
    position?: { x: number; y: number };
  }
}
```

### LessonExport

```typescript
{
  lessonKey: string;             // Authored: unique identifier
  title: string;                 // Authored: display title
  goal?: string;                 // Authored: lesson goal
  setupGuidance?: string;        // Authored: setup instructions
  evaluationGuidance?: string;   // Authored: evaluation criteria
  difficultyGuidance?: string;   // Authored: difficulty notes
  trackKey: string;              // INFERRED: parent track
  requiresSkills: string[];      // INFERRED: required skills (from lesson→skill requirement edges)
  awardsSkills: string[];        // INFERRED: skills unlocked on completion
  nextLessons?: string[];        // INFERRED: suggested next lessons (from lesson→lesson edges)
  _debug?: {                     // Optional: debug metadata
    nodeId: string;              // Original node UUID
    position?: { x: number; y: number };
  }
}
```

### SkillExport

```typescript
{
  skillKey: string;              // Authored: unique identifier
  title: string;                 // Authored: display title
  description?: string;          // Authored: optional description
  unlockGuidance?: string;       // Authored: guidance when skill is unlocked
  requiredByLessons: string[];   // INFERRED: lessons that require this skill (reverse index)
  awardedByLessons: string[];    // INFERRED: lessons that unlock this skill (reverse index)
  requiredByTracks: string[];    // INFERRED: tracks that require this skill (reverse index)
  _debug?: {                     // Optional: debug metadata
    nodeId: string;              // Original node UUID
    position?: { x: number; y: number };
  }
}
```

## Example Export

```json
{
  "tracks": [
    {
      "trackKey": "beginner-piano",
      "title": "Beginner Piano",
      "description": "Introduction to piano basics",
      "lessonKeys": ["learn-c-major", "learn-f-major"],
      "requiresSkills": [],
      "_debug": {
        "nodeId": "track-123",
        "position": { "x": 100, "y": 100 }
      }
    }
  ],
  "lessons": [
    {
      "lessonKey": "learn-c-major",
      "title": "Learn C Major Scale",
      "goal": "Play the C major scale with correct fingering",
      "setupGuidance": "Place hands in C position",
      "evaluationGuidance": "Play all notes smoothly without errors",
      "difficultyGuidance": "Beginner level - focus on hand position",
      "trackKey": "beginner-piano",
      "requiresSkills": [],
      "awardsSkills": ["c-major-scale"],
      "nextLessons": ["learn-f-major"],
      "_debug": {
        "nodeId": "lesson-456",
        "position": { "x": 300, "y": 200 }
      }
    },
    {
      "lessonKey": "learn-f-major",
      "title": "Learn F Major Scale",
      "goal": "Play the F major scale",
      "trackKey": "beginner-piano",
      "requiresSkills": ["c-major-scale"],
      "awardsSkills": ["f-major-scale"],
      "nextLessons": [],
      "_debug": {
        "nodeId": "lesson-789",
        "position": { "x": 500, "y": 200 }
      }
    }
  ],
  "skills": [
    {
      "skillKey": "c-major-scale",
      "title": "C Major Scale",
      "description": "Ability to play C major scale",
      "unlockGuidance": "You've mastered the C major scale!",
      "requiredByLessons": ["learn-f-major"],
      "awardedByLessons": ["learn-c-major"],
      "requiredByTracks": [],
      "_debug": {
        "nodeId": "skill-abc",
        "position": { "x": 400, "y": 400 }
      }
    },
    {
      "skillKey": "f-major-scale",
      "title": "F Major Scale",
      "description": "Ability to play F major scale",
      "requiredByLessons": [],
      "awardedByLessons": ["learn-f-major"],
      "requiredByTracks": [],
      "_debug": {
        "nodeId": "skill-def",
        "position": { "x": 600, "y": 400 }
      }
    }
  ]
}
```

## Usage

### In QuestEditor UI

1. Open QuestEditor
2. Click the menu button (☰)
3. Select "Export Produ JSON"
4. Choose a save location (defaults to `curriculum.export.json`)

The export will validate your graph and show error messages if validation fails.

### CLI Script

Run the compiler from the command line:

```bash
npx tsx scripts/compile-curriculum.ts [input-path] [output-path]
```

Examples:

```bash
# Use default paths (quest.json -> dist/curriculum.export.json)
npx tsx scripts/compile-curriculum.ts

# Specify input file
npx tsx scripts/compile-curriculum.ts my-quest.json

# Specify both input and output
npx tsx scripts/compile-curriculum.ts quest.json dist/my-export.json
```

**Note**: The CLI script requires `tsx` to handle TypeScript path aliases. Install it if needed:

```bash
npm install --save-dev tsx
```

Or add it to your `package.json` scripts:

```json
{
  "scripts": {
    "compile-curriculum": "tsx scripts/compile-curriculum.ts"
  }
}
```

Then run:

```bash
npm run compile-curriculum [input-path] [output-path]
```

## Runtime Consumption

The exported JSON can be consumed by the runtime application to:

- **Determine track membership**: Look up which lessons are in a track via `track.lessonKeys`
- **Check skill requirements**: Check `lesson.requiresSkills` to see what skills are needed
- **Track skill unlocks**: Check `lesson.awardsSkills` to see what skills are unlocked
- **Suggest next lessons**: Use `lesson.nextLessons` to suggest what to learn next
- **Build skill dependency graph**: Use `skill.requiredByLessons`, `skill.awardedByLessons`, and `skill.requiredByTracks` for reverse lookups
- **Determine lesson availability**: Check if a user has unlocked all required skills for a lesson

No graph traversal is required at runtime - all relationships are pre-computed and explicitly included in the export.
