import type { Command, CommandContext, GlobalOptions } from "../types.js";

export interface ScriptBuildCommandContext extends CommandContext {
  scriptCommands: {
    build: (
      scriptPath: string,
      options: {
        verbose?: boolean;
        headed?: boolean;
        noCache?: boolean;
        resolution?: string;
        format?: string;
      },
    ) => Promise<string>;
  };
}

export class ScriptBuildCommand implements Command {
  readonly name = "script:build";

  validate(args: string[], _options: GlobalOptions): boolean {
    return args.length >= 1 && args[0].length > 0;
  }

  async execute(
    args: string[],
    options: GlobalOptions,
    ctx: ScriptBuildCommandContext,
  ): Promise<number> {
    const scriptPath = args[0];

    await ctx.scriptCommands.build(scriptPath, {
      verbose: options.verbose,
      headed: options.headed,
      noCache: options.noCache,
      resolution: options.resolution,
      format: options.format,
    });

    return 0;
  }
}
