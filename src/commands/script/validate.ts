import type { Command, CommandContext, GlobalOptions } from "../types.js";

export interface ScriptValidateCommandContext extends CommandContext {
  scriptCommands: {
    validate: (
      scriptPath: string,
      options: {
        verbose?: boolean;
        headed?: boolean;
        noCache?: boolean;
      },
    ) => Promise<boolean>;
  };
}

export class ScriptValidateCommand implements Command {
  readonly name = "script:validate";

  validate(args: string[], _options: GlobalOptions): boolean {
    return args.length >= 1 && args[0].length > 0;
  }

  async execute(
    args: string[],
    options: GlobalOptions,
    ctx: ScriptValidateCommandContext,
  ): Promise<number> {
    const scriptPath = args[0];

    const valid = await ctx.scriptCommands.validate(scriptPath, {
      verbose: options.verbose,
      headed: options.headed,
      noCache: options.noCache,
    });

    return valid ? 0 : 1;
  }
}
