import type { Stage } from "../pipeline/types.js";
import type { PipelineContext } from "../pipeline/context.js";
import { handleAuth } from "../video-handler.js";

export class AuthStage implements Stage {
  readonly name = "Auth";

  async run(ctx: PipelineContext): Promise<void> {
    if (!ctx.config.auth) return;
    if (!ctx.browserPool) throw new Error("BrowserPool not initialized");

    const session = await ctx.browserPool.acquire(ctx.config, { recording: false });
    try {
      await handleAuth(session.context, session.page, ctx.config.auth, ctx.configPath, ctx.verbose);
    } finally {
      await ctx.browserPool.release(session);
    }
  }
}
