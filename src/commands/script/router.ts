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
  scriptCommands: {
    generate: ScriptGenerateCommandContext["scriptCommands"]["generate"];
    voice: ScriptVoiceCommandContext["scriptCommands"]["voice"];
    build: ScriptBuildCommandContext["scriptCommands"]["build"];
    validate: ScriptValidateCommandContext["scriptCommands"]["validate"];
    fix: ScriptFixCommandContext["scriptCommands"]["fix"];
    pipeline: ScriptPipelineCommandContext["scriptCommands"]["pipeline"];
  };
}

export class ScriptRouterCommand implements Command {
  readonly name = "script";

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
        const cmd = new ScriptGenerateCommand();

        if (!cmd.validate(generateArgs, options)) {
          ctx.console.error("Usage: demo-reel script generate <description> --url <url>");
          return 1;
        }

        const commandCtx: ScriptGenerateCommandContext = {
          ...ctx,
          scriptCommands: {
            generate: ctx.scriptCommands.generate,
          },
          getArgs: () => process.argv,
        };
        return await cmd.execute(generateArgs, options, commandCtx);
      }

      case "voice": {
        const scriptPath = ctx.getArgAfter("voice");
        const voiceArgs = scriptPath ? [scriptPath] : [];
        const cmd = new ScriptVoiceCommand();

        if (!cmd.validate(voiceArgs, options)) {
          ctx.console.error("Usage: demo-reel script voice <script.json>");
          return 1;
        }

        const commandCtx: ScriptVoiceCommandContext = {
          ...ctx,
          resolveVoiceConfig: ctx.resolveVoiceConfig,
          scriptCommands: {
            voice: ctx.scriptCommands.voice,
          },
        };
        return await cmd.execute(voiceArgs, options, commandCtx);
      }

      case "build": {
        const scriptPath = ctx.getArgAfter("build");
        const buildArgs = scriptPath ? [scriptPath] : [];
        const cmd = new ScriptBuildCommand();

        if (!cmd.validate(buildArgs, options)) {
          ctx.console.error("Usage: demo-reel script build <script.json>");
          return 1;
        }

        const commandCtx: ScriptBuildCommandContext = {
          ...ctx,
          scriptCommands: {
            build: ctx.scriptCommands.build,
          },
        };
        return await cmd.execute(buildArgs, options, commandCtx);
      }

      case "validate": {
        const scriptPath = ctx.getArgAfter("validate");
        const validateArgs = scriptPath ? [scriptPath] : [];
        const cmd = new ScriptValidateCommand();

        if (!cmd.validate(validateArgs, options)) {
          ctx.console.error("Usage: demo-reel script validate <script.json>");
          return 1;
        }

        const commandCtx: ScriptValidateCommandContext = {
          ...ctx,
          scriptCommands: {
            validate: ctx.scriptCommands.validate,
          },
        };
        return await cmd.execute(validateArgs, options, commandCtx);
      }

      case "fix": {
        const scriptPath = ctx.getArgAfter("fix");
        const fixArgs = scriptPath ? [scriptPath] : [];
        const cmd = new ScriptFixCommand();

        if (!cmd.validate(fixArgs, options)) {
          ctx.console.error("Usage: demo-reel script fix <script.json>");
          return 1;
        }

        const commandCtx: ScriptFixCommandContext = {
          ...ctx,
          scriptCommands: {
            fix: ctx.scriptCommands.fix,
          },
        };
        return await cmd.execute(fixArgs, options, commandCtx);
      }

      default: {
        const cmd = new ScriptPipelineCommand();
        const pipelineArgs = [subcommandOrDescription];

        if (!cmd.validate(pipelineArgs, options)) {
          ctx.console.error("Usage: demo-reel script <description> --url <url>");
          ctx.console.error("Or use a subcommand: generate, voice, build, validate, fix");
          return 1;
        }

        const commandCtx: ScriptPipelineCommandContext = {
          ...ctx,
          resolveVoiceConfig: ctx.resolveVoiceConfig,
          scriptCommands: {
            pipeline: ctx.scriptCommands.pipeline,
          },
        };
        return await cmd.execute(pipelineArgs, options, commandCtx);
      }
    }
  }
}

export function createDefaultScriptRouterContext(
  base: CommandContext,
  scriptCommands: ScriptRouterCommandContext["scriptCommands"],
): ScriptRouterCommandContext {
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
    scriptCommands,
  };
}
