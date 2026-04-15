import type { Command, CommandContext, GlobalOptions } from "../types.js";
import { scriptGenerate, type ScriptCliOptions } from "../../script/cli.js";

export type ScriptGenerateFn = (
  description: string,
  url: string,
  outputName: string,
  options: ScriptCliOptions & { hints?: string[] },
) => Promise<string>;

export type ScriptGenerateCommandContext = CommandContext;

export class ScriptGenerateCommand implements Command {
  readonly name = "script:generate";

  constructor(private readonly generateScript: ScriptGenerateFn = scriptGenerate) {}

  validate(args: string[], options: GlobalOptions): boolean {
    // Need at least a description and --url
    const hasDescription = args.length >= 1;
    const hasUrl = options.scriptUrl !== undefined && options.scriptUrl.length > 0;
    return hasDescription && hasUrl;
  }

  async execute(
    args: string[],
    options: GlobalOptions,
    _ctx: ScriptGenerateCommandContext,
  ): Promise<number> {
    const description = args[0];
    const url = options.scriptUrl!;
    const outputName = options.scriptOutput || "demo";

    await this.generateScript(description, url, outputName, {
      verbose: options.verbose,
      headed: options.headed,
      noCache: options.noCache,
      hints: options.scriptHints,
    });

    return 0;
  }
}
