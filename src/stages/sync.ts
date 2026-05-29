import { existsSync, readFileSync } from "fs";
import type { Stage } from "../pipeline/types.js";
import type { PipelineContext } from "../pipeline/context.js";
import type { DemoReelConfigInput } from "../schemas.js";
import { narrationManifestSchema } from "../narration-manifest.js";
import { syncNarration, logSyncReport, type NarrationClipInfo } from "../narration-sync.js";

export class NarrationSyncStage implements Stage {
  readonly name = "Narration Sync";

  async run(ctx: PipelineContext): Promise<void> {
    const syncMode = ctx.config.timing.narrationSyncMode ?? "auto";
    if (syncMode === "off") return;

    const manifestPath = ctx.narrationManifestPath;
    if (!manifestPath || !existsSync(manifestPath)) return;
    if (!ctx.config.scenes) return;

    const rawManifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    const manifest = narrationManifestSchema.parse(rawManifest);

    const clips: NarrationClipInfo[] = manifest.clips.map((clip) => ({
      sceneIndex: clip.sceneIndex,
      narration: clip.narration,
      audioDurationMs: clip.audioDurationMs,
      gapAfterMs: clip.gapAfterMs ?? 0,
    }));

    const syncOutput = syncNarration({
      steps: ctx.config.steps,
      scenes: ctx.config.scenes,
      clips,
      config: {
        narrationSyncMode: syncMode,
        narrationGapMs: ctx.config.timing.narrationGapMs ?? 300,
        maxAutoPadMs: ctx.config.timing.maxAutoPadMs ?? 5000,
        maxSyncPasses: ctx.config.timing.maxSyncPasses ?? 2,
      },
    });

    if (syncOutput.hasOverflow && syncMode === "strict") {
      throw new Error(
        `Narration sync overflow: scenes ${syncOutput.report.overflowScenes.join(", ")} exceed maxAutoPadMs`,
      );
    }

    if (ctx.verbose) {
      logSyncReport(syncOutput.report, ctx.verbose);
    }

    if (syncOutput.report.appliedPadMs > 0) {
      (ctx.config as DemoReelConfigInput).steps = syncOutput.steps;
      if (ctx.config.scenes) {
        (ctx.config as DemoReelConfigInput).scenes = ctx.config.scenes.map((scene, i) => ({
          ...scene,
          stepIndex: syncOutput.sceneStepIndices[i],
        }));
      }
      if (ctx.verbose) {
        console.log(`  Narration sync applied: ${syncOutput.report.appliedPadMs}ms total padding`);
      }
    }
  }
}
