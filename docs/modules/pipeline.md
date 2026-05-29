# Pipeline Module

## Purpose

The pipeline module provides the orchestration framework that composes and runs the sequential stages of demo generation. It replaces the current inline orchestration in `index.ts::generate()`.

## Location

`src/pipeline/`

## Files

### `types.ts` — Stage Interface

```ts
export interface Stage {
  readonly name: string;
  run(ctx: PipelineContext): Promise<void> | void;
}
```

The `Stage` interface is the fundamental abstraction. Every stage:

- Has a human-readable `name` for logging
- Receives the shared `PipelineContext`
- Is async (returns `Promise<void>` or `void`)

### `context.ts` — PipelineContext

Mutable bag shared across all stages. Acts as the single communication channel between stages — no temp files, no global state.

```ts
export class PipelineContext {
  // --- Input (set before pipeline runs) ---
  readonly config: DemoReelConfig;
  readonly configPath: string;
  readonly outputPath: string;
  readonly verbose: boolean;
  readonly dryRun: boolean;
  readonly headed: boolean;
  readonly noCache: boolean;

  // --- Produced by stages (accumulated progressively) ---
  audioPath?: string;
  narrationManifest?: NarrationManifest;
  narrationManifestPath?: string;
  narrationPlacements?: NarrationPlacement[];
  tempVideoPath?: string;
  finalVideoPath?: string;
  sceneTimestamps?: SceneTimestamp[];
  warnings: string[] = [];

  // --- Supplied to stages that need them ---
  browserPool?: BrowserPool;
}
```

### `orchestrator.ts` — runPipeline()

```ts
export async function runPipeline(stages: Stage[], ctx: PipelineContext): Promise<void> {
  for (const stage of stages) {
    if (ctx.verbose) console.log(`Stage: ${stage.name}`);
    await stage.run(ctx);
  }
}
```

Sequential, blocking execution. Each stage:

1. Checks its own preconditions (e.g., `TTSStage` skips if no voice + narration)
2. Performs its work
3. Writes results back to `ctx`

## Design Rationale

### Why a pipeline?

The tool is fundamentally a sequential transform:

```
Config → [TTS] → [Auth] → [PreSteps] → [Record] → [Mix] → [Output] → [PostSteps]
```

Making this explicit:

- Each stage has a single responsibility
- Stages are independently testable
- New stages can be added without touching existing code
- Execution order is visible and documented

### Why a shared mutable context?

Alternatives considered:

- **Message passing between stages** — Overly complex for a linear pipeline
- **Immutable context with new objects** — Memory overhead, harder to trace
- **Global singletons** — Untestable

The mutable context bag is the simplest solution for a linear, non-concurrent pipeline. It's testable (just populate the fields a stage needs), debuggable (inspect ctx between stages), and simple (no framework overhead).

### Why not middleware/plugin architecture?

The pipeline is always the same sequence. There's no need for dynamic composition, conditional execution, or user-configurable middleware chains. A simple array of stages + for-loop is sufficient and avoids the complexity of Express/Koa-style middleware.

## Usage

```ts
import { PipelineContext } from "./pipeline/context.js";
import { runPipeline } from "./pipeline/orchestrator.js";
import { TTSStage } from "./stages/tts.js";
import { RecordingStage } from "./stages/recording.js";
// ...

export async function generate(config: DemoConfig, options: GenerateOptions = {}): Promise<void> {
  const resolved = validateConfig(config);
  const ctx = new PipelineContext({
    config: resolved,
    configPath: resolve(options.configPath ?? process.cwd()),
    outputPath: resolveOutputPath(resolved),
    verbose: options.verbose ?? false,
    dryRun: options.dryRun ?? false,
    headed: options.headed ?? false,
    noCache: options.noCache ?? false,
  });

  const stages: Stage[] = [
    new TTSStage(),
    new AuthStage(),
    new PreStepsStage(),
    new RecordingStage(),
    new AudioMixStage(),
    new OutputStage(),
    new PostStepsStage(),
  ];

  await runPipeline(stages, ctx);

  for (const warning of ctx.warnings) {
    console.warn(`Warning: ${warning}`);
  }
}
```
