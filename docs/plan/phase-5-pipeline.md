# Phase 5: Pipeline Orchestrator + Stages

## Objective

Create the pipeline framework (`src/pipeline/`) and stage implementations (`src/stages/`). This is the largest phase — it replaces the inline orchestration in `src/index.ts::generate()` with explicit, testable stages.

## Architecture Change

```
BEFORE: generate() orchestrates everything inline
  → dynamic import tts → generate audio
  → read manifest → sync narration
  → write temp JSON
  → dynamic import config-loader → load config from JSON
  → dynamic import video-handler → runVideoScenario
    → startBrowser → handleAuth → runSteps (pre) → close
    → startRecording → handleAuth → runDemo → stopRecording
    → processVideoWithAudio → buildSubtitleCues → generateSRT/VTT → generateMetadata
    → startBrowser → handleAuth → runSteps (post) → close

AFTER: generate() composes stages, delegates to runPipeline()
  → TTSStage: generate audio
  → AuthStage: login + save session
  → PreStepsStage: setup
  → RecordingStage: record demo video
  → AudioMixStage: merge audio+video, auto-shift overlaps
  → OutputStage: subtitles, metadata, cleanup
  → PostStepsStage: cleanup steps

Note: NarrationSyncStage exists at src/stages/sync.ts as an optional
stage for custom pipeline compositions. The default pipeline uses
post-recording auto-shift instead.
```

## Files to Create

### `src/pipeline/types.ts` (~6 lines)

```ts
import type { PipelineContext } from "./context.js";

export interface Stage {
  readonly name: string;
  run(ctx: PipelineContext): Promise<void> | void;
}
```

### `src/pipeline/context.ts` (~40 lines)

```ts
import type { DemoReelConfig } from "../schemas.js";
import type { NarrationManifest } from "../narration-manifest.js";
import type { NarrationPlacement } from "../ffmpeg/utils.js";
import type { SceneTimestamp } from "../runner/types.js";
import type { BrowserPool } from "../browser/pool.js";

export class PipelineContext {
  readonly config: DemoReelConfig;
  readonly configPath: string;
  readonly outputPath: string;
  readonly verbose: boolean;
  readonly dryRun: boolean;
  readonly headed: boolean;

  narrationManifest?: NarrationManifest;
  narrationPlacements?: NarrationPlacement[];
  tempVideoPath?: string;
  finalVideoPath?: string;
  sceneTimestamps?: SceneTimestamp[];
  warnings: string[] = [];
  browserPool?: BrowserPool;

  constructor(params: {
    config: DemoReelConfig;
    configPath: string;
    outputPath: string;
    verbose: boolean;
    dryRun: boolean;
    headed: boolean;
  }) {
    Object.assign(this, params);
  }
}
```

### `src/pipeline/orchestrator.ts` (~15 lines)

```ts
import type { Stage } from "./types.js";
import type { PipelineContext } from "./context.js";

export async function runPipeline(stages: Stage[], ctx: PipelineContext): Promise<void> {
  for (const stage of stages) {
    if (ctx.verbose) console.log(`Stage: ${stage.name}`);
    await stage.run(ctx);
  }
}
```

### Stage files (8 files in `src/stages/`)

See `docs/modules/stages.md` for full specifications. Below are the key details.

#### `src/stages/tts.ts`

```ts
export class TTSStage implements Stage {
  readonly name = "TTS";

  async run(ctx: PipelineContext): Promise<void> {
    // Skip conditions
    const hasVoice = Boolean(ctx.config.voice);
    const hasNarration = (ctx.config.scenes ?? []).some((s) => Boolean(s.narration));
    const hasNarrationAudio = Boolean(
      ctx.config.audio?.narration || ctx.config.audio?.narrationManifest,
    );
    if (!hasVoice || !hasNarration || hasNarrationAudio) return;

    // Import internally (dynamic — optional peer deps)
    const { generateVoiceSegments, generateNarrationAudio } = await import("../script/tts.js");
    const { resolveVoiceConfig } = await import("../voice-config.js");

    const resolvedVoice = resolveVoiceConfig(ctx.config.voice!);
    const name = ctx.config.name || "demo";
    const audioPath = getAudioPath(ctx.config);
    const manifestPath = getNarrationManifestPath(audioPath);

    if (!shouldRegenerateNarrationArtifacts(audioPath, manifestPath)) {
      // Load manifest into context
      const raw = JSON.parse(readFileSync(manifestPath, "utf-8"));
      ctx.narrationManifest = narrationManifestSchema.parse(raw);
      return;
    }

    const narratedScenes = getNarratedScenesInPlaybackOrder(ctx.config);
    const script = {
      /* ... build script object */
    };
    const segments = await generateVoiceSegments(script, resolvedVoice, { verbose: ctx.verbose });
    await generateNarrationAudio(segments, audioPath, { verbose: ctx.verbose });

    const rawManifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    ctx.narrationManifest = narrationManifestSchema.parse(rawManifest);
  }
}
```

This is essentially the TTS section of the current `generate()` function (lines 82-135 of `index.ts`) + the caching logic.

#### `src/stages/narration-sync.ts`

```ts
export class NarrationSyncStage implements Stage {
  readonly name = "Narration Sync"

  async run(ctx: PipelineContext): Promise<void> {
    const mode = ctx.config.timing.narrationSyncMode ?? "auto"
    if (mode === "off") return
    if (!ctx.narrationManifest) return

    const { syncNarration, logSyncReport } = await import("../narration-sync.js")

    const clips: NarrationClipInfo[] = ctx.narrationManifest.clips.map(clip => ({ ... }))
    const syncOutput = syncNarration({
      steps: ctx.config.steps,
      scenes: ctx.config.scenes ?? [],
      clips,
      config: { /* ... */ },
    })

    if (syncOutput.hasOverflow && mode === "strict") {
      throw new Error(`Narration sync overflow: ...`)
    }

    if (ctx.verbose) logSyncReport(syncOutput.report, ctx.verbose)

    if (syncOutput.report.appliedPadMs > 0) {
      // Apply padding to config (mutate ctx.config - not ideal, revisit)
      ctx.config.steps = syncOutput.steps
      // Update scene indices
    }
  }
}
```

**Important design note:** Mutating `ctx.config` is not ideal. Two options:

1. Make `PipelineContext.config` mutable (a `DemoReelConfigInput` that gets progressively resolved) — pragmatic
2. Store adjusted steps in a separate field `ctx.adjustedSteps` and have RecordingStage use it — cleaner but more fields

For Phase 5, option 1 (mutable) is fine. We can refine later.

#### `src/stages/auth.ts`

```ts
export class AuthStage implements Stage {
  readonly name = "Auth";

  async run(ctx: PipelineContext): Promise<void> {
    if (!ctx.config.auth) return;
    if (!ctx.browserPool) throw new Error("BrowserPool not initialized");

    const session = await ctx.browserPool.acquire(ctx.config, { recording: false });
    try {
      await handleAuth(session.context, session.page, ctx.config.auth, ctx.configPath, ctx.verbose);
    } finally {
      await ctx.browserPool.release(session);
    }
  }
}
```

#### `src/stages/pre-steps.ts`

```ts
export class PreStepsStage implements Stage {
  readonly name = "Pre-Steps";

  async run(ctx: PipelineContext): Promise<void> {
    const preSteps = ctx.config.preSteps ?? ctx.config.setup;
    if (!preSteps || preSteps.length === 0) return;
    if (!ctx.browserPool) throw new Error("BrowserPool not initialized");

    const session = await ctx.browserPool.acquire(ctx.config, { recording: false });
    try {
      await runSteps(session.page, preSteps, {
        tolerant: true,
        verbose: ctx.verbose,
        label: "setup",
      });
    } finally {
      await ctx.browserPool.release(session);
    }
  }
}
```

#### `src/stages/recording.ts`

```ts
export class RecordingStage implements Stage {
  readonly name = "Recording";

  async run(ctx: PipelineContext): Promise<void> {
    if (!ctx.browserPool) throw new Error("BrowserPool not initialized");

    const session = await ctx.browserPool.acquire(ctx.config, {
      recording: true,
      headed: ctx.headed,
    });
    try {
      if (ctx.config.auth) {
        await handleAuth(
          session.context,
          session.page,
          ctx.config.auth,
          ctx.configPath,
          ctx.verbose,
        );
      }

      const sceneTimestamps = await runDemo(session.page, ctx.config);
      ctx.sceneTimestamps = sceneTimestamps;

      const saveSessionFn = ctx.config.auth
        ? async () => {
            /* capture + save session */
          }
        : undefined;

      const tempVideoPath = await ctx.browserPool.release(session, saveSessionFn);
      if (tempVideoPath) ctx.tempVideoPath = tempVideoPath;
    } catch (error) {
      await ctx.browserPool.release(session).catch(() => {});
      throw error;
    }
  }
}
```

#### `src/stages/audio-mix.ts`

```ts
export class AudioMixStage implements Stage {
  readonly name = "Audio Mix";

  async run(ctx: PipelineContext): Promise<void> {
    if (!ctx.tempVideoPath) {
      ctx.warnings.push("No video recorded, skipping audio mix");
      return;
    }

    if (!ctx.config.audio?.narration && !ctx.config.audio?.background) {
      // No audio config — just copy video
      const { copyFile } = await import("fs/promises");
      await mkdir(dirname(ctx.outputPath), { recursive: true });
      await copyFile(ctx.tempVideoPath, ctx.outputPath);
      ctx.finalVideoPath = ctx.outputPath;
      return;
    }

    // Build narration placements from manifest + scene timestamps
    // Call mergeAudioVideo() from ffmpeg/utils
    const finalPath = await mergeAudioVideo({
      videoPath: ctx.tempVideoPath,
      outputPath: ctx.outputPath,
      audio: {
        /* ... */
      },
    });

    ctx.finalVideoPath = finalPath;
  }
}
```

#### `src/stages/output.ts`

```ts
export class OutputStage implements Stage {
  readonly name = "Output";

  async run(ctx: PipelineContext): Promise<void> {
    if (!ctx.finalVideoPath || !ctx.sceneTimestamps || ctx.sceneTimestamps.length === 0) return;

    const basePath = ctx.finalVideoPath.replace(/\.[^.]+$/, "");
    const subtitleCues = buildSubtitleCuesWithNarrationPlacements(
      ctx.sceneTimestamps,
      ctx.config,
      ctx.narrationPlacements ?? [],
    );

    const srt = generateSRT(subtitleCues);
    const vtt = generateVTT(subtitleCues);
    const meta = generateMetadata(ctx.sceneTimestamps, subtitleCues, ctx.finalVideoPath);

    await writeFile(`${basePath}.srt`, srt, "utf-8");
    await writeFile(`${basePath}.vtt`, vtt, "utf-8");
    await writeFile(`${basePath}.meta.json`, JSON.stringify(meta, null, 2), "utf-8");

    // Clean up temp
    if (ctx.tempVideoPath) {
      try {
        await unlink(ctx.tempVideoPath);
      } catch {}
    }
  }
}
```

#### `src/stages/post-steps.ts`

```ts
export class PostStepsStage implements Stage {
  readonly name = "Post-Steps";

  async run(ctx: PipelineContext): Promise<void> {
    const postSteps = ctx.config.postSteps ?? ctx.config.cleanup;
    if (!postSteps || postSteps.length === 0) return;
    if (!ctx.browserPool) throw new Error("BrowserPool not initialized");

    const session = await ctx.browserPool.acquire(ctx.config, { recording: false });
    try {
      if (ctx.config.auth) {
        await handleAuth(
          session.context,
          session.page,
          ctx.config.auth,
          ctx.configPath,
          ctx.verbose,
        );
      }
      await runSteps(session.page, postSteps, {
        tolerant: true,
        verbose: ctx.verbose,
        label: "post",
      });
    } finally {
      await ctx.browserPool.release(session);
    }
  }
}
```

## Files to Modify

### `src/index.ts` — `generate()` function

Replace the current inline orchestration with pipeline composition:

```ts
export async function generate(config: DemoConfig, options: GenerateOptions = {}): Promise<void> {
  const { verbose = false, dryRun = false, headed = false } = options;
  const resolvedConfig = validateConfig(config);

  if (dryRun) {
    // Keep dry run logic (or make it a separate DryRunStage)
    const { runVideoScenario } = await import("./video-handler.js");
    const outputPath =
      resolvedConfig.outputPath ?? join(resolve("./output"), `${getBaseName(resolvedConfig)}.mp4`);
    await runVideoScenario(resolvedConfig, outputPath, resolve("demo-reel-dry-run.json"), {
      verbose,
      dryRun,
      headed,
    });
    return;
  }

  const ctx = new PipelineContext({
    config: resolvedConfig,
    configPath: resolve(configPath ?? process.cwd()),
    outputPath: resolveOutputPath(resolvedConfig),
    verbose,
    dryRun,
    headed,
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

  ctx.browserPool = new BrowserPool();

  try {
    await runPipeline(stages, ctx);
  } finally {
    await ctx.browserPool.releaseAll();
  }

  for (const warning of ctx.warnings) {
    console.warn(`Warning: ${warning}`);
  }

  console.log(`✓ Video created → ${ctx.finalVideoPath}`);
}
```

### What gets removed from `index.ts`

- `getNarratedScenesInPlaybackOrder()` → moves to `stages/tts.ts`
- `shouldRegenerateNarrationArtifacts()` → moves to `stages/tts.ts`
- `getAudioPath()` → moves to `stages/tts.ts`
- `getBaseName()` → stays (used by `defineConfig` path resolution)
- The entire TTS generation block (lines 82-135)
- The narration sync block (lines 151-219)
- The temp JSON write/load workaround (lines 221-239)
- The `runVideoScenario` delegation (lines 230-239)

### `src/video-handler.ts` — potentially remove or thin

After Phase 5, `video-handler.ts` is no longer the main entry for video creation. It can:

1. Stay as backward-compatible wrapper that creates a one-off pipeline
2. Be split — its remaining functions (subtitle generation, metadata) move to `stages/output.ts`

For Phase 5, keep `video-handler.ts` as re-export barrel. The subtitle functions (`buildSubtitleCues`, `generateSRT`, `generateVTT`, `generateMetadata`) can stay there and be imported by `stages/output.ts`, or move to a `src/subtitles.ts` module. Simpler: keep them in `video-handler.ts` for now; `stages/output.ts` imports from there.

### No changes to test files

Existing tests for `index.ts` (`test/index.test.ts`, `test/index-runtime.test.ts`) test the public API (`generate()`, `defineConfig()`, `validateConfig()`). These should continue to pass since the API surface hasn't changed.

## Verification

```bash
pnpm lint
pnpm test
pnpm build
```

Full test suite. This is the most impactful phase — run all ~340 tests.

## Dependencies

- Phase 1 (ffmpeg/utils)
- Phase 2 (runner/\*)
- Phase 3 (voice/\*)
- Phase 4 (browser/\*)

## Backward Compatibility

- `import { generate, defineConfig, validateConfig } from "demo-reel"` → unchanged
- `.demo.ts` files → completely unchanged
- `generate()` function signature → unchanged
- Internal helper functions removed from `index.ts` exports — were they ever public? Check `src/index.ts` line 254-267 — yes, some narration sync functions are exported. These must be re-exported from their new locations or kept in `index.ts` as re-exports.
