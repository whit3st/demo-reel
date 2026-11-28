import type { Command, GlobalOptions } from "../types.js";
import { runScenarioList, type ScenarioListContext } from "./scenario-list.js";

interface LoadedScenarioWithTags {
  config: {
    tags?: string[];
  };
}

export type RunAllCommandContext<TLoaded extends LoadedScenarioWithTags = LoadedScenarioWithTags> =
  ScenarioListContext<TLoaded>;

export class RunAllCommand<
  TLoaded extends LoadedScenarioWithTags = LoadedScenarioWithTags,
> implements Command {
  readonly name = "run:all";

  validate(_args: string[], _options: GlobalOptions): boolean {
    return true;
  }

  async execute(
    args: string[],
    options: GlobalOptions,
    ctx: RunAllCommandContext<TLoaded>,
  ): Promise<number> {
    return runScenarioList(args, options, ctx);
  }
}
