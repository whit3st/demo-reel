import type { VoiceConfig, VoiceConfigOverrides } from "../../voice-config.js";
import type { Command, CommandContext, GlobalOptions } from "../types.js";

export interface ScriptVoiceCommandContext extends CommandContext {
  resolveVoiceConfig: (overrides: VoiceConfigOverrides) => VoiceConfig;
  scriptCommands: {
    voice: (
      scriptPath: string,
      voice: VoiceConfig,
      options: {
        verbose?: boolean;
        headed?: boolean;
        noCache?: boolean;
      },
    ) => Promise<string>;
  };
}

export class ScriptVoiceCommand implements Command {
  readonly name = "script:voice";

  validate(args: string[], _options: GlobalOptions): boolean {
    return args.length >= 1 && args[0].length > 0;
  }

  async execute(
    args: string[],
    options: GlobalOptions,
    ctx: ScriptVoiceCommandContext,
  ): Promise<number> {
    const scriptPath = args[0];
    const voice = ctx.resolveVoiceConfig({
      provider: "openai",
      voice: options.scriptVoice || "alloy",
      speed: options.scriptSpeed || 1.0,
    });

    await ctx.scriptCommands.voice(scriptPath, voice, {
      verbose: options.verbose,
      headed: options.headed,
      noCache: options.noCache,
    });

    return 0;
  }
}
