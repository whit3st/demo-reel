import type { CommandContext, GlobalOptions } from "../types.js";

interface LoadedScenarioWithTags {
  config: {
    tags?: string[];
  };
}

export interface ScenarioListContext<
  TLoaded extends LoadedScenarioWithTags = LoadedScenarioWithTags,
> extends CommandContext {
  findScenarioFiles: () => Promise<string[]>;
  loadConfig: (file: string, outputDir?: string) => Promise<TLoaded>;
  runScenario: (loaded: TLoaded) => Promise<void>;
}

export interface ScenarioListOptions {
  /** Extra guidance printed when no scenario files exist (e.g. how to create one). */
  noFilesHint?: string;
}

/**
 * Shared body of `run:all` and `run:default`.
 *
 * The two commands differed only in their validation and in the hint printed
 * when nothing was found; the tag filter, skip logging and no-match exit were
 * copies that had to be kept in sync by hand.
 */
export async function runScenarioList<TLoaded extends LoadedScenarioWithTags>(
  _args: string[],
  options: GlobalOptions,
  ctx: ScenarioListContext<TLoaded>,
  listOptions: ScenarioListOptions = {},
): Promise<number> {
  const files = await ctx.findScenarioFiles();

  if (files.length === 0) {
    ctx.console.error("No *.demo.ts files found");
    if (listOptions.noFilesHint) {
      ctx.console.error(listOptions.noFilesHint);
    }
    return 1;
  }

  const tagFilter = options.tags && options.tags.length > 0 ? new Set(options.tags) : null;
  const matchesTags = (tags: string[] | undefined): boolean => {
    if (!tagFilter) return true;
    if (!tags || tags.length === 0) return false;
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
