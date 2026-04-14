#!/usr/bin/env node
import { loadConfig, loadScenario, findScenarioFiles } from "./config-loader.js";
import { runVideoScenario, setOnBrowserCreated } from "./video-handler.js";
import { generate } from "./index.js";
import { writeFile } from "fs/promises";
import { pathToFileURL } from "url";
import type { DemoReelConfig } from "./schemas.js";
import {
  scriptGenerate,
  scriptVoice,
  scriptBuild,
  scriptValidate,
  scriptFix,
  scriptFullPipeline,
} from "./script/cli.js";
import { resolveVoiceConfig } from "./voice-config.js";
import {
  InitCommand,
  ScriptGenerateCommand,
  ScriptBuildCommand,
  ScriptFixCommand,
  CommandRegistry,
  type GlobalOptions,
  type CommandContext,
  type ScriptBuildCommandContext,
  type ScriptGenerateCommandContext,
  type ScriptFixCommandContext,
} from "./commands/index.js";

interface CliOptions {
  verbose: boolean;
  dryRun: boolean;
  all: boolean;
  help?: boolean;
  init?: boolean;
  script?: boolean;
  outputDir?: string;
  headed?: boolean;
  tags?: string[];
  // Script-specific options
  scriptUrl?: string;
  scriptOutput?: string;
  scriptVoice?: string;
  scriptSpeed?: number;
  scriptHints?: string[];
  noCache?: boolean;
  resolution?: string;
  format?: string;
}

function toGlobalOptions(options: CliOptions): GlobalOptions {
  return {
    verbose: options.verbose,
    dryRun: options.dryRun,
    headed: options.headed,
    outputDir: options.outputDir,
    tags: options.tags,
    scriptUrl: options.scriptUrl,
    scriptOutput: options.scriptOutput,
    scriptVoice: options.scriptVoice,
    scriptSpeed: options.scriptSpeed,
    scriptHints: options.scriptHints,
    noCache: options.noCache,
    resolution: options.resolution,
    format: options.format,
  };
}

function createCommandContext(): CommandContext {
  return {
    fs: {
      writeFile: async (path: string, content: string, encoding: string) => {
        await writeFile(path, content, encoding as BufferEncoding);
      },
    },
    cwd: () => process.cwd(),
    console: {
      log: (msg: string) => console.log(msg),
      error: (msg: string) => console.error(msg),
    },
  };
}

let currentBrowser: { browser: any; context: any } | null = null;

function registerCleanup(browser: any, context: any): void {
  currentBrowser = { browser, context };
}

async function cleanupBrowser(): Promise<void> {
  if (currentBrowser) {
    try {
      if (currentBrowser.context) {
        await currentBrowser.context.close();
      }
      if (currentBrowser.browser) {
        await currentBrowser.browser.close();
      }
    } catch (e) {
      console.log("Cleanup errors:", e);
    }
    currentBrowser = null;
  }
}

function setupSignalHandlers(): void {
  const cleanup = (signal: "SIGINT" | "SIGTERM") => {
    const exitCode = signal === "SIGINT" ? 130 : 0;
    const timeout = setTimeout(() => process.exit(exitCode), 2000);
    cleanupBrowser()
      .catch(() => {})
      .finally(() => {
        clearTimeout(timeout);
        process.exit(exitCode);
      });
  };
  process.once("SIGINT", () => cleanup("SIGINT"));
  process.once("SIGTERM", () => cleanup("SIGTERM"));
}

const addTags = (existing: string[] | undefined, value: string | undefined) => {
  if (!value) {
    return existing;
  }

  const tags = value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);

  if (tags.length === 0) {
    return existing;
  }

  return [...(existing ?? []), ...tags];
};

function shouldGenerateVoice(config: DemoReelConfig): boolean {
  const hasVoice = Boolean(config.voice);
  const hasNarration = (config.scenes ?? []).some((scene) => Boolean(scene.narration));
  const hasNarrationAudio = Boolean(config.audio?.narration || config.audio?.narrationManifest);
  return hasVoice && hasNarration && !hasNarrationAudio;
}

async function runScenario(
  loaded: Awaited<ReturnType<typeof loadConfig>>,
  options: CliOptions,
): Promise<void> {
  if (shouldGenerateVoice(loaded.config)) {
    const config = options.outputDir
      ? { ...loaded.config, outputDir: options.outputDir }
      : loaded.config;
    await generate(config, { verbose: options.verbose });
    return;
  }

  await runVideoScenario(loaded.config, loaded.outputPath, loaded.configPath, options);
}

export function parseArgs(): { scenario?: string; options: CliOptions } {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    verbose: false,
    dryRun: false,
    all: false,
  };
  let scenario: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--verbose" || arg === "-v") {
      options.verbose = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--all") {
      options.all = true;
    } else if (arg === "--output-dir" || arg === "-o") {
      options.outputDir = args[++i];
    } else if (arg === "--headed") {
      options.headed = true;
    } else if (arg === "--tag") {
      options.tags = addTags(options.tags, args[++i]);
    } else if (arg.startsWith("--tag=")) {
      options.tags = addTags(options.tags, arg.slice("--tag=".length));
    } else if (arg === "--url") {
      options.scriptUrl = args[++i];
    } else if (arg.startsWith("--url=")) {
      options.scriptUrl = arg.slice("--url=".length);
    } else if (arg === "--output" || arg === "--name") {
      options.scriptOutput = args[++i];
    } else if (arg === "--voice") {
      options.scriptVoice = args[++i];
    } else if (arg === "--speed") {
      options.scriptSpeed = parseFloat(args[++i]);
    } else if (arg === "--hint") {
      options.scriptHints = options.scriptHints || [];
      options.scriptHints.push(args[++i]);
    } else if (arg === "--no-cache") {
      options.noCache = true;
    } else if (arg === "--resolution") {
      options.resolution = args[++i];
    } else if (arg === "--format") {
      options.format = args[++i];
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "init") {
      options.init = true;
    } else if (arg === "script") {
      options.script = true;
    } else if (!arg.startsWith("-") && scenario === undefined) {
      scenario = arg;
    }
  }

  return { scenario, options };
}

export function showHelp(): void {
  console.log(`
demo-reel - Create demo videos from web apps

Usage:
  demo-reel [command] [options]

Commands:
  init                         Create example .demo.ts scenario file
  script <subcommand>          AI-powered script generation
  [scenario]                   Run a specific scenario

Script subcommands:
  script generate "desc" --url <url>   Generate a script from description
  script voice <script.json>           Generate voiceover audio
  script build <script.json>           Build .demo.ts from timed script
  script validate <script.json>        Validate selectors against live app
  script fix <script.json>             Fix broken selectors via re-crawl
  script "description" --url <url>     Full pipeline (generate → voice → build)

Options:
  --all                        Run all *.demo.ts files in the project
  --output-dir, -o <dir>       Override output directory for videos
  --dry-run                    Validate config without recording
  --headed                     Show browser window (non-headless)
  --tag <tag>[,<tag>]          Run only scenarios with matching tags
  --verbose, -v                Show detailed output
  --help, -h                   Show this help message

Script options:
  --url <url>                  Starting URL for script generation
  --output, --name <name>      Output name (without extension)
  --voice <voice>              TTS voice name (default: alloy)
  --speed <number>             TTS speed multiplier (default: 1.0)
  --hint <text>                Hint for script generator (repeatable)
  --no-cache                   Skip voice cache
  --resolution <preset>        Video resolution (HD, FHD, 2K, 4K)
  --format <format>            Output format (mp4, webm)

Examples:
  demo-reel init                        # Create example.demo.ts
  demo-reel                             # Run all *.demo.ts files
  demo-reel onboarding                  # Run onboarding.demo.ts
  demo-reel --dry-run                   # Validate without recording
  demo-reel -o ./public/videos          # Override output directory
  demo-reel script "Show signup flow" --url https://app.example.com
  demo-reel script generate "Show signup" --url https://app.example.com
  demo-reel script voice demo.script.json
  demo-reel script build demo.script.json
`);
}

export async function handleScriptCommand(
  subcommandOrDescription: string | undefined,
  options: CliOptions,
): Promise<number> {
  const voice = resolveVoiceConfig({
    provider: "openai",
    voice: options.scriptVoice || "alloy",
    speed: options.scriptSpeed || 1.0,
  });

  const baseOpts = {
    verbose: options.verbose,
    headed: options.headed,
    noCache: options.noCache,
  };

  if (!subcommandOrDescription) {
    console.error("Usage: demo-reel script <subcommand|description> [options]");
    console.error('Run "demo-reel --help" for details.');
    return 1;
  }

  // Check if it's a known subcommand
  switch (subcommandOrDescription) {
    case "generate": {
      // demo-reel script generate "description" --url <url>
      // The actual description is the next positional arg — we need to re-parse
      const descIndex = process.argv.indexOf("generate") + 1;
      const description = process.argv[descIndex];
      const generateArgs = description ? [description] : [];

      const cmd = new ScriptGenerateCommand();
      if (!cmd.validate(generateArgs, toGlobalOptions(options))) {
        console.error("Usage: demo-reel script generate <description> --url <url>");
        return 1;
      }

      const generateCtx: ScriptGenerateCommandContext = {
        ...createCommandContext(),
        scriptCommands: {
          generate: scriptGenerate,
        },
        getArgs: () => process.argv,
      };

      return await cmd.execute(generateArgs, toGlobalOptions(options), generateCtx);
    }

    case "voice": {
      const descIndex = process.argv.indexOf("voice") + 1;
      const scriptPath = process.argv[descIndex];
      if (!scriptPath) {
        console.error("Usage: demo-reel script voice <script.json>");
        return 1;
      }
      await scriptVoice(scriptPath, voice, baseOpts);
      return 0;
    }

    case "build": {
      const descIndex = process.argv.indexOf("build") + 1;
      const scriptPath = process.argv[descIndex];
      const buildArgs = scriptPath ? [scriptPath] : [];

      const cmd = new ScriptBuildCommand();
      if (!cmd.validate(buildArgs, toGlobalOptions(options))) {
        console.error("Usage: demo-reel script build <script.json>");
        return 1;
      }

      const buildCtx: ScriptBuildCommandContext = {
        ...createCommandContext(),
        scriptCommands: {
          build: scriptBuild,
        },
      };

      return await cmd.execute(buildArgs, toGlobalOptions(options), buildCtx);
    }

    case "validate": {
      const descIndex = process.argv.indexOf("validate") + 1;
      const scriptPath = process.argv[descIndex];
      if (!scriptPath) {
        console.error("Usage: demo-reel script validate <script.json>");
        return 1;
      }
      const valid = await scriptValidate(scriptPath, baseOpts);
      return valid ? 0 : 1;
    }

    case "fix": {
      const descIndex = process.argv.indexOf("fix") + 1;
      const scriptPath = process.argv[descIndex];
      const fixArgs = scriptPath ? [scriptPath] : [];

      const cmd = new ScriptFixCommand();
      if (!cmd.validate(fixArgs, toGlobalOptions(options))) {
        console.error("Usage: demo-reel script fix <script.json>");
        return 1;
      }

      const fixCtx: ScriptFixCommandContext = {
        ...createCommandContext(),
        scriptCommands: {
          fix: scriptFix,
        },
      };

      return await cmd.execute(fixArgs, toGlobalOptions(options), fixCtx);
    }

    default: {
      // Full pipeline: demo-reel script "description" --url <url>
      if (!options.scriptUrl) {
        console.error("Usage: demo-reel script <description> --url <url>");
        console.error("Or use a subcommand: generate, voice, build, validate, fix");
        return 1;
      }
      await scriptFullPipeline(subcommandOrDescription, options.scriptUrl, {
        ...baseOpts,
        output: options.scriptOutput,
        voice,
        hints: options.scriptHints,
        resolution: options.resolution,
        format: options.format,
      });
      return 0;
    }
  }
}

export async function runCli(): Promise<number> {
  const { scenario, options } = parseArgs();
  const tagFilter = options.tags && options.tags.length > 0 ? new Set(options.tags) : null;
  const matchesTags = (tags: string[] | undefined) => {
    if (!tagFilter) {
      return true;
    }
    if (!tags || tags.length === 0) {
      return false;
    }
    return tags.some((tag) => tagFilter.has(tag));
  };

  setupSignalHandlers();
  setOnBrowserCreated((browser, context) => {
    registerCleanup(browser, context);
  });

  try {
    if (options.help) {
      showHelp();
      return 0;
    }

    // Use Command Pattern for init command
    if (options.init) {
      const registry = new CommandRegistry();
      registry.register(new InitCommand());

      const command = registry.find(["init"]);
      if (command && command.validate([], toGlobalOptions(options))) {
        return await command.execute([], toGlobalOptions(options), createCommandContext());
      }
      return 1;
    }

    if (options.script) {
      return await handleScriptCommand(scenario, options);
    }

    if (options.all) {
      // Run all demo scenarios
      const files = await findScenarioFiles();

      if (files.length === 0) {
        console.error("No *.demo.ts files found");
        return 1;
      }

      console.log(`Found ${files.length} scenario(s)`);
      if (tagFilter) {
        console.log(`Filtering by tags: ${options.tags?.join(", ")}`);
      }

      let matchedCount = 0;

      for (const file of files) {
        console.log(`\n▶ ${file}`);
        const loaded = await loadConfig(file, options.outputDir);
        if (!matchesTags(loaded.config.tags)) {
          if (options.verbose) {
            console.log("  ↳ Skipped (tags)");
          }
          continue;
        }
        matchedCount += 1;
        await runScenario(loaded, options);
      }

      if (tagFilter && matchedCount === 0) {
        console.error(`No scenarios match tags: ${options.tags?.join(", ")}`);
        return 1;
      }
    } else if (scenario) {
      // Run specific scenario — accept full file path or scenario name
      let configPath: string | null = null;

      // Check if it's a direct file path
      const ext = scenario.split(".").pop();
      if (ext && ["ts", "js", "mjs", "json"].includes(ext)) {
        const { resolve } = await import("path");
        const fullPath = resolve(scenario);
        const { access } = await import("fs/promises");
        try {
          await access(fullPath);
          configPath = fullPath;
        } catch {
          // File doesn't exist, try as scenario name
        }
      }

      // Fall back to scenario name lookup
      if (!configPath) {
        configPath = await loadScenario(scenario);
      }

      if (!configPath) {
        console.error(`Scenario not found: ${scenario}`);
        console.error("Looked for:");
        console.error(`  - ${scenario}.demo.ts`);
        console.error(`  - ${scenario}.config.ts`);
        return 1;
      }

      const loaded = await loadConfig(configPath, options.outputDir);
      if (!matchesTags(loaded.config.tags)) {
        console.error(`Scenario does not match tags: ${options.tags?.join(", ")}`);
        return 1;
      }
      await runScenario(loaded, options);
    } else {
      // Run all scenarios
      const files = await findScenarioFiles();

      if (files.length === 0) {
        console.error("No *.demo.ts files found");
        console.error('Run "demo-reel init" to create an example scenario');
        return 1;
      }

      console.log(`Found ${files.length} scenario(s)`);
      if (tagFilter) {
        console.log(`Filtering by tags: ${options.tags?.join(", ")}`);
      }

      let matchedCount = 0;

      for (const file of files) {
        console.log(`\n▶ ${file}`);
        const loaded = await loadConfig(file, options.outputDir);
        if (!matchesTags(loaded.config.tags)) {
          if (options.verbose) {
            console.log("  ↳ Skipped (tags)");
          }
          continue;
        }
        matchedCount += 1;
        await runScenario(loaded, options);
      }

      if (tagFilter && matchedCount === 0) {
        console.error(`No scenarios match tags: ${options.tags?.join(", ")}`);
        return 1;
      }
    }

    return 0;
  } catch (error) {
    if (options.verbose) {
      console.error(error);
    } else {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
    return 1;
  }
}

export async function main(): Promise<void> {
  process.exit(await runCli());
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
