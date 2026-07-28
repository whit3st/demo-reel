import { basename, extname, join, resolve } from "path";
import {
  demoReelConfigSchema,
  demoReelConfigInputSchema,
  type DemoReelConfig,
  type DemoReelConfigInput,
} from "./schemas.js";
import { runPipeline } from "./pipeline/orchestrator.js";
import { PipelineContext } from "./pipeline/context.js";
import type { Stage } from "./pipeline/types.js";
import { TTSStage } from "./stages/tts.js";
import { NarrationSyncStage } from "./stages/sync.js";
import { AuthStage } from "./stages/auth.js";
import { PreStepsStage } from "./stages/pre-steps.js";
import { RecordingStage } from "./stages/recording.js";
import { AudioMixStage } from "./stages/audio-mix.js";
import { OutputStage } from "./stages/output.js";
import { PostStepsStage } from "./stages/post-steps.js";
import { BrowserPool } from "./browser/pool.js";
import { shutdownChatterbox } from "./voice/chatterbox.js";

export type DemoConfig = DemoReelConfigInput;

export interface GenerateOptions {
  verbose?: boolean;
  dryRun?: boolean;
  headed?: boolean;
  noCache?: boolean;
  silent?: boolean;
}

export function defineConfig(config: DemoConfig): DemoReelConfig {
  return validateConfig(config);
}

export const demo = defineConfig;

export function validateConfig(config: unknown): DemoReelConfig {
  return demoReelConfigSchema.parse(config);
}

function getBaseName(config: DemoReelConfig): string {
  if (config.name) {
    return config.name;
  }

  if (config.outputPath) {
    const ext = extname(config.outputPath);
    return basename(config.outputPath, ext);
  }

  return "demo";
}

/**
 * The pipeline, in execution order.
 *
 * Exported so the ordering can be asserted in tests. NarrationSyncStage was
 * once dropped from this list and went unnoticed for several releases —
 * nothing failed, scenes were simply never padded to fit their narration and
 * the `maxAutoPadMs` / `maxSyncPasses` knobs quietly became no-ops.
 */
export function buildStages(): Stage[] {
  return [
    new TTSStage(),
    // Must sit between TTS and Recording: it needs the clip durations TTS
    // writes to the narration manifest, and it rewrites step delays that
    // Recording then plays back.
    new NarrationSyncStage(),
    new AuthStage(),
    new PreStepsStage(),
    new RecordingStage(),
    new AudioMixStage(),
    new OutputStage(),
    new PostStepsStage(),
  ];
}

export async function generate(config: DemoConfig, options: GenerateOptions = {}): Promise<void> {
  const {
    verbose = false,
    dryRun = false,
    headed = false,
    noCache = false,
    silent = false,
  } = options;

  let finalConfig = config;
  if (silent) {
    finalConfig = { ...finalConfig, voice: undefined, outputFormat: "webm" as const };

    if (finalConfig.outputPath?.endsWith(".mp4")) {
      finalConfig = {
        ...finalConfig,
        outputPath: finalConfig.outputPath.replace(/\.mp4$/, ".webm"),
      };
    }

    if (finalConfig.scenes) {
      finalConfig = {
        ...finalConfig,
        scenes: finalConfig.scenes.map((s) => ({ ...s, narration: "" })),
      };
    }
  }

  const resolvedConfig = validateConfig(finalConfig);

  // Dry run and real run share ONE engine: the pipeline below. A dry run runs
  // TTS and narration sync for real, then exercises the exact same auth,
  // pre-steps and scene steps — only the recording capture, audio mix and
  // encode are skipped. Narration is included deliberately: it is what decides
  // scene padding, so a dry run that skipped it could not predict whether the
  // narration fits (and `strict` mode would pass here and throw for real).
  // Voice clips are content-hash cached, so this costs once per narration edit.
  // What a dry run still cannot reproduce: recording-induced CPU-timing
  // flakiness, and the post-recording auto-shift in AudioMixStage, which acts
  // on real recorded scene timestamps rather than the estimates used here.
  const ctx = new PipelineContext({
    config: resolvedConfig,
    configPath: process.cwd(),
    outputPath:
      resolvedConfig.outputPath ?? join(resolve("./output"), `${getBaseName(resolvedConfig)}.mp4`),
    verbose,
    dryRun,
    headed,
    noCache,
  });

  const stages = buildStages();

  ctx.browserPool = new BrowserPool();

  try {
    await runPipeline(stages, ctx);
  } finally {
    await ctx.browserPool.releaseAll();
    shutdownChatterbox();
  }

  for (const warning of ctx.warnings) {
    console.warn(`Warning: ${warning}`);
  }

  if (!dryRun) {
    console.log(`✓ Video created → ${ctx.finalVideoPath}`);
  }
}

export { demoReelConfigSchema, demoReelConfigInputSchema };
export type { DemoReelConfig, DemoReelConfigInput } from "./schemas.js";
export type * from "./types.js";
export {
  runScenarioForTest,
  runSteps,
  runStepSimple,
  runAssertion,
  formatStepForLog,
  type RunScenarioForTestOptions,
} from "./runner.js";
export {
  syncNarration,
  logSyncReport,
  buildSceneWindows,
  injectPadding,
} from "./narration-sync.js";
export type {
  NarrationClipInfo,
  SceneWindow,
  SyncReport,
  SyncConfig,
  SyncInput,
  SyncOutput,
} from "./narration-sync.js";
