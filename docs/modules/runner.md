# Runner Module

## Purpose

Step execution engine for demo-reel. Handles cursor overlay rendering, human-like mouse movement (Bezier curves), typing simulation, and all 17 step action types. Extracted from `runner.ts` (1392 lines → ~8 focused files).

## Location

`src/runner/`

## File Map

| File                | Lines | Concern                                                                                             |
| ------------------- | ----- | --------------------------------------------------------------------------------------------------- |
| `index.ts`          | ~80   | Top-level entry: `runDemo()`, `runSteps()`, `runScenarioForTest()`                                  |
| `cursor.ts`         | ~120  | Cursor overlay DOM injection, `installCursorOverlay()`, `ensureCursorOverlay()`                     |
| `motion.ts`         | ~180  | Bezier mouse movement, `moveMouseBezier()`, `humanClick()`, `humanScroll()`, `humanMoveToLocator()` |
| `typing.ts`         | ~40   | Human-like typing, `humanType()`, `getTypingDelay()`                                                |
| `steps.ts`          | ~280  | `runStep()` — full human-like step execution with cursor                                            |
| `step-simple.ts`    | ~150  | `runStepSimple()` — fast no-cursor step execution                                                   |
| `assertions.ts`     | ~120  | All `assert*` actions: `assertText`, `assertVisible`, `assertUrl`, `assertCount`                    |
| `selectors.ts`      | ~40   | `resolveLocator()`, `resolveLocatorAll()`, `assertRawSelector()`                                    |
| `scene-tracking.ts` | ~80   | Scene boundaries, timestamp building, `buildSceneBoundaries()`, `buildSceneTimestamps()`            |
| `types.ts`          | ~20   | `MouseState`, `Point`, `SceneTimestamp`                                                             |

## Entry Points

### `runDemo()` — Production Entry

```ts
export const runDemo = async (page: Page, config: DemoReelConfig): Promise<SceneTimestamp[]>
```

Full production execution:

1. Install cursor overlay
2. For each step: track scene boundaries, run step with cursor animation, handle `confirm` pairs
3. Return scene timestamps for audio placement + subtitles

### `runSteps()` — Setup/Cleanup Entry

```ts
export const runSteps = async (
  page: Page,
  preSteps: Step[],
  options?: { tolerant?: boolean; verbose?: boolean; label?: string }
): Promise<void>
```

Fast execution for pre/post steps:

- `tolerant: true` — swallow errors (cleanup shouldn't fail the pipeline)
- `tolerant: false` — throw on first error (test/pre-flight validation)
- Uses `runStepSimple()` (no cursor, no animation)

### `runScenarioForTest()` — Test Entry

```ts
export const runScenarioForTest = async (
  page: Page,
  config: DemoReelConfig | DemoReelConfigInput,
  options?: { verbose?: boolean; runAuth?: boolean; skipCleanup?: boolean }
): Promise<void>
```

Fast execution for test runners (Vitest, Playwright Test):

- No video recording
- No cursor overlay
- Uses `runStepSimple()` for speed
- Configurable: `runAuth: true` to run login steps, `skipCleanup: true` to skip post-steps

## Submodule Details

### `cursor.ts` — Cursor Overlay

**Key functions:**

- `installCursorOverlay(page, cursor)` — Inject CSS + DOM element via `addInitScript` + `evaluate`
- `ensureCursorOverlay(page, cursor)` — Re-inject after navigation (page change clears DOM)
- `resolveCursorStart(page, start)` — Clamp start position to viewport bounds

**Cursor types:**

- **dot** — CSS circle with border + shadow, configurable size/colors
- **svg** — Custom SVG markup with hotspot offset
- **none** — Invisible (zero-size transparent dot)

**Persistence:** If `cursor.persistPosition: true`, cursor position is stored in `localStorage` and restored across navigations.

### `motion.ts` — Mouse Movement

**Key functions:**

- `moveMouseBezier(page, state, targetX, targetY, motion, rng)` — Bezier curve interpolation with easing
- `humanClick(page, locator, state, motion, start, rng)` — Move to element + mouse down/delay/up
- `humanScroll(page, deltaX, deltaY, motion)` — Eased scroll with step interpolation
- `humanMoveToLocator(page, locator, state, motion, start, rng)` — Move cursor to element center

**Bezier math:**

```ts
cubicBezierPoint(t, p0, p1, p2, p3) → Point
  // Cubic Bezier: B(t) = (1-t)³P0 + 3(1-t)²tP1 + 3(1-t)t²P2 + t³P3

easeInOutCubic(t) → number
  // Easing: slow start → fast middle → slow end

getBezierControlPoints(start, end, motion, rng) → { control1, control2 }
  // Control points offset perpendicular to motion axis for natural curves
```

**Configuration (motion config):**

- `moveDurationMs` — Total animation duration
- `moveStepsMin` — Minimum interpolation steps
- `stepsPerPx` — Steps per pixel (higher = smoother)
- `clickDelayMs` — Pause before/after click
- `curve.offsetRatio` — Perpendicular deviation ratio
- `curve.offsetMin/Max` — Clamp limits for random offset
- `curve.easing` — Easing function (currently "easeInOutCubic")

### `typing.ts` — Typing Simulation

```ts
humanType(page, text, typing, baseDelayOverride?, rng?) → Promise<void>
getTypingDelay(character, typing, baseDelay) → number
```

Per-character delays with punctuation-aware timing:

- Normal characters: `baseDelayMs`
- Spaces: `baseDelayMs + spaceDelayMs`
- Punctuation (`.`, `,`, `!`, `?`, `:`, `;`, `-`): `baseDelayMs + punctuationDelayMs`
- Enter: `baseDelayMs + enterDelayMs`

All delays have 15% jitter when randomization is enabled.

### `steps.ts` — Full Step Execution

```ts
runStep(page, step, config, state, cursorStart, resolvedCursor, startDelayApplied, rng) → Promise<boolean>
```

Handles all 17 step types with cursor animation. Returns whether the start delay has been applied (prevents double-wait after `goto`).

**Flow for each step:**

1. If `goto` → navigate + re-inject cursor overlay + apply start delay
2. If `wait` → simple timeout
3. If `click`/`hover`/`type` → apply delays + move cursor + perform action
4. If assertions → apply delays + verify (no cursor movement)
5. If `drag` → move to source + mouse down + move to target + mouse up

### `step-simple.ts` — Fast Step Execution

```ts
runStepSimple(page, step) → Promise<void>
```

Same 17 step types but:

- No cursor overlay
- No mouse movement animation
- No typing delays
- Uses Playwright's native `.click()`, `.type()`, `.fill()` directly
- Used for setup/cleanup steps and test runners

### `assertions.ts` — Assertion Actions

```ts
runAssertion(page, step: AssertionStep) → Promise<void>

type AssertionStep = Extract<Step, { action: "assertText" | "assertVisible" | "assertUrl" | "assertCount" }>
```

- **assertText** — Wait for element visible, compare text content (exact or substring, regex support)
- **assertVisible** — Wait for element visible/hidden state
- **assertUrl** — Poll page URL until match (supports regex)
- **assertCount** — Poll element count until target count reached

Default timeout: 5000ms (configurable per step).

### `selectors.ts` — Selector Resolution

```ts
resolveLocatorAll(page, selector) → Locator   // All matching elements
resolveLocator(page, selector) → Locator       // First match (or nth if index specified)
assertRawSelector(selector) → void             // Validate raw name strategies
```

Six strategies:

1. `testId` → `page.getByTestId()`
2. `id` → `page.locator('#value')`
3. `class` → `page.locator('.value')`
4. `href` → `page.locator('a[href="value"]')`
5. `data-node-id` → `page.locator('[data-node-id=value]')`
6. `custom` → `page.locator(value)` (arbitrary CSS/XPath)

`assertRawSelector()` prevents incorrect usage: `id`/`class` strategies must pass raw names without `#`/`.` prefixes.

### `scene-tracking.ts` — Scene Timestamp Building

```ts
buildSceneBoundaries(scenes) → Map<number, number>    // stepIndex → sceneIndex
buildSceneTimestamps(scenes, boundaries, steps, nowProvider, recordingStart) → SceneTimestamp[]

interface SceneTimestamp {
  sceneIndex: number
  narration: string
  isIntro: boolean
  startMs: number       // Recording-relative milliseconds
  endMs: number
}
```

Tracks when each scene starts and ends during recording, enabling:

- Narration audio placement at the correct timestamps
- Subtitle generation with scene-level accuracy
- Metadata JSON with visual + audio timing

## Utilities

| Function                          | Purpose                                            |
| --------------------------------- | -------------------------------------------------- |
| `clamp(value, min, max)`          | Clamp value to range                               |
| `applyJitter(value, jitter, rng)` | Randomize value within jitter percentage           |
| `formatStepForLog(step)`          | Human-readable step description for verbose output |
| `buildTimeoutOption(timeoutMs?)`  | Build Playwright timeout option object             |
| `isConfirmStep(step)`             | Type guard for `confirm` action                    |

## Presets Integration

Runner consumes resolved (not preset) config. The schemas layer expands presets:

- `cursor: "dot"` → `cursorPresets.dot`
- `motion: "smooth"` → `motionPresets.smooth`
- `typing: "humanlike"` → `typingPresets.humanlike`
- `timing: "normal"` → `timingPresets.normal`
