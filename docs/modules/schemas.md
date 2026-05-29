# Schemas Module

## Purpose

Zod-first validation for all configuration. Two-phase schema (input → output) that accepts presets and expands them into fully-resolved configuration objects.

## Location

`src/schemas/` (6 modules) + `src/schemas.ts` (barrel re-export)

| File                    | Purpose                             |
| ----------------------- | ----------------------------------- |
| `schemas/index.ts`      | Barrel re-export                    |
| `schemas/primitives.ts` | Resolution, cursor, motion, timing  |
| `schemas/selector.ts`   | Selector strategies                 |
| `schemas/steps.ts`      | All step schemas + Step union type  |
| `schemas/config.ts`     | Video, audio, auth config schemas   |
| `schemas/scenes.ts`     | Scene + DemoReelConfig input schema |
| `schemas/transform.ts`  | Output type + resolve transforms    |

## Design

### Two-Phase Validation

```
User Input (presets allowed) → demoReelConfigInputSchema → demoReelConfigSchema → Fully Resolved Config
```

**Input schema** — Accepts preset strings:

```ts
// User writes:
{ cursor: "dot", motion: "smooth", typing: "humanlike" }

// Input schema accepts these as valid
```

**Output schema** — Fully resolved:

```ts
// After validation:
{
  cursor: { type: "dot", size: 12, borderWidth: 2, ... },
  motion: { moveDurationMs: 600, moveStepsMin: 25, ... },
  typing: { baseDelayMs: 80, spaceDelayMs: 120, ... }
}
```

### Exported Types and Schemas

| Export                      | Kind                | Purpose                                             |
| --------------------------- | ------------------- | --------------------------------------------------- | -------- | ------- | ------ | -------------- | --------- |
| `demoReelConfigInputSchema` | Zod schema          | Validates user input (presets allowed)              |
| `demoReelConfigSchema`      | Zod schema          | Validates resolved config (no presets)              |
| `DemoReelConfig`            | Type                | Fully-validated, normalized config                  |
| `DemoReelConfigInput`       | Type                | User-provided config with presets                   |
| `CursorConfig`              | Type                | Resolved cursor: type, size, colors, start position |
| `CursorPresetOrConfig`      | Type                | Preset string or full config                        |
| `MotionConfig`              | Type                | Resolved motion: duration, steps, curve params      |
| `TypingConfig`              | Type                | Resolved typing: delays per character type          |
| `TimingConfig`              | Type                | Resolved timing: goto delay, end delay, sync mode   |
| `VideoConfig`               | Type                | Resolution + format                                 |
| `AudioConfig`               | Type                | Narration/background paths + volumes                |
| `AuthConfig`                | Type                | Storage, validation, login steps, behavior          |
| `SelectorConfig`            | Type                | Strategy + value + optional index                   |
| `SelectorStrategy`          | Type                | `"testId"                                           | "id"     | "class" | "href" | "data-node-id" | "custom"` |
| `Step`                      | Discriminated union | All 17 step action types                            |
| `NarrationSyncMode`         | Type                | `"auto"                                             | "strict" | "off"`  |
| `ResolutionPreset`          | Type                | `"HD"                                               | "FHD"    | "2K"    | "4K"`  |
| `RandomizationConfig`       | Type                | Seed for deterministic randomness                   |

### Preset Resolution

| Preset String         | Expands To                          | Source                                  |
| --------------------- | ----------------------------------- | --------------------------------------- |
| `cursor: "dot"`       | 12px white circle with black shadow | `presets.ts :: cursorPresets.dot`       |
| `cursor: "arrow"`     | SVG arrow icon (24x24)              | `presets.ts :: cursorPresets.arrow`     |
| `cursor: "none"`      | Invisible zero-size dot             | `presets.ts :: cursorPresets.none`      |
| `motion: "smooth"`    | 600ms, 25 steps, eased bezier       | `presets.ts :: motionPresets.smooth`    |
| `motion: "snappy"`    | 300ms, 15 steps, eased bezier       | `presets.ts :: motionPresets.snappy`    |
| `motion: "instant"`   | 0ms, 1 step, no animation           | `presets.ts :: motionPresets.instant`   |
| `typing: "humanlike"` | 80ms base, 120ms space, 200ms punct | `presets.ts :: typingPresets.humanlike` |
| `typing: "fast"`      | 40ms base, 60ms space, 100ms punct  | `presets.ts :: typingPresets.fast`      |
| `typing: "instant"`   | 0ms all delays                      | `presets.ts :: typingPresets.instant`   |
| `timing: "normal"`    | 2000ms goto delay, 2000ms end delay | `presets.ts :: timingPresets.normal`    |
| `timing: "fast"`      | 1000ms goto delay, 1000ms end delay | `presets.ts :: timingPresets.fast`      |
| `timing: "instant"`   | 0ms all delays, sync off            | `presets.ts :: timingPresets.instant`   |
| `resolution: "HD"`    | 1280x720                            | Built-in                                |
| `resolution: "FHD"`   | 1920x1080                           | Built-in                                |
| `resolution: "2K"`    | 2560x1440                           | Built-in                                |
| `resolution: "4K"`    | 3840x2160                           | Built-in                                |

### Scene/Step Normalization

Two config formats are supported:

**Scene-owned steps (new format):**

```ts
{
  scenes: [
    {
      narration: "...",
      steps: [
        { action: "goto", url: "..." },
        { action: "click", selector: "..." },
      ],
    },
  ];
}
// Normalized to: steps = [/* all steps flattened */], scenes = [{ stepIndex: 0 }, { stepIndex: 2 }, ...]
```

**Index-referenced steps (legacy format):**

```ts
{
  steps: [{ action: "goto" }, { action: "click" }, { action: "type" }, { action: "wait" }],
  scenes: [{ narration: "..." , stepIndex: 0 }, { narration: "...", stepIndex: 2 }]
}
```

Mixed formats (some scenes have steps, some use stepIndex) are rejected.

### Zod Discrimination

Steps use `z.discriminatedUnion("action", ...)` enabling:

- Exhaustive type checking on `step.action`
- Auto-completion for each action type's specific fields
- Runtime validation of step shape based on action

Cursor config uses `z.discriminatedUnion("type", [dot, svg])` for the same benefits.

### Refinements

Custom validations beyond type checking:

- **motion:** `curve.offsetMax >= curve.offsetMin`
- **resolution:** Preset string OR custom `{ width, height }`
- **voice:** Discriminated by `provider` field: piper (voice or voicePath), openai, elevenlabs
- **auth storage:** At least one storage type must be in `types` array
