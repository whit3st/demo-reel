import type { Command, CommandContext, GlobalOptions } from "../types.js";
import { scriptValidate, type ScriptCliOptions } from "../../script/cli.js";

export type ScriptValidateFn = (
  scriptPath: string,
  options: ScriptCliOptions,
) => Promise<boolean>;

export type ScriptValidateCommandContext = CommandContext;

export class ScriptValidateCommand implements Command {
  readonly name = "script:validate";

  constructor(private readonly validateScript: ScriptValidateFn = scriptValidate) {}

  validate(args: string[], _options: GlobalOptions): boolean {
    return args.length >= 1 && args[0].length > 0;
  }

  async execute(
    args: string[],
    options: GlobalOptions,
    _ctx: ScriptValidateCommandContext,
  ): Promise<number> {
    const scriptPath = args[0];

    const valid = await this.validateScript(scriptPath, {
      verbose: options.verbose,
      headed: options.headed,
      noCache: options.noCache,
    });

    return valid ? 0 : 1;
  }
}
