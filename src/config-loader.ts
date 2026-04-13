import { promises as fs } from "fs";
import { join, dirname, resolve, extname, basename } from "path";
import { pathToFileURL } from "url";
import { demoReelConfigSchema, type DemoReelConfig } from "./schemas.js";

export interface LoadedConfig {
  config: DemoReelConfig;
  configPath: string;
  outputPath: string;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function loadConfigFile(configPath: string): Promise<DemoReelConfig> {
  const ext = extname(configPath);

  if (ext === ".ts") {
    const module = await import(pathToFileURL(configPath).href);
    const config = module.default || module;
    return demoReelConfigSchema.parse(config);
  }

  if (ext === ".json") {
    const content = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(content);
    return demoReelConfigSchema.parse(config);
  }

  throw new Error(`Unsupported config file extension: ${ext}`);
}

function formatTimestamp(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function resolveOutputPath(
  config: DemoReelConfig,
  configPath: string,
  cliOutputDir?: string,
): string {
  // Priority 1: outputPath from config
  if (config.outputPath) {
    if (config.outputPath.startsWith("/")) {
      return config.outputPath;
    }
    return resolve(dirname(configPath), config.outputPath);
  }

  // Priority 2: name + optional timestamp + outputDir (or CLI override)
  const configDir = dirname(configPath);
  const rawOutputDir = cliOutputDir || config.outputDir || configDir;
  // Resolve outputDir relative to the config file, not cwd
  const outputDir = rawOutputDir.startsWith("/") ? rawOutputDir : resolve(configDir, rawOutputDir);
  const baseName = config.name || getBaseNameFromConfig(configPath);
  const useTimestamp = config.timestamp ?? false; // Default to false for CI/CD compatibility

  const hasAudio = Boolean(config.audio?.narration || config.audio?.background);
  const outputFormat = config.outputFormat || (hasAudio ? "mp4" : "webm");
  const extension = `.${outputFormat}`;

  if (useTimestamp) {
    const timestamp = formatTimestamp(new Date());
    return join(outputDir, `${baseName}-${timestamp}${extension}`);
  }

  return join(outputDir, `${baseName}${extension}`);
}

function getBaseNameFromConfig(configPath: string): string {
  const base = basename(configPath, extname(configPath));
  // Remove .demo or .config suffix if present
  return base.replace(/\.(demo|config)$/, "");
}

export async function loadConfig(configPath: string, cliOutputDir?: string): Promise<LoadedConfig> {
  if (!(await fileExists(configPath))) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const config = await loadConfigFile(configPath);
  const outputPath = resolveOutputPath(config, configPath, cliOutputDir);

  return {
    config,
    configPath,
    outputPath,
  };
}

export async function findConfig(cwd: string = process.cwd()): Promise<string | null> {
  const candidates = [
    "demo-reel.config.ts",
    "demo-reel.config.json",
  ];

  for (const candidate of candidates) {
    const fullPath = join(cwd, candidate);
    if (await fileExists(fullPath)) {
      return fullPath;
    }
  }

  return null;
}

export async function findScenarioFiles(
  cwd: string = process.cwd(),
  pattern: string = "**/*.demo.ts",
): Promise<string[]> {
  const { glob } = await import("glob");
  const files = await glob(pattern, {
    cwd,
    absolute: true,
    ignore: ["node_modules/**", "dist/**", "test-results/**"],
  });
  return files.sort();
}

export async function loadScenario(
  name: string,
  cwd: string = process.cwd(),
): Promise<string | null> {
  const candidates = [
    `${name}.demo.ts`,
    `${name}.config.ts`,
  ];

  for (const candidate of candidates) {
    const fullPath = join(cwd, candidate);
    if (await fileExists(fullPath)) {
      return fullPath;
    }
  }

  return null;
}
