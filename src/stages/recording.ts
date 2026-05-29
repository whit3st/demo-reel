import { dirname } from "path";
import type { Stage } from "../pipeline/types.js";
import type { PipelineContext } from "../pipeline/context.js";
import { handleAuth } from "../video-handler.js";
import { runDemo } from "../runner/index.js";
import { captureSession, saveSession } from "../auth.js";

export class RecordingStage implements Stage {
  readonly name = "Recording";

  async run(ctx: PipelineContext): Promise<void> {
    if (!ctx.browserPool) throw new Error("BrowserPool not initialized");

    const session = await ctx.browserPool.acquire(ctx.config, {
      recording: true,
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

      const sceneTimestamps = await runDemo(session.page, ctx.config);
      ctx.sceneTimestamps = sceneTimestamps;

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
