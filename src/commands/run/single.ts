import type { Command, CommandContext, GlobalOptions } from "../types.js";

interface LoadedScenarioWithTags {
  config: {
    tags?: string[];
  };
}

export interface RunSingleCommandContext<
  TLoaded extends LoadedScenarioWithTags = LoadedScenarioWithTags,
> extends CommandContext {
  resolvePath: (scenarioPath: string) => string;
  pathExists: (path: string) => Promise<boolean>;
  loadScenario: (name: string) => Promise<string | null>;
  loadConfig: (configPath: string, outputDir?: string) => Promise<TLoaded>;
  runScenario: (loaded: TLoaded) => Promise<void>;
}

export class RunSingleCommand<
  TLoaded extends LoadedScenarioWithTags = LoadedScenarioWithTags,
> implements Command {
  readonly name = "run:single";

  validate(args: string[], _options: GlobalOptions): boolean {
    return args.length === 1 && args[0].length > 0;
  }

  async execute(
    args: string[],
    options: GlobalOptions,
    ctx: RunSingleCommandContext<TLoaded>,
  ): Promise<number> {
    const scenario = args[0];
    const tagFilter = options.tags && options.tags.length > 0 ? new Set(options.tags) : null;
    const matchesTags = (tags: string[] | undefined) => {
      if (!tagFilter) {
        return true;
      }
      if (!tags || tags.length === 0) {
        return false;
      }
      return tags.some((tag) => tagFilter.has(tag));
    };

    let configPath: string | null = null;
    const ext = scenario.split(".").pop();
    if (ext && ["ts", "js", "mjs", "json"].includes(ext)) {
      const fullPath = ctx.resolvePath(scenario);
      if (await ctx.pathExists(fullPath)) {
        configPath = fullPath;
      }
    }

    if (!configPath) {
      configPath = await ctx.loadScenario(scenario);
    }

    if (!configPath) {
      ctx.console.error(`Scenario not found: ${scenario}`);
      ctx.console.error("Looked for:");
      ctx.console.error(`  - ${scenario}.demo.ts`);
      ctx.console.error(`  - ${scenario}.config.ts`);
      return 1;
    }

    const loaded = await ctx.loadConfig(configPath, options.outputDir);
    if (!matchesTags(loaded.config.tags)) {
      ctx.console.error(`Scenario does not match tags: ${options.tags?.join(", ")}`);
      return 1;
    }

    await ctx.runScenario(loaded);
    return 0;
  }
}
