# Design Model

## Domain Model

```
┌─────────────────────────────────────────────────────────────┐
│                     DemoReelConfig                           │
│  (validated by demoReelConfigSchema)                         │
├─────────────────────────────────────────────────────────────┤
│  name?: string              video: VideoConfig               │
│  outputPath?: string        audio?: AudioConfig              │
│  outputDir?: string         cursor: CursorConfig             │
│  outputFormat?: "mp4|webm"  motion: MotionConfig             │
│  timestamp?: boolean        typing: TypingConfig             │
│  steps: Step[]              timing: TimingConfig             │
│  scenes?: Scene[]           voice?: VoiceConfig              │
│  preSteps?: Step[]          auth?: AuthConfig                │
│  postSteps?: Step[]         randomization?: RandomConfig     │
│  setup?: Step[]             tags?: string[]                  │
│  cleanup?: Step[]                                            │
└─────────────────────────────────────────────────────────────┘
```

### Core Entities

| Entity                | Description                                                  | Defined In              |
| --------------------- | ------------------------------------------------------------ | ----------------------- |
| `DemoReelConfig`      | Fully-validated, normalized demo configuration               | `schemas.ts`            |
| `DemoReelConfigInput` | User-provided config (presets allowed)                       | `schemas.ts`            |
| `Step`                | A single browser action (17 types)                           | `schemas.ts`            |
| `Scene`               | A named segment with narration + step index                  | `schemas.ts`            |
| `SceneTimestamp`      | Scene timing: index, narration, startMs, endMs               | `runner.ts`             |
| `NarrationManifest`   | Per-clip narration metadata (audio path, duration)           | `narration-manifest.ts` |
| `NarrationClipInfo`   | Single clip: sceneIndex, narration, duration, gap            | `narration-sync.ts`     |
| `NarrationPlacement`  | Placed clip: sceneIndex, narration, clipPath, startMs, endMs | `audio-processor.ts`    |
| `VoiceConfig`         | TTS provider + voice + speed                                 | `voice-config.ts`       |
| `AuthConfig`          | Storage, validation, login steps, behavior                   | `schemas.ts`            |
| `SessionData`         | Cookies + localStorage snapshot                              | `auth.ts`               |
| `SyncReport`          | Diagnostic output from narration sync                        | `narration-sync.ts`     |
| `PipelineContext`     | Mutable bag shared across stages                             | `pipeline/context.ts`   |
| `BrowserSession`      | Browser + context + page handle                              | `browser/types.ts`      |

### Step Types (17 actions)

| Action          | Description                                           | Cursor movement      |
| --------------- | ----------------------------------------------------- | -------------------- |
| `goto`          | Navigate to URL                                       | No                   |
| `wait`          | Pause for ms                                          | No                   |
| `waitFor`       | Wait for selector/url/state/request/response/function | No                   |
| `click`         | Click element                                         | Yes (bezier)         |
| `hover`         | Move cursor to element                                | Yes (bezier)         |
| `type`          | Type text into element                                | Yes (click + type)   |
| `press`         | Press keyboard key on element                         | No                   |
| `scroll`        | Scroll element                                        | Yes (moveto + wheel) |
| `select`        | Select option from dropdown                           | No                   |
| `check`         | Check/uncheck checkbox                                | No                   |
| `upload`        | Upload file to input                                  | No                   |
| `drag`          | Drag source element to target                         | Yes (bezier)         |
| `confirm`       | Accept/dismiss dialog                                 | No                   |
| `assertText`    | Verify text content                                   | No                   |
| `assertVisible` | Verify visibility                                     | No                   |
| `assertUrl`     | Verify URL                                            | No                   |
| `assertCount`   | Verify element count                                  | No                   |

## Design Patterns

### 1. Pipeline (Architectural)

```
Config → [TTS] → [Auth] → [PreSteps] → [Recording] → [AudioMix] → [Output] → [PostSteps]
```

Each stage is isolated, independently testable, and communicates only through `PipelineContext`.

```ts
interface Stage {
  readonly name: string;
  run(ctx: PipelineContext): Promise<void> | void;
}

async function runPipeline(stages: Stage[], ctx: PipelineContext): Promise<void> {
  for (const stage of stages) {
    await stage.run(ctx);
  }
}
```

### 2. Command (Behavioral)

Every CLI operation implements the `Command` interface. The CLI entry point uses `CommandRegistry` to discover and dispatch.

```ts
interface Command {
  readonly name: string;
  validate(args: string[], options: GlobalOptions): boolean;
  execute(args: string[], options: GlobalOptions, ctx: CommandContext): Promise<number>;
}
```

### 3. Strategy (Behavioral)

**TTS Provider** — Three interchangeable TTS backends:

- `PiperProvider` — local/free, no API key needed
- `OpenAIProvider` — cloud, high-quality voices
- `ElevenLabsProvider` — cloud, curated voice IDs

**Selector Strategy** — Six resolution strategies prioritized:

1. `testId` — `page.getByTestId()`
2. `id` — `page.locator('#...')`
3. `href` — `page.locator('a[href="..."]')`
4. `class` — `page.locator('.class-name')`
5. `data-node-id` — `page.locator('[data-node-id=...]')`
6. `custom` — arbitrary CSS/XPath

### 4. Dependency Injection (via Context)

Commands receive a `CommandContext` with abstracted filesystem and console operations. This makes commands testable without real filesystem I/O.

```ts
interface CommandContext {
  fs: { writeFile: WriteFile };
  cwd: () => string;
  console: { log: (msg: string) => void; error: (msg: string) => void };
}
```

### 5. Adapter (Structural)

The `PipelineContext` acts as an adapter between stage outputs and stage inputs. A stage writes results (e.g., `ctx.narrationManifest`) and downstream stages read them — no direct coupling.

### 6. Template Method (Behavioral)

`runStep()` and `runStepSimple()` provide two execution templates for steps:

- `runStep()` — full human-like: cursor animation, bezier motion, typing delays
- `runStepSimple()` — fast: direct click, instant type, no cursor

Both handle the same 17 step types but with different "realism" levels.

## Zod-First Validation

All configuration flows through two Zod schema phases:

1. **Input schema** (`demoReelConfigInputSchema`) — accepts preset strings (e.g., `cursor: "dot"`)
2. **Output schema** (`demoReelConfigSchema`) — normalized/resolved objects (presets expanded)

Scene-owned steps (`scenes[].steps[]`) are normalized into the runtime format (flat `steps[]` + `scenes[]` with `stepIndex`). Legacy format (top-level `steps[]` + `scenes[].stepIndex`) is still supported but mixed formats are rejected.

## Narration Sync Model

The sync engine uses a **scene window** model: each scene owns all steps from its `stepIndex` up to (exclusive) the next scene's `stepIndex`.

Three modes:

- **`auto`** — pads step delays to prevent overlap, warns on overflow
- **`strict`** — fails on any timing deficit (step durations can't cover narration)
- **`off`** — skip sync entirely (passthrough)

```
Example: scenes at [4, 6] with 10 total steps
  Scene 0 window: steps 4..5  (stepIndex 4, endStep 6)
  Scene 1 window: steps 6..9  (stepIndex 6, endStep 10)
```

## Migration Principles

1. **Backward compatible** — Old imports work via re-exports until final cleanup
2. **No user-facing changes** — `.demo.ts` files, CLI interface unchanged
3. **Incremental** — Each phase is independently shippable
4. **Test-preserving** — Existing tests stay; new tests added for new modules
