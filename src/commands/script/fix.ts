import type { Command, CommandContext, GlobalOptions } from "../types.js";
import { scriptFix, type ScriptCliOptions } from "../../script/cli.js";

export type ScriptFixFn = (scriptPath: string, options: ScriptCliOptions) => Promise<void>;

export type ScriptFixCommandContext = CommandContext;

export class ScriptFixCommand implements Command {
  readonly name = "script:fix";

  constructor(private readonly fixScript: ScriptFixFn = scriptFix) {}

  validate(args: string[], _options: GlobalOptions): boolean {
    return args.length >= 1 && args[0].length > 0;
  }

  async execute(
    args: string[],
    options: GlobalOptions,
    _ctx: ScriptFixCommandContext,
  ): Promise<number> {
    const scriptPath = args[0];

    await this.fixScript(scriptPath, {
      verbose: options.verbose,
      headed: options.headed,
    });

    return 0;
  }
}
