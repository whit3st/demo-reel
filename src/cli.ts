#!/usr/bin/env node
import { loadConfig, loadScenario, findScenarioFiles } from "./config-loader.js";
import { runVideoScenario, setOnBrowserCreated } from "./video-handler.js";
import { writeFile } from "fs/promises";
import { join } from "path";

interface CliOptions {
  verbose: boolean;
  dryRun: boolean;
  all: boolean;
  init?: boolean;
  outputDir?: string;
  headed?: boolean;
  tags?: string[];
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
  const cleanup = () => {
    cleanupBrowser()
      .then(() => process.exit(0))
      .catch(() => process.exit(0));
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

const EXAMPLE_SCENARIO = `import { defineConfig } from 'demo-reel';

export default defineConfig({
  video: {
    resolution: "FHD",
  },

  name: 'example',

  cursor: 'dot',
  motion: 'smooth',
  typing: 'humanlike',
  timing: 'normal',

  steps: [
    { action: 'goto', url: 'https://example.com' },
    { action: 'wait', ms: 1000 },
  ],
});
`;

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

function parseArgs(): { scenario?: string; options: CliOptions } {
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
    } else if (arg === "--help" || arg === "-h") {
      showHelp();
      process.exit(0);
    } else if (arg === "init") {
      options.init = true;
    } else if (!arg.startsWith("-")) {
      scenario = arg;
    }
  }

  return { scenario, options };
}

function showHelp(): void {
  console.log(`
demo-reel - Create demo videos from web apps

Usage:
  demo-reel [command] [options]

Commands:
  init                         Create example .demo.ts scenario file
  [scenario]                   Run a specific scenario

Options:
  --all                        Run all *.demo.ts files in the project
  --output-dir, -o <dir>       Override output directory for videos
  --dry-run                    Validate config without recording
  --headed                     Show browser window (non-headless)
  --tag <tag>[,<tag>]          Run only scenarios with matching tags
  --verbose, -v                Show detailed output
  --help, -h                   Show this help message

Examples:
  demo-reel init                        # Create example.demo.ts
  demo-reel                             # Run all *.demo.ts files
  demo-reel onboarding                  # Run onboarding.demo.ts
  demo-reel --dry-run                   # Validate without recording
  demo-reel -o ./public/videos          # Override output directory
`);
}

async function main(): Promise<void> {
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
    if (options.init) {
      const demoPath = join(process.cwd(), "example.demo.ts");
      await writeFile(demoPath, EXAMPLE_SCENARIO, "utf-8");
      console.log(`Created ${demoPath}`);
      process.exit(0);
    }

    if (options.all) {
      // Run all demo scenarios
      const files = await findScenarioFiles();

      if (files.length === 0) {
        console.error("No *.demo.ts files found");
        process.exit(1);
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
        await runVideoScenario(loaded.config, loaded.outputPath, loaded.configPath, options);
      }

      if (tagFilter && matchedCount === 0) {
        console.error(`No scenarios match tags: ${options.tags?.join(", ")}`);
        process.exit(1);
      }
    } else if (scenario) {
      // Run specific scenario
      const configPath = await loadScenario(scenario);

      if (!configPath) {
        console.error(`Scenario not found: ${scenario}`);
        console.error("Looked for:");
        console.error(`  - ${scenario}.demo.ts`);
        console.error(`  - ${scenario}.config.ts`);
        process.exit(1);
      }

      const loaded = await loadConfig(configPath, options.outputDir);
      if (!matchesTags(loaded.config.tags)) {
        console.error(`Scenario does not match tags: ${options.tags?.join(", ")}`);
        process.exit(1);
      }
      await runVideoScenario(loaded.config, loaded.outputPath, loaded.configPath, options);
    } else {
      // Run all scenarios
      const files = await findScenarioFiles();

      if (files.length === 0) {
        console.error("No *.demo.ts files found");
        console.error('Run "demo-reel init" to create an example scenario');
        process.exit(1);
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
        await runVideoScenario(loaded.config, loaded.outputPath, loaded.configPath, options);
      }

      if (tagFilter && matchedCount === 0) {
        console.error(`No scenarios match tags: ${options.tags?.join(", ")}`);
        process.exit(1);
      }
    }

    process.exit(0);
  } catch (error) {
    if (options.verbose) {
      console.error(error);
    } else {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
    process.exit(1);
  }
}

main();
