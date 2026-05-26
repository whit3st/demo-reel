import { relative } from "path";
import type { Stage } from "../pipeline/types.js";
import type { PipelineContext } from "../pipeline/context.js";
import type { DemoReelConfig } from "../schemas.js";
import type { AudioConfig } from "../audio-processor.js";

export class AudioMixStage implements Stage {
  readonly name = "Audio Mix";

  async run(ctx: PipelineContext): Promise<void> {
    if (!ctx.tempVideoPath) {
      ctx.warnings.push("No video recorded, skipping audio mix");
      return;
    }

    const hasNarration = (ctx.config.scenes ?? []).some((s) => Boolean(s.narration));
    const configWithAudio = this.buildConfigWithAudio(ctx.config, hasNarration, ctx.audioPath);
    const { processVideoWithAudio } = await import("../video-handler.js");

    const result = await processVideoWithAudio(
      ctx.tempVideoPath,
      ctx.outputPath,
      configWithAudio.audio,
      ctx.configPath,
      ctx.sceneTimestamps ?? [],
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
      config.audio?.narrationManifest ?? audioPath.replace(/\.mp3$/, ".narration-manifest.json");

    return {
      ...config,
      audio: {
        ...config.audio,
        narration: relative(process.cwd(), audioPath),
        narrationManifest: narrationManifestPath.startsWith("/")
          ? narrationManifestPath
          : relative(process.cwd(), narrationManifestPath),
        narrationDelay: config.audio?.narrationDelay ?? 300,
      } as AudioConfig,
      outputFormat: "mp4",
    };
  }
}
