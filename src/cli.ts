#!/usr/bin/env node
import { defineCommand, renderUsage } from "citty";
import { loadConfig, loadScenario, findScenarioFiles } from "./config-loader.js";
import { runVideoScenario, setOnBrowserCreated } from "./video-handler.js";
import { generate } from "./index.js";
import { access, writeFile } from "fs/promises";
import { resolve as resolvePath } from "path";
import { pathToFileURL } from "url";
import { chromium } from "playwright";
import type { DemoReelConfig } from "./schemas.js";
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
  if (options.dryRun) {
    await runVideoScenario(loaded.config, loaded.outputPath, loaded.configPath, options);
    return;
  }

  if (shouldGenerateVoice(loaded.config)) {
    const config = options.outputDir
      ? { ...loaded.config, outputDir: options.outputDir }
      : loaded.config;
    await generate(config, { verbose: options.verbose, noCache: options.noCache });
    return;
  }

  await runVideoScenario(loaded.config, loaded.outputPath, loaded.configPath, options);
}

export function parseArgs(): { scenario?: string; options: CliOptions; unknownFlags: string[] } {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    verbose: false,
    dryRun: false,
    all: false,
  };
  let scenario: string | undefined;
  const consumed = new Set<number>();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--verbose" || arg === "-v") {
      consumed.add(i);
      options.verbose = true;
    } else if (arg === "--dry-run") {
      consumed.add(i);
      options.dryRun = true;
    } else if (arg === "--all") {
      consumed.add(i);
      options.all = true;
    } else if (arg === "--output-dir" || arg === "-o") {
      consumed.add(i);
      options.outputDir = args[++i];
      consumed.add(i);
    } else if (arg === "--headed") {
      consumed.add(i);
      options.headed = true;
    } else if (arg === "--tag") {
      consumed.add(i);
      options.tags = addTags(options.tags, args[++i]);
      consumed.add(i);
    } else if (arg.startsWith("--tag=")) {
      consumed.add(i);
      options.tags = addTags(options.tags, arg.slice("--tag=".length));
    } else if (arg === "--url") {
      consumed.add(i);
      options.scriptUrl = args[++i];
      consumed.add(i);
    } else if (arg.startsWith("--url=")) {
      consumed.add(i);
      options.scriptUrl = arg.slice("--url=".length);
    } else if (arg === "--output") {
      consumed.add(i);
      options.scriptOutput = args[++i];
      consumed.add(i);
    } else if (arg === "--name") {
      consumed.add(i);
      const val = args[++i];
      consumed.add(i);
      options.scriptOutput = val;
      options.trackName = val;
    } else if (arg.startsWith("--name=")) {
      consumed.add(i);
      const val = arg.slice("--name=".length);
      options.scriptOutput = val;
      options.trackName = val;
    } else if (arg === "--session") {
      consumed.add(i);
      options.trackSession = args[++i];
      consumed.add(i);
    } else if (arg.startsWith("--session=")) {
      consumed.add(i);
      options.trackSession = arg.slice("--session=".length);
    } else if (arg === "--voice") {
      consumed.add(i);
      options.scriptVoice = args[++i];
      consumed.add(i);
    } else if (arg === "--speed") {
      consumed.add(i);
      options.scriptSpeed = parseFloat(args[++i]);
      consumed.add(i);
    } else if (arg === "--hint") {
      consumed.add(i);
      options.scriptHints = options.scriptHints || [];
      options.scriptHints.push(args[++i]);
      consumed.add(i);
    } else if (arg === "--no-cache") {
      consumed.add(i);
      options.noCache = true;
    } else if (arg === "--resolution") {
      consumed.add(i);
      options.resolution = args[++i];
      consumed.add(i);
    } else if (arg === "--format") {
      consumed.add(i);
      options.format = args[++i];
      consumed.add(i);
    } else if (arg === "--help" || arg === "-h") {
      consumed.add(i);
      options.help = true;
    } else if (arg === "init") {
      consumed.add(i);
      options.init = true;
    } else if (arg === "script") {
      consumed.add(i);
      options.script = true;
    } else if (arg === "track") {
      consumed.add(i);
      options.track = true;
    } else if (!arg.startsWith("-") && scenario === undefined) {
      consumed.add(i);
      scenario = arg;
    }
  }

  const unknownFlags = args.filter((_a, i) => !consumed.has(i) && args[i].startsWith("-"));

  return { scenario, options, unknownFlags };
}

const cliDef = defineCommand({
  meta: {
    name: "demo-reel",
    version: "0.7.7",
    description: "Create demo videos from web apps using Playwright",
  },
  args: {
    verbose: { type: "boolean", description: "Show detailed output", alias: ["v"] },
    "dry-run": { type: "boolean", description: "Validate config without recording" },
    headed: { type: "boolean", description: "Show browser window (non-headless)" },
    "output-dir": {
      type: "string",
      description: "Override output directory for videos",
      alias: ["o"],
      valueHint: "dir",
    },
    url: {
      type: "string",
      description: "Starting URL for script generation or tracking",
      valueHint: "url",
    },
    output: { type: "string", description: "Output name (without extension)", valueHint: "name" },
    name: {
      type: "string",
      description: "Output or track name (without extension)",
      valueHint: "name",
    },
    voice: { type: "string", description: "TTS voice name (default: alloy)", valueHint: "voice" },
    speed: {
      type: "string",
      description: "TTS speed multiplier (default: 1.0)",
      valueHint: "number",
    },
    "no-cache": { type: "boolean", description: "Skip voice cache" },
    resolution: {
      type: "string",
      description: "Video resolution (HD, FHD, 2K, 4K)",
      valueHint: "preset",
    },
    format: { type: "string", description: "Output format (mp4, webm)", valueHint: "fmt" },
    tag: {
      type: "string",
      description: "Run only scenarios with matching tag (comma-separated)",
      valueHint: "tags",
    },
    "track-name": { type: "string", description: "Track file name", valueHint: "name" },
    "track-session": {
      type: "string",
      description: "Auth session name for save/load",
      valueHint: "name",
    },
  },
});

export async function showHelp(): Promise<void> {
  console.log();
  console.log(await renderUsage(cliDef));
}

export async function runCli(): Promise<number> {
  const { scenario, options, unknownFlags } = parseArgs();

  if (unknownFlags.length > 0) {
    console.error(`Error: unknown option(s): ${unknownFlags.join(", ")}`);
    console.error("Run demo-reel --help for usage.");
    return 1;
  }

  setupSignalHandlers();
  setOnBrowserCreated((browser, context) => {
    registerCleanup(browser, context);
  });

  try {
    if (options.help) {
      await showHelp();
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
