# Config Loader Module

## Purpose

Loads and validates demo configuration from `.demo.ts` or `.config.ts` files. Resolves output paths, discovers scenario files, and provides the bridge between CLI arguments and validated config.

## Location

`src/config-loader.ts`

## API

### Primary Entry Points

```ts
export async function loadConfig(configPath: string, cliOutputDir?: string): Promise<LoadedConfig>;

export interface LoadedConfig {
  config: DemoReelConfig;
  configPath: string;
  outputPath: string;
}
```

**What it does:**

1. Checks file exists
2. Loads config based on extension:
   - `.ts` → dynamic `import()` → extract default export
   - `.json` → `fs.readFile()` → `JSON.parse()`
3. Validates with `demoReelConfigSchema.parse()`
4. Resolves output path considering: `config.outputPath`, `config.name`, `config.outputDir`, CLI `--output-dir`, and `config.timestamp`
5. Returns validated config + absolute output path

### Scenario Discovery

```ts
export async function findScenarioFiles(
  cwd?: string,
  pattern?: string, // default: "**/*.demo.ts"
): Promise<string[]>;
```

Uses `glob` to find all `.demo.ts` files in the project, excluding `node_modules`, `dist`, and `test-results`.

```ts
export async function loadScenario(name: string, cwd?: string): Promise<string | null>;
```

Tries `${name}.demo.ts` then `${name}.config.ts` in the current working directory.

```ts
export async function findConfig(cwd?: string): Promise<string | null>;
```

Checks for `demo-reel.config.ts` or `demo-reel.config.json` in the current directory.

### Output Path Resolution

```
Priority order:
1. config.outputPath (absolute or relative to config file dir)
2. config.name + config.outputDir (or CLI --output-dir) + optional timestamp
3. Base name from config file + config.outputDir (or CLI --output-dir) + optional timestamp
```

**Format selection:**

- If audio is configured → `mp4` (required for FFmpeg AAC encoding)
- Otherwise → `webm` (Playwright native format, no re-encode needed)
- Override with `config.outputFormat`

**Timestamp mode:**

- If `config.timestamp: true` → `${name}-YYYYMMDD-HHmmss.${ext}`
- Default: `false` (for CI/CD determinism)

### Base Name Extraction

```ts
function getBaseNameFromConfig(configPath: string): string;
```

Strips `.demo.ts` / `.config.ts` / `.demo` / `.config` suffixes:

- `onboarding.demo.ts` → `onboarding`
- `login.config.ts` → `login`
- `demo-reel.config.ts` → `demo-reel`

### Config File Loading

```ts
async function loadConfigFile(configPath: string): Promise<DemoReelConfig>;
```

- **`.ts` files:** Dynamic `import(pathToFileURL(configPath).href)`, extract `module.default || module`
- **`.json` files:** `readFile` + `JSON.parse`
- **Other extensions:** throws `Unsupported config file extension`

All loaded configs are validated through `demoReelConfigSchema.parse()`.

## Current Usage in `index.ts`

The `generate()` function validates config in-memory via `validateConfig()` and passes it through `PipelineContext` — no temp JSON roundtrip. The previous workaround (write to `.demo.tmp.json`, load, delete) has been eliminated.

## CLI Integration

In `cli.ts`, config loading varies by command:

```ts
// Single scenario:
const loaded = await loadScenario(name, cwd);
if (!loaded) {
  /* error */
}
const result = await loadConfig(loaded, options.outputDir);

// All scenarios:
const files = await findScenarioFiles(cwd);
for (const file of files) {
  const result = await loadConfig(file, options.outputDir);
  await runScenario(result, options);
}
```
