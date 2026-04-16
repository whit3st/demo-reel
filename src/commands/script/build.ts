import type { Command, CommandContext, GlobalOptions } from "../types.js";
import { scriptBuild, type ScriptCliOptions } from "../../script/cli.js";

export type ScriptBuildFn = (
  scriptPath: string,
  options: ScriptCliOptions & { resolution?: string; format?: string },
) => Promise<string>;

export type ScriptBuildCommandContext = CommandContext;

export class ScriptBuildCommand implements Command {
  readonly name = "script:build";

  constructor(private readonly buildScript: ScriptBuildFn = scriptBuild) {}

  validate(args: string[], _options: GlobalOptions): boolean {
    return args.length >= 1 && args[0].length > 0;
  }

  async execute(
    args: string[],
    options: GlobalOptions,
    _ctx: ScriptBuildCommandContext,
  ): Promise<number> {
    const scriptPath = args[0];

    await this.buildScript(scriptPath, {
      verbose: options.verbose,
      headed: options.headed,
      noCache: options.noCache,
      resolution: options.resolution,
      format: options.format,
    });

    return 0;
  }
}
