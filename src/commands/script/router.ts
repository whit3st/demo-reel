import {
  resolveVoiceConfig,
  type VoiceConfig,
  type VoiceConfigOverrides,
} from "../../voice-config.js";
import type { Command, CommandContext, GlobalOptions } from "../types.js";
import { ScriptBuildCommand, type ScriptBuildCommandContext } from "./build.js";
import { ScriptFixCommand, type ScriptFixCommandContext } from "./fix.js";
import { ScriptGenerateCommand, type ScriptGenerateCommandContext } from "./generate.js";
import { ScriptPipelineCommand, type ScriptPipelineCommandContext } from "./pipeline.js";
import { ScriptValidateCommand, type ScriptValidateCommandContext } from "./validate.js";
import { ScriptVoiceCommand, type ScriptVoiceCommandContext } from "./voice.js";

export interface ScriptRouterCommandContext extends CommandContext {
  getArgAfter: (token: string) => string | undefined;
  resolveVoiceConfig: (overrides: VoiceConfigOverrides) => VoiceConfig;
}

interface ScriptRouterSubcommands {
  generate: ScriptGenerateCommand;
  voice: ScriptVoiceCommand;
  build: ScriptBuildCommand;
  validate: ScriptValidateCommand;
  fix: ScriptFixCommand;
  pipeline: ScriptPipelineCommand;
}

export class ScriptRouterCommand implements Command {
  readonly name = "script";

  constructor(
    private readonly subcommands: ScriptRouterSubcommands = {
      generate: new ScriptGenerateCommand(),
      voice: new ScriptVoiceCommand(),
      build: new ScriptBuildCommand(),
      validate: new ScriptValidateCommand(),
      fix: new ScriptFixCommand(),
      pipeline: new ScriptPipelineCommand(),
    },
  ) {}

  validate(args: string[], _options: GlobalOptions): boolean {
    return args.length >= 1;
  }

  async execute(
    args: string[],
    options: GlobalOptions,
    ctx: ScriptRouterCommandContext,
  ): Promise<number> {
    const subcommandOrDescription = args[0];

    if (!subcommandOrDescription) {
      ctx.console.error("Usage: demo-reel script <subcommand|description> [options]");
      ctx.console.error('Run "demo-reel --help" for details.');
      return 1;
    }

    switch (subcommandOrDescription) {
      case "generate": {
        const description = ctx.getArgAfter("generate");
        const generateArgs = description ? [description] : [];
        const cmd = this.subcommands.generate;

        if (!cmd.validate(generateArgs, options)) {
          ctx.console.error("Usage: demo-reel script generate <description> --url <url>");
          return 1;
        }

        const commandCtx: ScriptGenerateCommandContext = {
          ...ctx,
        };
        return await cmd.execute(generateArgs, options, commandCtx);
      }

      case "voice": {
        const scriptPath = ctx.getArgAfter("voice");
        const voiceArgs = scriptPath ? [scriptPath] : [];
        const cmd = this.subcommands.voice;

        if (!cmd.validate(voiceArgs, options)) {
          ctx.console.error("Usage: demo-reel script voice <script.json>");
          return 1;
        }

        const commandCtx: ScriptVoiceCommandContext = {
          ...ctx,
          resolveVoiceConfig: ctx.resolveVoiceConfig,
        };
        return await cmd.execute(voiceArgs, options, commandCtx);
      }

      case "build": {
        const scriptPath = ctx.getArgAfter("build");
        const buildArgs = scriptPath ? [scriptPath] : [];
        const cmd = this.subcommands.build;

        if (!cmd.validate(buildArgs, options)) {
          ctx.console.error("Usage: demo-reel script build <script.json>");
          return 1;
        }

        const commandCtx: ScriptBuildCommandContext = {
          ...ctx,
        };
        return await cmd.execute(buildArgs, options, commandCtx);
      }

      case "validate": {
        const scriptPath = ctx.getArgAfter("validate");
        const validateArgs = scriptPath ? [scriptPath] : [];
        const cmd = this.subcommands.validate;

        if (!cmd.validate(validateArgs, options)) {
          ctx.console.error("Usage: demo-reel script validate <script.json>");
          return 1;
        }

        const commandCtx: ScriptValidateCommandContext = {
          ...ctx,
        };
        return await cmd.execute(validateArgs, options, commandCtx);
      }

      case "fix": {
        const scriptPath = ctx.getArgAfter("fix");
        const fixArgs = scriptPath ? [scriptPath] : [];
        const cmd = this.subcommands.fix;

        if (!cmd.validate(fixArgs, options)) {
          ctx.console.error("Usage: demo-reel script fix <script.json>");
          return 1;
        }

        const commandCtx: ScriptFixCommandContext = {
          ...ctx,
        };
        return await cmd.execute(fixArgs, options, commandCtx);
      }

      default: {
        const cmd = this.subcommands.pipeline;
        const pipelineArgs = [subcommandOrDescription];

        if (!cmd.validate(pipelineArgs, options)) {
          ctx.console.error("Usage: demo-reel script <description> --url <url>");
          ctx.console.error("Or use a subcommand: generate, voice, build, validate, fix");
          return 1;
        }

        const commandCtx: ScriptPipelineCommandContext = {
          ...ctx,
          resolveVoiceConfig: ctx.resolveVoiceConfig,
        };
        return await cmd.execute(pipelineArgs, options, commandCtx);
      }
    }
  }
}

export function createDefaultScriptRouterContext(base: CommandContext): ScriptRouterCommandContext {
  return {
    ...base,
    getArgAfter: (token: string) => {
      const index = process.argv.indexOf(token);
      if (index < 0) {
        return undefined;
      }
      return process.argv[index + 1];
    },
    resolveVoiceConfig,
  };
}
