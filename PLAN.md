# Scene-Owned Steps Migration Plan

## Objective

Move demo authoring from index-driven scenes (`scenes[].stepIndex`) to scene-owned steps (`scenes[].steps`) so users never manually count step indices.

## Target Model

### Authoring model (new)

Users write:

```ts
scenes: [
  {
    narration: "Welcome to the dashboard",
    isIntro: true,
    steps: [
      { action: "goto", url: "https://example.com" },
      { action: "click", selector: { strategy: "id", value: "start" } },
    ],
  },
  {
    narration: "Now we create a project",
    steps: [
      { action: "type", selector: { strategy: "id", value: "name" }, text: "Demo" },
      { action: "click", selector: { strategy: "id", value: "create" } },
    ],
  },
];
```

### Runtime model (internal)

At validation time, normalize to existing runtime shape:

- `steps`: one flattened array for execution
- `scenes`: `{ narration, isIntro?, stepIndex }` boundaries derived from flattening

This preserves current behavior in `runner`, narration sync, subtitles, and audio alignment with minimal churn.

## Constraints and Non-Goals

- No behavior regression in recording, narration timing, subtitle generation, or scene timestamps.
- No immediate hard break for legacy configs; keep compatibility during transition.
- Do not rewrite runtime scene engine unless required; prefer normalization at schema boundary.
- Avoid dual-source-of-truth configs (must reject ambiguous mixed shapes).

## Implementation Strategy

## Phase 1 - Schema and Normalization Foundation

### 1.1 Define two explicit input modes in `src/schemas.ts`

Create two scene config shapes:

- **Legacy scene schema**
  - `narration: string`
  - `stepIndex: number`
  - `isIntro?: boolean`
- **Scene-owned schema (new)**
  - `narration: string`
  - `steps: Step[]` (min 1)
  - `isIntro?: boolean`

Then define config input as a union of:

- **Legacy config mode**: top-level `steps` required; scenes optional legacy scenes
- **Scene-owned mode**: top-level `steps` omitted; scenes required with `steps`

### 1.2 Enforce no mixed/ambiguous mode

Reject invalid combinations such as:

- top-level `steps` + `scenes[].steps`
- missing top-level `steps` with legacy `scenes[].stepIndex`
- both `stepIndex` and `steps` on the same scene

### 1.3 Normalize scene-owned mode to runtime format

In schema transform:

1. Flatten `scenes[].steps` into top-level `steps`
2. Compute each scene boundary `stepIndex` as cumulative length before scene steps
3. Emit normalized runtime scenes with `{ narration, isIntro, stepIndex }`
4. Keep all existing preset-resolution transforms (cursor/motion/typing/timing)

Result: downstream code still receives `DemoReelConfig` in current shape.

### 1.4 Add stronger legacy validation

For legacy `stepIndex` scenes:

- `stepIndex` must be strictly increasing
- `stepIndex` must be unique
- `stepIndex` must be within `[0, steps.length - 1]`

This prevents undefined behavior in boundary maps and narration windows.

## Phase 2 - Producer and Authoring Surfaces

### 2.1 Update script assembler output in `src/script/assembler.ts`

Change generated `.demo.ts` structure to scene-owned steps:

- Write scene narration and scene-local `steps`
- Stop emitting authored `stepIndex` values in generated file

Keep generated scenario semantics unchanged by preserving current inter-scene wait handling.

### 2.2 Update init template in `src/commands/init.ts`

Use scene-owned example config by default so first-time users see the new model immediately.

### 2.3 Keep script pipeline runtime compatibility

`script/*` internals may still carry `stepIndex` for timing/manifests. This is acceptable as internal metadata, as long as final authored `.demo.ts` is scene-owned.

## Phase 3 - Runtime Parity Verification

No major runtime rewrites expected, but validate behavior in:

- `src/runner.ts` (scene boundaries and timestamps)
- `src/index.ts` (narration generation order and sync)
- `src/narration-sync.ts` (window construction and injected padding)
- `src/video-handler.ts` (scene metadata and subtitle timing)

Because normalization outputs the same runtime shape, these modules should continue working without structural changes.

## Phase 4 - Test Plan

### 4.1 Schema tests (`test/schemas.test.ts`)

Add tests for:

- scene-owned mode success
- legacy mode success
- mixed mode rejection
- legacy invalid `stepIndex` rejection (non-monotonic, duplicate, out of range)
- scene-owned empty scene steps rejection

### 4.2 Runtime parity tests

Add/adjust tests in:

- `test/runner.test.ts`
- `test/index-runtime.test.ts`
- `test/narration-sync.test.ts`

Verify equivalent outputs between:

- legacy input (manual stepIndex)
- scene-owned input (auto-derived stepIndex)

Metrics to compare:

- scene boundaries
- scene timestamps
- narration clip ordering
- subtitle/meta scene alignment

### 4.3 Script build tests

Update `test/script-assembler.test.ts` assertions:

- `.demo.ts` output uses scene-owned `steps`
- generated output no longer relies on authored `stepIndex`

## Phase 5 - Documentation and Migration

### 5.1 README updates

Update `README.md` examples to scene-owned steps as canonical format.

Add compatibility note:

- legacy `stepIndex` format is still accepted temporarily
- migration is recommended

### 5.2 Optional migration helper (follow-up)

Possible follow-up command (not required for one-shot):

- `demo-reel migrate-scenes <file>`
- Converts legacy `steps + scenes(stepIndex)` to `scenes[].steps`

## Rollout Plan

### Release N (this implementation)

- Scene-owned format available and documented as primary
- Legacy format still supported
- Validation prevents ambiguous mode mixing

### Release N+1 (deprecation warning)

- Warn on legacy `stepIndex` authoring

### Release N+2 (optional hard cut)

- Remove legacy authoring mode if desired

## Risks and Mitigations

- **Risk:** subtle ordering regressions in narration scenes
  - **Mitigation:** parity tests comparing legacy vs scene-owned inputs

- **Risk:** incorrect boundary math during flattening
  - **Mitigation:** deterministic cumulative index tests at schema normalization layer

- **Risk:** generated configs diverge from runtime assumptions
  - **Mitigation:** update assembler tests and run end-to-end runtime tests

## Acceptance Criteria

- Users can author demos without any `stepIndex` values.
- Existing legacy configs continue to run unchanged.
- Mixed ambiguous config shapes fail with clear validation errors.
- Scene timestamps, narration sync, and subtitle/meta outputs remain consistent.
- Generated `.demo.ts` files from script pipeline use scene-owned steps by default.
