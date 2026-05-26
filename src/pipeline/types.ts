import type { PipelineContext } from "./context.js";

export interface Stage {
  readonly name: string;
  run(ctx: PipelineContext): Promise<void> | void;
}
