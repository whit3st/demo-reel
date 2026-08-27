import { writeFile, unlink, copyFile } from "fs/promises";
import type { Stage } from "../pipeline/types.js";
import type { PipelineContext } from "../pipeline/context.js";

export class OutputStage implements Stage {
  readonly name = "Output";

  async run(ctx: PipelineContext): Promise<void> {
    if (ctx.dryRun) return;
    if (!ctx.finalVideoPath) return;

    const basePath = ctx.finalVideoPath.replace(/\.[^.]+$/, "");

    if (ctx.tempCoverPath) {
      ctx.finalCoverPath = `${basePath}.png`;
      await copyFile(ctx.tempCoverPath, ctx.finalCoverPath);
      if (ctx.verbose) console.log(`  Cover: ${ctx.finalCoverPath}`);
      await unlink(ctx.tempCoverPath).catch(() => {});
    }

    if (!ctx.sceneTimestamps || ctx.sceneTimestamps.length === 0) {
      if (ctx.tempVideoPath) await unlink(ctx.tempVideoPath).catch(() => {});
      return;
    }

    const { buildSubtitleCuesWithNarrationPlacements, generateSRT, generateVTT, generateMetadata } =
      await import("../video-handler.js");

    const subtitleCues = buildSubtitleCuesWithNarrationPlacements(
      ctx.sceneTimestamps,
      ctx.config,
      ctx.narrationPlacements ?? [],
      ctx.videoTime,
    );

    const srt = generateSRT(subtitleCues);
    const vtt = generateVTT(subtitleCues);
    const meta = generateMetadata(
      ctx.sceneTimestamps,
      subtitleCues,
      ctx.finalVideoPath,
      ctx.videoTime,
    );

    await writeFile(`${basePath}.srt`, srt, "utf-8");
    await writeFile(`${basePath}.vtt`, vtt, "utf-8");
    await writeFile(`${basePath}.meta.json`, JSON.stringify(meta, null, 2), "utf-8");

    if (ctx.verbose) {
      console.log(`  Subtitles: ${basePath}.srt, ${basePath}.vtt`);
      console.log(`  Metadata: ${basePath}.meta.json`);
    }

    if (ctx.tempVideoPath) {
      try {
        await unlink(ctx.tempVideoPath);
      } catch {}
    }
  }
}
