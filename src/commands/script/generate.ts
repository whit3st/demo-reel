import type { Command, CommandContext, GlobalOptions } from "../types.js";

export interface ScriptGenerateCommandContext extends CommandContext {
  scriptCommands: {
    generate: (
      description: string,
      url: string,
      outputName: string,
      options: {
        verbose?: boolean;
        headed?: boolean;
        noCache?: boolean;
        hints?: string[];
      },
    ) => Promise<string>;
  };
  getArgs: () => string[];
}

export class ScriptGenerateCommand implements Command {
  readonly name = "script:generate";

  validate(args: string[], options: GlobalOptions): boolean {
    // Need at least a description and --url
    const hasDescription = args.length >= 1;
    const hasUrl = options.scriptUrl !== undefined && options.scriptUrl.length > 0;
    return hasDescription && hasUrl;
  }

  async execute(
    args: string[],
    options: GlobalOptions,
    ctx: ScriptGenerateCommandContext,
  ): Promise<number> {
    const description = args[0];
    const url = options.scriptUrl!;
    const outputName = options.scriptOutput || "demo";

    await ctx.scriptCommands.generate(description, url, outputName, {
      verbose: options.verbose,
      headed: options.headed,
      noCache: options.noCache,
      hints: options.scriptHints,
    });

    return 0;
  }
}
