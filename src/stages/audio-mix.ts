import { existsSync } from "fs";
import type { Stage } from "../pipeline/types.js";
import type { PipelineContext } from "../pipeline/context.js";
import type { DemoReelConfig } from "../schemas.js";
import type { AudioConfig } from "../audio-processor.js";
import { getNarrationManifestPath } from "../narration-manifest.js";

export class AudioMixStage implements Stage {
  readonly name = "Audio Mix";

  async run(ctx: PipelineContext): Promise<void> {
    if (ctx.dryRun) return;

    if (!ctx.tempVideoPath) {
      ctx.warnings.push("No video recorded, skipping audio mix");
      return;
    }

    const hasNarration = (ctx.config.scenes ?? []).some((s) => Boolean(s.narration));
    const configWithAudio = this.buildConfigWithAudio(ctx.config, hasNarration, ctx.audioPath);

    if (configWithAudio.audio?.narration && !existsSync(configWithAudio.audio.narration)) {
      throw new Error(
        `Narration audio file not found: ${configWithAudio.audio.narration}. ` +
          "The TTS voice generation may have failed. Run with --verbose to see details.",
      );
    }

    const { processVideoWithAudio } = await import("../video-handler.js");

    const result = await processVideoWithAudio(
      ctx.tempVideoPath,
      ctx.outputPath,
      configWithAudio.audio,
      ctx.configPath,
      ctx.sceneTimestamps ?? [],
      ctx.config.timing.narrationSyncMode ?? "auto",
    );

    ctx.finalVideoPath = result.finalPath;
    ctx.narrationPlacements = result.narrationPlacements;
    ctx.warnings.push(...result.warnings);
  }

  private buildConfigWithAudio(
    config: DemoReelConfig,
    hasNarration: boolean,
    audioPath?: string,
  ): DemoReelConfig {
    if (!hasNarration || !audioPath) return config;
    const narrationManifestPath =
      config.audio?.narrationManifest ?? getNarrationManifestPath(audioPath);

    return {
      ...config,
      audio: {
        ...config.audio,
        narration: audioPath,
        narrationManifest: narrationManifestPath,
        narrationDelay: config.audio?.narrationDelay ?? 300,
      } as AudioConfig,
      outputFormat: "mp4",
    };
  }
}
