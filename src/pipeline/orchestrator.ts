import type { Stage } from "./types.js";
import type { PipelineContext } from "./context.js";

export async function runPipeline(stages: Stage[], ctx: PipelineContext): Promise<void> {
  for (const stage of stages) {
    if (ctx.verbose) console.log(`Stage: ${stage.name}`);
    await stage.run(ctx);
  }
}
