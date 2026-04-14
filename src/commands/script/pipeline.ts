import type { VoiceConfig, VoiceConfigOverrides } from "../../voice-config.js";
import type { Command, CommandContext, GlobalOptions } from "../types.js";

export interface ScriptPipelineCommandContext extends CommandContext {
  resolveVoiceConfig: (overrides: VoiceConfigOverrides) => VoiceConfig;
  scriptCommands: {
    pipeline: (
      description: string,
      url: string,
      options: {
        verbose?: boolean;
        headed?: boolean;
        noCache?: boolean;
        output?: string;
        voice?: VoiceConfig;
        hints?: string[];
        resolution?: string;
        format?: string;
      },
    ) => Promise<string>;
  };
}

export class ScriptPipelineCommand implements Command {
  readonly name = "script:pipeline";

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

    await ctx.scriptCommands.pipeline(description, url, {
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
