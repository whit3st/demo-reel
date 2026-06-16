import { dirname } from "path";
import type { Stage } from "../pipeline/types.js";
import type { PipelineContext } from "../pipeline/context.js";
import type { SceneTimestamp } from "../runner/types.js";
import { handleAuth } from "../video-handler.js";
import { runDemo } from "../runner/index.js";
import { captureSession, saveSession } from "../auth.js";

export class RecordingStage implements Stage {
  readonly name = "Recording";

  async run(ctx: PipelineContext): Promise<void> {
    if (!ctx.browserPool) throw new Error("BrowserPool not initialized");

    // A dry run drives the same auth + scenes against the live app, but in a
    // non-recording browser and without saving the session — so it verifies the
    // run passes without producing (or encoding) a video.
    const session = await ctx.browserPool.acquire(ctx.config, {
      recording: !ctx.dryRun,
      headed: ctx.headed,
    });
    try {
      if (ctx.config.auth) {
        await handleAuth(
          session.context,
          session.page,
          ctx.config.auth,
          ctx.configPath,
          ctx.verbose,
        );
      }

      const startTime = Date.now();
      const sceneTimestamps = await runDemo(session.page, ctx.config);
      ctx.sceneTimestamps = sceneTimestamps;

      if (ctx.dryRun) {
        reportDryRun(sceneTimestamps, startTime);
        await ctx.browserPool.release(session);
        return;
      }

      const saveSessionFn = ctx.config.auth
        ? async () => {
            const configDir = dirname(ctx.configPath);
            const sessionData = await captureSession(session.context, ctx.config.auth!.storage);
            await saveSession(sessionData, configDir);
            if (ctx.verbose) console.log("  Saved session state");
          }
        : undefined;

      const tempVideoPath = await ctx.browserPool.release(session, saveSessionFn);
      if (tempVideoPath) ctx.tempVideoPath = tempVideoPath;
    } catch (error) {
      await ctx.browserPool.release(session).catch(() => {});
      throw error;
    }
  }
}

function reportDryRun(sceneTimestamps: SceneTimestamp[], startTime: number): void {
  if (sceneTimestamps.length > 0) {
    console.log("Scene results:");
    for (const ts of sceneTimestamps) {
      const duration = ((ts.endMs - ts.startMs) / 1000).toFixed(1);
      const label = ts.narration
        ? ts.narration.length > 60
          ? `${ts.narration.slice(0, 60)}...`
          : ts.narration
        : "(no narration)";
      console.log(`  scene ${ts.sceneIndex}: ${duration}s — ${label}`);
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✓ All steps passed (${duration}s)`);
}
