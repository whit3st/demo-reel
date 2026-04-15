import type { VoiceConfig, VoiceConfigOverrides } from "../../voice-config.js";
import type { Command, CommandContext, GlobalOptions } from "../types.js";
import { scriptVoice, type ScriptCliOptions } from "../../script/cli.js";

export interface ScriptVoiceCommandContext extends CommandContext {
  resolveVoiceConfig: (overrides: VoiceConfigOverrides) => VoiceConfig;
}

export type ScriptVoiceFn = (
  scriptPath: string,
  voice: VoiceConfig,
  options: ScriptCliOptions,
) => Promise<string>;

export class ScriptVoiceCommand implements Command {
  readonly name = "script:voice";

  constructor(private readonly generateVoice: ScriptVoiceFn = scriptVoice) {}

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

    await this.generateVoice(scriptPath, voice, {
      verbose: options.verbose,
      headed: options.headed,
      noCache: options.noCache,
    });

    return 0;
  }
}
