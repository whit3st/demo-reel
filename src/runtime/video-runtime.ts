import { runVideoScenario } from "../video-handler.js";
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

      return {
        ok: true,
        durationMs: Date.now() - startedAt,
        artifacts: {
          videoPath: finalPath,
        },
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return {
        ok: false,
        durationMs: Date.now() - startedAt,
        failure: {
          message: err.message,
          stack: err.stack,
        },
      };
    }
  }
}
