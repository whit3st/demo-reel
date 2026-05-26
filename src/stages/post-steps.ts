import type { Stage } from "../pipeline/types.js";
import type { PipelineContext } from "../pipeline/context.js";
import { handleAuth } from "../video-handler.js";
import { runSteps } from "../runner/index.js";

export class PostStepsStage implements Stage {
  readonly name = "Post-Steps";

  async run(ctx: PipelineContext): Promise<void> {
    const postSteps = ctx.config.postSteps ?? ctx.config.cleanup;
    if (!postSteps || postSteps.length === 0) return;
    if (!ctx.browserPool) throw new Error("BrowserPool not initialized");

    const session = await ctx.browserPool.acquire(ctx.config, { recording: false });
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
      await runSteps(session.page, postSteps, {
        tolerant: true,
        verbose: ctx.verbose,
        label: "post",
      });
    } finally {
      await ctx.browserPool.release(session);
    }
  }
}
