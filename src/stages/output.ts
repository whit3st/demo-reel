import { writeFile, unlink } from "fs/promises";
import type { Stage } from "../pipeline/types.js";
import type { PipelineContext } from "../pipeline/context.js";

export class OutputStage implements Stage {
  readonly name = "Output";

  async run(ctx: PipelineContext): Promise<void> {
    if (!ctx.finalVideoPath || !ctx.sceneTimestamps || ctx.sceneTimestamps.length === 0) return;

    const { buildSubtitleCuesWithNarrationPlacements, generateSRT, generateVTT, generateMetadata } =
      await import("../video-handler.js");

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
