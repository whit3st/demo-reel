import type { VoiceConfig, VoiceConfigOverrides } from "../../voice-config.js";
import type { Command, CommandContext, GlobalOptions } from "../types.js";
import { scriptFullPipeline, type ScriptCliOptions } from "../../script/cli.js";

export interface ScriptPipelineCommandContext extends CommandContext {
  resolveVoiceConfig: (overrides: VoiceConfigOverrides) => VoiceConfig;
}

export type ScriptPipelineFn = (
  description: string,
  url: string,
  options: ScriptCliOptions & {
    output?: string;
    voice?: VoiceConfig;
    hints?: string[];
    resolution?: string;
    format?: string;
  },
) => Promise<string>;

export class ScriptPipelineCommand implements Command {
  readonly name = "script:pipeline";

  constructor(private readonly runPipeline: ScriptPipelineFn = scriptFullPipeline) {}

  validate(args: string[], options: GlobalOptions): boolean {
    const hasDescription = args.length >= 1 && args[0].length > 0;
    const hasUrl = options.scriptUrl !== undefined && options.scriptUrl.length > 0;
    return hasDescription && hasUrl;
  }

  async execute(
    args: string[],
    options: GlobalOptions,
    ctx: ScriptPipelineCommandContext,
  ): Promise<number> {
    const description = args[0];
    const url = options.scriptUrl!;
    const voice = ctx.resolveVoiceConfig({
      provider: "openai",
      voice: options.scriptVoice || "alloy",
      speed: options.scriptSpeed || 1.0,
    });

    await this.runPipeline(description, url, {
      verbose: options.verbose,
      headed: options.headed,
      noCache: options.noCache,
      output: options.scriptOutput,
      voice,
      hints: options.scriptHints,
      resolution: options.resolution,
      format: options.format,
    });

    return 0;
  }
}
