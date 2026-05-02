#!/usr/bin/env node
import { loadConfig, loadScenario, findScenarioFiles } from "./config-loader.js";
import { setOnBrowserCreated } from "./video-handler.js";
import { generate } from "./index.js";
import { E2ERuntime } from "./runtime/e2e-runtime.js";
import { VideoRuntime } from "./runtime/video-runtime.js";
import { access, readFile, writeFile } from "fs/promises";
import { resolve as resolvePath } from "path";
import { pathToFileURL } from "url";
import { chromium } from "playwright";
import type { DemoReelVideoConfig } from "./schemas.js";
import { demoReelConfigSchema, demoReelConfigInputSchema } from "./schemas.js";
import {
  InitCommand,
  ScriptRouterCommand,
  createDefaultScriptRouterContext,
  RunAllCommand,
  RunSingleCommand,
  RunDefaultCommand,
  TrackCommand,
  CommandRegistry,
  type GlobalOptions,
  type CommandContext,
  type RunAllCommandContext,
  type RunDefaultCommandContext,
  type RunSingleCommandContext,
  type TrackCommandContext,
} from "./commands/index.js";

interface CliOptions {
  command?: "run" | "validate" | "list";
  mode?: "video" | "e2e";
  verbose: boolean;
  dryRun: boolean;
  all: boolean;
  grep?: string;
  retries?: number;
  parallel?: number;
  failFast?: boolean;
  repeat?: number;
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
  // Track-specific options
  track?: boolean;
  trackName?: string;
  trackSession?: string;
}

function toGlobalOptions(options: CliOptions): GlobalOptions {
  return {
    verbose: options.verbose,
    dryRun: options.dryRun,
    headed: options.headed,
    outputDir: options.outputDir,
    tags: options.tags,
    grep: options.grep,
    scriptUrl: options.scriptUrl,
    scriptOutput: options.scriptOutput,
    scriptVoice: options.scriptVoice,
    scriptSpeed: options.scriptSpeed,
    scriptHints: options.scriptHints,
    noCache: options.noCache,
    resolution: options.resolution,
    format: options.format,
    trackName: options.trackName,
    trackSession: options.trackSession,
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
let signalHandlersRegistered = false;

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
  if (signalHandlersRegistered) {
    return;
  }

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
  signalHandlersRegistered = true;
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

function shouldGenerateVoice(config: DemoReelVideoConfig): boolean {
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

  const runtime = new VideoRuntime();
  const result = await runtime.run(
    {
      config: loaded.config,
      outputPath: loaded.outputPath,
      configPath: loaded.configPath,
    },
    {
      verbose: options.verbose,
      dryRun: options.dryRun,
      headed: options.headed,
    },
  );

  if (!result.ok) {
    throw new Error(result.failure?.message ?? "Video runtime failed");
  }
}

async function loadAnyConfig(configPath: string): Promise<unknown> {
  const ext = configPath.split(".").pop();

  if (ext === "ts") {
    const module = await import(pathToFileURL(resolvePath(configPath)).href);
    return module.default || module;
  }

  if (ext === "json") {
    return JSON.parse(await readFile(configPath, "utf-8"));
  }

  throw new Error(`Unsupported config file extension: .${ext ?? "unknown"}`);
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

    if (i === 0 && arg === "run") {
      options.command = "run";
    } else if (i === 0 && arg === "validate") {
      options.command = "validate";
    } else if (i === 0 && arg === "list") {
      options.command = "list";
    } else if (arg === "video" && options.command === "run") {
      options.mode = "video";
    } else if (arg === "e2e" && options.command === "run") {
      options.mode = "e2e";
    } else if (arg === "--mode") {
      const mode = args[++i];
      if (mode === "video" || mode === "e2e") {
        options.mode = mode;
      }
    } else if (arg.startsWith("--mode=")) {
      const mode = arg.slice("--mode=".length);
      if (mode === "video" || mode === "e2e") {
        options.mode = mode;
      }
    } else if (arg === "--verbose" || arg === "-v") {
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
    } else if (arg === "--grep") {
      options.grep = args[++i];
    } else if (arg.startsWith("--grep=")) {
      options.grep = arg.slice("--grep=".length);
    } else if (arg === "--retries") {
      options.retries = Number.parseInt(args[++i], 10);
    } else if (arg.startsWith("--retries=")) {
      options.retries = Number.parseInt(arg.slice("--retries=".length), 10);
    } else if (arg === "--parallel") {
      options.parallel = Number.parseInt(args[++i], 10);
    } else if (arg.startsWith("--parallel=")) {
      options.parallel = Number.parseInt(arg.slice("--parallel=".length), 10);
    } else if (arg === "--repeat") {
      options.repeat = Number.parseInt(args[++i], 10);
    } else if (arg.startsWith("--repeat=")) {
      options.repeat = Number.parseInt(arg.slice("--repeat=".length), 10);
    } else if (arg === "--fail-fast") {
      options.failFast = true;
    } else if (arg === "--url") {
      options.scriptUrl = args[++i];
    } else if (arg.startsWith("--url=")) {
      options.scriptUrl = arg.slice("--url=".length);
    } else if (arg === "--output") {
      options.scriptOutput = args[++i];
    } else if (arg === "--name") {
      const val = args[++i];
      options.scriptOutput = val;
      options.trackName = val;
    } else if (arg.startsWith("--name=")) {
      const val = arg.slice("--name=".length);
      options.scriptOutput = val;
      options.trackName = val;
    } else if (arg === "--session") {
      options.trackSession = args[++i];
    } else if (arg.startsWith("--session=")) {
      options.trackSession = arg.slice("--session=".length);
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
    } else if (arg === "track") {
      options.track = true;
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
  demo-reel run <video|e2e> [scenario|path] [options]
  demo-reel validate <scenario|path>
  demo-reel list [options]

Commands:
  run <video|e2e>              Run in explicit mode
  validate <file>              Validate config and mode constraints
  list                         List discovered scenarios
  init                         Create example .demo.ts scenario file
  track --name <name>          Record browser interactions to a track file
  script <subcommand>          AI-powered script generation
  [scenario]                   Run a specific scenario

Track options:
  --name <name>                Track file name (without extension)
  --url <url>                  Starting URL for tracking
  --session <name>             Auth session name for save/load

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
  --grep <text>                Run/list scenarios whose path includes text
  --retries <n>                E2E retries override
  --repeat <n>                 E2E repeat override
  --parallel <n>               E2E parallel override
  --fail-fast                  E2E fail fast on first failure
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

export async function runCli(): Promise<number> {
  const { scenario, options } = parseArgs();

  setupSignalHandlers();
  setOnBrowserCreated((browser, context) => {
    registerCleanup(browser, context);
  });

  try {
    if (options.command === "validate") {
      if (!scenario) {
        console.error("Usage: demo-reel validate <scenario|path>");
        return 1;
      }

      const scenarioPath = await loadScenario(scenario);
      const configPath = scenarioPath ?? resolvePath(scenario);
      const raw = await loadAnyConfig(configPath);
      demoReelConfigInputSchema.parse(raw);
      demoReelConfigSchema.parse(raw);
      console.log(`✓ Config is valid: ${configPath}`);
      return 0;
    }

    if (options.command === "list") {
      const files = await findScenarioFiles();
      const filtered = options.grep
        ? files.filter((file) => file.toLowerCase().includes(options.grep!.toLowerCase()))
        : files;
      for (const file of filtered) {
        console.log(file);
      }
      return 0;
    }

    if (options.command === "run") {
      if (!options.mode) {
        console.error("Usage: demo-reel run <video|e2e> [scenario|path] [options]");
        return 1;
      }

      if (options.mode === "e2e") {
        if (!scenario) {
          console.error("Usage: demo-reel run e2e <scenario|path>");
          return 1;
        }

        const scenarioPath = await loadScenario(scenario);
        const configPath = scenarioPath ?? resolvePath(scenario);
        const raw = await loadAnyConfig(configPath);
        const parsed = demoReelConfigSchema.parse(raw);
        if (parsed.mode !== "e2e") {
          console.error("Error: config mode is not e2e");
          return 1;
        }

        const execution = parsed.execution
          ? { ...parsed.execution }
          : { retries: 0, repeat: 1, parallel: 1, failFast: false };

        if (options.retries !== undefined) {
          execution.retries = options.retries;
        }
        if (options.repeat !== undefined) {
          execution.repeat = options.repeat;
        }
        if (options.parallel !== undefined) {
          execution.parallel = options.parallel;
        }
        if (options.failFast !== undefined) {
          execution.failFast = options.failFast;
        }

        const merged = {
          ...parsed,
          execution,
        };

        const runtime = new E2ERuntime();
        const result = await runtime.run(merged, {
          verbose: options.verbose,
          headed: options.headed,
        });
        return result.exitCode ?? (result.ok ? 0 : 2);
      }

      if (options.mode === "video" && !scenario && !options.all) {
        console.error("Usage: demo-reel run video <scenario|path> [options]");
        return 1;
      }
    }

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

    if (options.track) {
      const cmd = new TrackCommand();
      const trackCtx: TrackCommandContext = {
        ...createCommandContext(),
        async launchBrowser() {
          const browser = await chromium.launch({ headless: false });
          const context = await browser.newContext({
            viewport: { width: 1280, height: 720 },
          });
          const page = await context.newPage();
          return { browser, context, page };
        },
      };
      return await cmd.execute([], toGlobalOptions(options), trackCtx);
    }

    if (options.script) {
      const cmd = new ScriptRouterCommand();
      const scriptCtx = createDefaultScriptRouterContext(createCommandContext());
      return await cmd.execute(scenario ? [scenario] : [], toGlobalOptions(options), scriptCtx);
    }

    if (options.command !== "run") {
      console.error("Usage: demo-reel run <video|e2e> [scenario|path] [options]");
      return 1;
    }

    if (options.all) {
      type LoadedConfigType = Awaited<ReturnType<typeof loadConfig>>;
      const cmd = new RunAllCommand<LoadedConfigType>();
      const globalOptions = toGlobalOptions(options);

      const runAllCtx: RunAllCommandContext<LoadedConfigType> = {
        ...createCommandContext(),
        findScenarioFiles,
        loadConfig,
        runScenario: async (loaded) => runScenario(loaded, options),
      };

      return await cmd.execute([], globalOptions, runAllCtx);
    } else if (scenario) {
      type LoadedConfigType = Awaited<ReturnType<typeof loadConfig>>;
      const cmd = new RunSingleCommand<LoadedConfigType>();
      const globalOptions = toGlobalOptions(options);
      const singleArgs = [scenario];
      if (!cmd.validate(singleArgs, globalOptions)) {
        return 1;
      }

      const runSingleCtx: RunSingleCommandContext<LoadedConfigType> = {
        ...createCommandContext(),
        resolvePath,
        pathExists: async (path: string) => {
          try {
            await access(path);
            return true;
          } catch {
            return false;
          }
        },
        loadScenario,
        loadConfig,
        runScenario: async (loaded) => runScenario(loaded, options),
      };

      return await cmd.execute(singleArgs, globalOptions, runSingleCtx);
    } else {
      type LoadedConfigType = Awaited<ReturnType<typeof loadConfig>>;
      const cmd = new RunDefaultCommand<LoadedConfigType>();
      const globalOptions = toGlobalOptions(options);

      const runDefaultCtx: RunDefaultCommandContext<LoadedConfigType> = {
        ...createCommandContext(),
        findScenarioFiles,
        loadConfig,
        runScenario: async (loaded) => runScenario(loaded, options),
      };

      return await cmd.execute([], globalOptions, runDefaultCtx);
    }
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

/* c8 ignore next 3 */
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
