import { basename, extname, join, resolve } from "path";
import {
  demoReelConfigSchema,
  demoReelConfigInputSchema,
  type DemoReelConfig,
  type DemoReelConfigInput,
} from "./schemas.js";
import { runPipeline } from "./pipeline/orchestrator.js";
import { PipelineContext } from "./pipeline/context.js";
import { TTSStage } from "./stages/tts.js";
import { AuthStage } from "./stages/auth.js";
import { PreStepsStage } from "./stages/pre-steps.js";
import { RecordingStage } from "./stages/recording.js";
import { AudioMixStage } from "./stages/audio-mix.js";
import { OutputStage } from "./stages/output.js";
import { PostStepsStage } from "./stages/post-steps.js";
import { BrowserPool } from "./browser/pool.js";

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

  // Dry run and real run share ONE engine: the pipeline below. A dry run is
  // just the pipeline with the production stages (TTS, recording capture,
  // audio mix, output) skipped — so it exercises the exact same auth, pre-steps
  // and scene steps a real run does. This makes a passing dry run a faithful
  // predictor of a passing real run (it cannot structurally diverge); the only
  // thing it can't reproduce is recording-induced CPU-timing flakiness.
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

  const stages = [
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
