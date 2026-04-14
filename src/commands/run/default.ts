import type { Command, CommandContext, GlobalOptions } from "../types.js";

interface LoadedScenarioWithTags {
  config: {
    tags?: string[];
  };
}

export interface RunDefaultCommandContext<
  TLoaded extends LoadedScenarioWithTags = LoadedScenarioWithTags,
> extends CommandContext {
  findScenarioFiles: () => Promise<string[]>;
  loadConfig: (file: string, outputDir?: string) => Promise<TLoaded>;
  runScenario: (loaded: TLoaded) => Promise<void>;
}

export class RunDefaultCommand<
  TLoaded extends LoadedScenarioWithTags = LoadedScenarioWithTags,
> implements Command {
  readonly name = "run:default";

  validate(args: string[], _options: GlobalOptions): boolean {
    return args.length === 0;
  }

  async execute(
    _args: string[],
    options: GlobalOptions,
    ctx: RunDefaultCommandContext<TLoaded>,
  ): Promise<number> {
    const files = await ctx.findScenarioFiles();

    if (files.length === 0) {
      ctx.console.error("No *.demo.ts files found");
      ctx.console.error('Run "demo-reel init" to create an example scenario');
      return 1;
    }

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

    ctx.console.log(`Found ${files.length} scenario(s)`);
    if (tagFilter) {
      ctx.console.log(`Filtering by tags: ${options.tags?.join(", ")}`);
    }

    let matchedCount = 0;

    for (const file of files) {
      ctx.console.log(`\n▶ ${file}`);
      const loaded = await ctx.loadConfig(file, options.outputDir);
      if (!matchesTags(loaded.config.tags)) {
        if (options.verbose) {
          ctx.console.log("  ↳ Skipped (tags)");
        }
        continue;
      }

      matchedCount += 1;
      await ctx.runScenario(loaded);
    }

    if (tagFilter && matchedCount === 0) {
      ctx.console.error(`No scenarios match tags: ${options.tags?.join(", ")}`);
      return 1;
    }

    return 0;
  }
}
