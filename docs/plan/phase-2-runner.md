# Phase 2: Extract Runner Submodules

## Objective

Split `src/runner.ts` (1392 lines, 7 concerns) into focused submodules under `src/runner/`. The original file becomes a re-export barrel.

## Files to Create

### `src/runner/types.ts` (~20 lines)

```ts
import type { Step } from "../schemas.js";

export type Point = { x: number; y: number };

export type MouseState = {
  initialized: boolean;
  position: Point;
};

export interface SceneTimestamp {
  sceneIndex: number;
  narration: string;
  isIntro: boolean;
  startMs: number;
  endMs: number;
}
```

Extracted from: `runner.ts` lines 15-25 (types), lines 1231-1236 (SceneTimestamp).

### `src/runner/selectors.ts` (~45 lines)

```ts
import type { Locator, Page } from "playwright"
import type { SelectorConfig } from "../schemas.js"

export const assertRawSelector = (selector: SelectorConfig) => { ... }
export const resolveLocatorAll = (page: Page, selector: SelectorConfig): Locator => { ... }
export const resolveLocator = (page: Page, selector: SelectorConfig): Locator => { ... }
```

Extracted from: `runner.ts` lines 47-87.

### `src/runner/typing.ts` (~50 lines)

```ts
import type { Page } from "playwright"
import type { TypingConfig } from "../schemas.js"
import type { RandomSource } from "../random.js"
import { applyJitter, clamp } from "./utils.js"

const punctuationCharacters = new Set([".", ",", "!", "?", ":", ";", "-"])
const TYPING_DELAY_JITTER = 0.15

export const getTypingDelay = (...) => { ... }
export const humanType = async (...) => { ... }
```

Extracted from: `runner.ts` lines 89-106 (getTypingDelay), lines 456-478 (humanType), lines 30 (TYPING_DELAY_JITTER), lines 89 (punctuationCharacters).

Dependencies: imports `applyJitter` from `./utils.js`.

### `src/runner/motion.ts` (~200 lines)

```ts
import type { Page, Locator } from "playwright"
import type { MotionConfig } from "../schemas.js"
import type { RandomSource } from "../random.js"
import type { Point, MouseState } from "./types.js"
import { clamp, applyJitter } from "./utils.js"
import { resolveCursorStart } from "./cursor.js"
import { getLocatorCenter, prepareLocator } from "./steps.js"  // shared helpers

const MOTION_OFFSET_JITTER = 0.15

export const cubicBezierPoint = (...) => { ... }
export const easeInOutCubic = (...) => { ... }
const easingLookup = { easeInOutCubic } as const
export const getBezierControlPoints = (...) => { ... }
const moveMouseBezier = async (...) => { ... }
const humanClick = async (...) => { ... }
const humanMoveToLocator = async (...) => { ... }
const humanScroll = async (...) => { ... }
```

Extracted from: `runner.ts` lines 338-517.

### `src/runner/cursor.ts` (~130 lines)

```ts
import type { Page } from "playwright"
import type { CursorConfig } from "../schemas.js"
import type { Point } from "./types.js"
import { clamp } from "./utils.js"

export const resolveCursorStart = (page: Page, start: Point): Point => { ... }
const cursorScript = (cursor: CursorConfig) => { ... }
export const installCursorOverlay = async (page: Page, cursor: CursorConfig) => { ... }
export const ensureCursorOverlay = async (page: Page, resolvedCursor: CursorConfig & { start: Point }) => { ... }
```

Extracted from: `runner.ts` lines 107-120 (resolveCursorStart), lines 122-277 (cursorScript), lines 279-285 (installCursorOverlay), lines 287-306 (ensureCursorOverlay).

### `src/runner/assertions.ts` (~130 lines)

```ts
import type { Page } from "playwright"
import type { Step } from "../schemas.js"
import { resolveLocator, resolveLocatorAll } from "./selectors.js"
import { buildTimeoutOption } from "./steps.js"  // or ./utils.js

const DEFAULT_ASSERTION_TIMEOUT_MS = 5000

type AssertionStep = Extract<Step, { action: "assertText" | "assertVisible" | "assertUrl" | "assertCount" }>

const matchText = (...) => { ... }
const formatExpected = (...) => { ... }

export const runAssertion = async (page: Page, step: AssertionStep): Promise<void> => { ... }
```

Extracted from: `runner.ts` lines 760-842.

### `src/runner/step-simple.ts` (~160 lines)

```ts
import type { Page } from "playwright"
import type { Step } from "../schemas.js"
import { resolveLocator, resolveLocatorAll } from "./selectors.js"
import { runAssertion } from "./assertions.js"
import { buildTimeoutOption } from "./utils.js"

const handleDialogForConfirmStep = async (page: Page, step: Extract<Step, { action: "confirm" }>) => { ... }

function getWaitFor(step: Step): boolean { ... }
function getWaitForSelector(step: Step): SelectorConfig { ... }

export const runStepSimple = async (page: Page, step: Step): Promise<void> => { ... }
```

Extracted from: `runner.ts` lines 535-758.

Note: `handleDialogForConfirmStep` is also used by full `runStep()`.

### `src/runner/steps.ts` (~290 lines)

```ts
import type { Page, Locator } from "playwright"
import type { CursorConfig, DemoReelConfig, Step } from "../schemas.js"
import type { RandomSource } from "../random.js"
import type { Point, MouseState } from "./types.js"
import { resolveLocator } from "./selectors.js"
import { humanClick, humanType, humanMoveToLocator, humanScroll } from "./typing.js"  // wait — typing exports humanType, motion exports the rest
// Actually:
import { humanClick, humanMoveToLocator, humanScroll, moveMouseBezier } from "./motion.js"
import { humanType } from "./typing.js"
import { ensureCursorOverlay } from "./cursor.js"
import { runAssertion } from "./assertions.js"

const applyStepDelay = async (...) => { ... }
const ensureMouseStart = async (...) => { ... }
export const prepareLocator = async (locator: Locator) => { ... }
export const getLocatorCenter = async (locator: Locator) => { ... }
const applyStartDelayIfNeeded = async (...) => { ... }
const runWithConfirm = async (...) => { ... }

export const runStep = async (...) => { ... }
```

Extracted from: `runner.ts` lines 308-336 (locator helpers), lines 41-45 (applyStepDelay), lines 308-317 (ensureMouseStart), lines 519-533 (applyStartDelayIfNeeded), lines 569-586 (runWithConfirm), lines 844-1085 (runStep).

### `src/runner/scene-tracking.ts` (~90 lines)

```ts
import { type DemoReelConfig } from "../schemas.js"
import type { SceneTimestamp } from "./types.js"

export function buildSceneBoundaries(scenes: DemoReelConfig["scenes"]): Map<number, number> { ... }
export function buildSceneTimestamps(...): SceneTimestamp[] { ... }
```

Extracted from: `runner.ts` lines 1238-1287.

### `src/runner/index.ts` (~90 lines)

```ts
import type { Page } from "playwright"
import type { DemoReelConfig, DemoReelConfigInput, Step } from "../schemas.js"
import type { RandomSource } from "../random.js"
import type { SceneTimestamp } from "./types.js"
import { installCursorOverlay, ensureCursorOverlay } from "./cursor.js"
import { runStep } from "./steps.js"
import { runStepSimple } from "./step-simple.js"
import { runAssertion } from "./assertions.js"
import { buildSceneBoundaries } from "./scene-tracking.js"

export const formatStepForLog = (step: Step): string => { ... }

export const runSteps = async (...) => { ... }

export const runDemo = async (page: Page, config: DemoReelConfig): Promise<SceneTimestamp[]> => { ... }

export interface RunScenarioForTestOptions { ... }
export const runScenarioForTest = async (...) => { ... }

// Re-export everything consumers need
export type { SceneTimestamp } from "./types.js"
export { runStepSimple } from "./step-simple.js"
export { runAssertion } from "./assertions.js"
export { runStep } from "./steps.js"
// etc.
```

Extracted from: `runner.ts` lines 1087-1392 (formatStepForLog, runSteps, runDemo, runScenarioForTest, collectMainSteps).

### `src/runner/utils.ts` (~15 lines)

Small utility file to break circular dependency between `motion.ts` and `steps.ts`:

```ts
export const clamp = (value: number, min: number, max: number) => { ... }
export const applyJitter = (value: number, jitter: number, rng?: RandomSource) => { ... }
export const buildTimeoutOption = (timeoutMs?: number) => { ... }
export const isConfirmStep = (step: Step | undefined): step is Extract<Step, { action: "confirm" }> => { ... }
```

## Files to Modify

### `src/runner.ts`

Replace all content with re-exports:

```ts
// Re-export everything from submodules
export { clamp, applyJitter, buildTimeoutOption, isConfirmStep } from "./runner/utils.js";
export type { Point, MouseState, SceneTimestamp } from "./runner/types.js";
export { assertRawSelector, resolveLocatorAll, resolveLocator } from "./runner/selectors.js";
export { getTypingDelay, humanType } from "./runner/typing.js";
export { cubicBezierPoint, easeInOutCubic, getBezierControlPoints } from "./runner/motion.js";
export { installCursorOverlay, ensureCursorOverlay, resolveCursorStart } from "./runner/cursor.js";
export { runAssertion } from "./runner/assertions.js";
export { runStepSimple } from "./runner/step-simple.js";
export { runStep, prepareLocator, getLocatorCenter } from "./runner/steps.js";
export { buildSceneBoundaries, buildSceneTimestamps } from "./runner/scene-tracking.js";
export { runDemo, runSteps, runScenarioForTest, formatStepForLog } from "./runner/index.js";
export type { RunScenarioForTestOptions } from "./runner/index.js";
```

Every import that exists today must continue to work.

### `src/video-handler.ts` (import check)

Verify imports still resolve. Currently imports from `"./runner.js"`:

```ts
import { runDemo, runSteps, runStepSimple, type SceneTimestamp } from "./runner.js";
```

This continues working because `runner.ts` re-exports from submodules.

### `src/index.ts` (public API re-exports)

Verify re-exports still resolve:

```ts
export {
  runScenarioForTest,
  runSteps,
  runStepSimple,
  runAssertion,
  formatStepForLog,
  type RunScenarioForTestOptions,
} from "./runner.js";
```

### Test files

No test changes needed — they import from `"../src/runner.js"` which remains a valid entry point.

## Circular Dependency Prevention

Potential cycles:

- `motion.ts` ↔ `steps.ts` (motion uses `getLocatorCenter`/`prepareLocator`, steps uses `humanClick`/`humanScroll`)

**Solution:** Move `prepareLocator` and `getLocatorCenter` into `utils.ts` or a shared `locator-utils.ts` file. These are simple helper functions that don't depend on motion or step execution logic.

Or simplify: keep `getLocatorCenter` and `prepareLocator` in `steps.ts`, and have `motion.ts` import them from there — that's fine, it's a one-direction import (`motion` imports from `steps`, not the other way).

Wait — `steps.ts` also imports from `motion.ts` (`humanClick`, `moveMouseBezier`). This creates a circular dependency. Solution:

```
utils.ts              ← no deps on runner/*
  clamp, applyJitter, buildTimeoutOption, isConfirmStep,
  prepareLocator, getLocatorCenter

motion.ts             ← imports utils.ts, types.ts, cursor.ts
  bezier math, mouse movement, humanClick, humanScroll

steps.ts              ← imports utils.ts, types.ts, motion.ts, selectors.ts, cursor.ts, assertions.ts, typing.ts
  runStep (uses motion functions)
```

`getLocatorCenter` and `prepareLocator` move to `utils.ts` so both `motion.ts` and `steps.ts` can import them without a cycle.

## Verification

```bash
pnpm lint
pnpm test test/runner.test.ts test/runner-browser.test.ts test/video-handler.test.ts
pnpm build
```

Key test files:

- `test/runner.test.ts` — tests selectors, assertions, typing, motion math
- `test/runner-browser.test.ts` — integration tests with Playwright
- `test/video-handler.test.ts` — tests video handler (uses runner)
- All 40+ test files that import from `runner.js`

## Dependencies

- Phase 1 (optional but recommended — cleaner codebase before this refactor)

## Backward Compatibility

Every public export from `src/runner.ts` today must remain available at the same import path. No consumer code changes needed.
