import type { Stage } from "../pipeline/types.js";
import type { PipelineContext } from "../pipeline/context.js";
import { handleAuth } from "../video-handler.js";
import { runSteps } from "../runner/index.js";

export class PreStepsStage implements Stage {
  readonly name = "Pre-Steps";

  async run(ctx: PipelineContext): Promise<void> {
    const preSteps = ctx.config.preSteps ?? ctx.config.setup;
    if (!preSteps || preSteps.length === 0) return;
    if (!ctx.browserPool) throw new Error("BrowserPool not initialized");

    const session = await ctx.browserPool.acquire(ctx.config, { recording: false });
    try {
      // Pre-steps run in their own browser, so they need the session restored
      // just like recording and post-steps do. Without this, pre-steps execute
      // unauthenticated and any step touching a protected page silently fails
      // (pre-steps run in tolerant mode), leaving setup work undone.
      if (ctx.config.auth) {
        await handleAuth(
          session.context,
          session.page,
          ctx.config.auth,
          ctx.configPath,
          ctx.verbose,
        );
      }
      await runSteps(session.page, preSteps, {
        tolerant: true,
        verbose: ctx.verbose,
        label: "setup",
      });
    } finally {
      await ctx.browserPool.release(session);
    }
  }
}
