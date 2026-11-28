import type { Command, GlobalOptions } from "../types.js";
import { runScenarioList, type ScenarioListContext } from "./scenario-list.js";

interface LoadedScenarioWithTags {
  config: {
    tags?: string[];
  };
}

export type RunDefaultCommandContext<
  TLoaded extends LoadedScenarioWithTags = LoadedScenarioWithTags,
> = ScenarioListContext<TLoaded>;

export class RunDefaultCommand<
  TLoaded extends LoadedScenarioWithTags = LoadedScenarioWithTags,
> implements Command {
  readonly name = "run:default";

  validate(args: string[], _options: GlobalOptions): boolean {
    return args.length === 0;
  }

  async execute(
    args: string[],
    options: GlobalOptions,
    ctx: RunDefaultCommandContext<TLoaded>,
  ): Promise<number> {
    return runScenarioList(args, options, ctx, {
      noFilesHint: 'Run "demo-reel init" to create an example scenario',
    });
  }
}
