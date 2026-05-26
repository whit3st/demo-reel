import type { Stage } from "../pipeline/types.js";
import type { PipelineContext } from "../pipeline/context.js";
import { runSteps } from "../runner/index.js";

export class PreStepsStage implements Stage {
  readonly name = "Pre-Steps";

  async run(ctx: PipelineContext): Promise<void> {
    const preSteps = ctx.config.preSteps ?? ctx.config.setup;
    if (!preSteps || preSteps.length === 0) return;
    if (!ctx.browserPool) throw new Error("BrowserPool not initialized");

    const session = await ctx.browserPool.acquire(ctx.config, { recording: false });
    try {
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
