import type { Command, CommandContext, GlobalOptions } from "../types.js";

export interface ScriptFixCommandContext extends CommandContext {
  scriptCommands: {
    fix: (
      scriptPath: string,
      options: {
        verbose?: boolean;
        headed?: boolean;
      },
    ) => Promise<void>;
  };
}

export class ScriptFixCommand implements Command {
  readonly name = "script:fix";

  validate(args: string[], _options: GlobalOptions): boolean {
    return args.length >= 1 && args[0].length > 0;
  }

  async execute(
    args: string[],
    options: GlobalOptions,
    ctx: ScriptFixCommandContext,
  ): Promise<number> {
    const scriptPath = args[0];

    await ctx.scriptCommands.fix(scriptPath, {
      verbose: options.verbose,
      headed: options.headed,
    });

    return 0;
  }
}
