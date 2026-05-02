import { runVideoScenario } from "../video-handler.js";
import { extname } from "path";
import type { DemoReelVideoConfig } from "../schemas.js";
import type { RuntimeResult } from "./types.js";

export interface VideoRuntimeOptions {
  verbose?: boolean;
  dryRun?: boolean;
  headed?: boolean;
}

export interface VideoRuntimeInput {
  config: DemoReelVideoConfig;
  outputPath: string;
  configPath: string;
}

export class VideoRuntime {
  async run(input: VideoRuntimeInput, options: VideoRuntimeOptions = {}): Promise<RuntimeResult> {
    const startedAt = Date.now();
    try {
      const finalPath = await runVideoScenario(
        input.config,
        input.outputPath,
        input.configPath,
        options,
      );

      if (!finalPath || typeof finalPath !== "string") {
        throw new Error("Video runtime did not return an output path.");
      }

      const basePath = finalPath.slice(0, finalPath.length - extname(finalPath).length);

      return {
        ok: true,
        durationMs: Date.now() - startedAt,
        artifacts: {
          videoPath: finalPath,
          subtitleSrtPath: `${basePath}.srt`,
          subtitleVttPath: `${basePath}.vtt`,
          metadataPath: `${basePath}.meta.json`,
        },
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return {
        ok: false,
        durationMs: Date.now() - startedAt,
        failure: {
          type: "runtime",
          message: err.message,
          stack: err.stack,
        },
      };
    }
  }
}
