import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { basename, dirname, extname, join, relative, resolve } from "path";
import {
  demoReelConfigSchema,
  demoReelConfigInputSchema,
  type DemoReelConfig,
  type DemoReelConfigInput,
} from "./schemas.js";
import { getNarrationManifestPath } from "./narration-manifest.js";
import { narrationManifestSchema, NARRATION_PROCESSING_VERSION } from "./narration-manifest.js";
import { syncNarration, logSyncReport, type NarrationClipInfo } from "./narration-sync.js";
import type { VoiceConfigOverrides } from "./voice-config.js";

export type DemoConfig = DemoReelConfigInput;

export interface GenerateOptions {
  verbose?: boolean;
  dryRun?: boolean;
  headed?: boolean;
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

function getAudioPath(config: DemoReelConfig): string {
  if (config.outputPath) {
    const outputPath = config.outputPath.startsWith("/")
      ? config.outputPath
      : resolve(config.outputPath);
    const ext = extname(outputPath);
    return join(dirname(outputPath), `${basename(outputPath, ext)}-narration.mp3`);
  }

  const outputDir = config.outputDir ? resolve(config.outputDir) : resolve("./output");
  return join(outputDir, `${getBaseName(config)}-narration.mp3`);
}

function getNarratedScenesInPlaybackOrder(config: DemoReelConfig) {
  return (config.scenes ?? [])
    .map((scene, index) => ({ scene, index }))
    .filter(({ scene }) => Boolean(scene.narration))
    .sort((left, right) => {
      const stepIndexDiff = left.scene.stepIndex - right.scene.stepIndex;
      return stepIndexDiff !== 0 ? stepIndexDiff : left.index - right.index;
    })
    .map(({ scene, index }) => ({ scene, index }));
}

function shouldRegenerateNarrationArtifacts(audioPath: string, manifestPath: string): boolean {
  if (!existsSync(audioPath) || !existsSync(manifestPath)) {
    return true;
  }

  try {
    const manifest = narrationManifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf-8")));
    return manifest.processingVersion !== NARRATION_PROCESSING_VERSION;
  } catch {
    return true;
  }
}

export async function generate(config: DemoConfig, options: GenerateOptions = {}): Promise<void> {
  const { verbose = false, dryRun = false, headed = false } = options;
  const resolvedConfig = validateConfig(config);

  if (dryRun) {
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
  const name = getBaseName(resolvedConfig);
  const narratedScenes = getNarratedScenesInPlaybackOrder(resolvedConfig);

  const hasNarration = narratedScenes.length > 0;
  const hasVoice = resolvedConfig.voice;
  const audioPath = getAudioPath(resolvedConfig);
  const narrationManifestPath = getNarrationManifestPath(audioPath);
  const shouldRegenerate =
    hasNarration && hasVoice
      ? shouldRegenerateNarrationArtifacts(audioPath, narrationManifestPath)
      : false;
  mkdirSync(dirname(audioPath), { recursive: true });

  if (hasNarration && hasVoice && shouldRegenerate) {
    if (verbose) {
      console.log("Generating voiceover...");
    }

    const { generateVoiceSegments, generateNarrationAudio } = await import("./script/tts.js");
    const { resolveVoiceConfig } = await import("./voice-config.js");

    const resolvedVoice = resolveVoiceConfig(resolvedConfig.voice as VoiceConfigOverrides);

    const script = {
      title: name,
      description: "auto-generated",
      url: "https://placeholder.local",
      scenes: narratedScenes.map(({ scene, index }) => ({
        narration: scene.narration,
        stepIndex: scene.stepIndex,
        sourceSceneIndex: index,
        steps: [{ action: "wait" as const, ms: 0 }],
      })),
      voice: resolvedVoice,
    };

    const segments = await generateVoiceSegments(script, resolvedVoice, { verbose });
    await generateNarrationAudio(segments, audioPath, { verbose });
  }

  const configWithAudio: DemoReelConfig =
    hasNarration && existsSync(audioPath)
      ? {
          ...resolvedConfig,
          audio: {
            ...resolvedConfig.audio,
            narration: relative(process.cwd(), audioPath),
            narrationManifest: relative(process.cwd(), narrationManifestPath),
            narrationDelay: resolvedConfig.audio?.narrationDelay ?? 300,
          },
          outputFormat: "mp4",
        }
      : resolvedConfig;

  if (hasNarration && existsSync(narrationManifestPath) && resolvedConfig.scenes) {
    try {
      const syncMode = resolvedConfig.timing.narrationSyncMode ?? "auto";
      if (syncMode !== "off") {
        const rawManifest = JSON.parse(readFileSync(narrationManifestPath, "utf-8"));
        const manifest = narrationManifestSchema.parse(rawManifest);

        const clips: NarrationClipInfo[] = manifest.clips.map((clip) => ({
          sceneIndex: clip.sceneIndex,
          narration: clip.narration,
          audioDurationMs: clip.audioDurationMs,
          gapAfterMs: clip.gapAfterMs ?? 0,
        }));

        const syncOutput = syncNarration({
          steps: configWithAudio.steps,
          scenes: resolvedConfig.scenes,
          clips,
          config: {
            narrationSyncMode: syncMode,
            narrationGapMs: resolvedConfig.timing.narrationGapMs ?? 300,
            maxAutoPadMs: resolvedConfig.timing.maxAutoPadMs ?? 5000,
            maxSyncPasses: resolvedConfig.timing.maxSyncPasses ?? 2,
          },
        });

        if (syncOutput.hasOverflow && syncMode === "strict") {
          throw new Error(
            `Narration sync overflow: scenes ${syncOutput.report.overflowScenes.join(", ")} exceed maxAutoPadMs`,
          );
        }

        if (verbose) {
          logSyncReport(syncOutput.report, verbose);
        }

        if (syncOutput.report.appliedPadMs > 0) {
          (configWithAudio as DemoReelConfigInput).steps = syncOutput.steps;
          if (resolvedConfig.scenes) {
            (configWithAudio as DemoReelConfigInput).scenes = resolvedConfig.scenes.map(
              (scene, i) => ({
                ...scene,
                stepIndex: syncOutput.sceneStepIndices[i],
              }),
            );
          }
          if (verbose) {
            console.log(
              `✓ Narration sync applied: ${syncOutput.report.appliedPadMs}ms total padding`,
            );
          }
        }
      }
    } catch (error) {
      if (verbose) {
        console.warn(
          `Narration sync skipped: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      if (
        error instanceof Error &&
        error.message.startsWith("Narration sync") &&
        error.message.includes("strict")
      ) {
        throw error;
      }
    }
  }

  const jsonPath = `.${name}.tmp.json`;

  try {
    writeFileSync(jsonPath, JSON.stringify(configWithAudio, null, 2), "utf-8");
  } catch (error) {
    throw new Error(`Failed to write config: ${error instanceof Error ? error.message : error}`);
  }

  try {
    const { loadConfig } = await import("./config-loader.js");
    const { runVideoScenario } = await import("./video-handler.js");

    const loaded = await loadConfig(resolve(jsonPath));
    await runVideoScenario(loaded.config, loaded.outputPath, loaded.configPath, { verbose });
  } finally {
    try {
      unlinkSync(jsonPath);
    } catch {}
  }
}

export { demoReelConfigSchema, demoReelConfigInputSchema };
export type { DemoReelConfig, DemoReelConfigInput } from "./schemas.js";
export type * from "./types.js";
export { run, type RunOptions } from "./run.js";
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
