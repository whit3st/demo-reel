# CLI Module

## Purpose

The CLI entry point (`src/cli.ts`) parses command-line arguments and dispatches to the appropriate command. Uses [Citty](https://github.com/unjs/citty) for declarative argument definitions and auto-generated `--help` output, while retaining the existing Command pattern for execution logic.

## Location

`src/cli.ts`

## Entry Points

| Path | Purpose |
|------|---------|
| `bin/demo-reel.mjs` | Installed binary (package.json `bin` field). Spawns `dist/cli.js` via `tsx/esm`. |
| `src/cli.ts` | Full CLI implementation. Direct execution via `tsx src/cli.ts`. |

## Usage

```bash
demo-reel                          # Run all *.demo.ts files
demo-reel my-scenario              # Run a specific scenario
demo-reel init                     # Create example .demo.ts
demo-reel track --name <name>      # Record browser interactions
demo-reel script <subcommand>      # AI-powered script generation
```

## Global Options

| Flag | Alias | Description |
|------|-------|-------------|
| `--verbose` | `-v` | Show detailed output |
| `--dry-run` | | Validate config without recording |
| `--headed` | | Show browser window (non-headless) |
| `--output-dir` | `-o` | Override output directory |
| `--tag` | | Run only scenarios with matching tag (comma-separated) |
| `--help` | `-h` | Show auto-generated help |

## Script Options

| Flag | Description |
|------|-------------|
| `--url` | Starting URL for script generation |
| `--output`, `--name` | Output name (without extension) |
| `--voice` | TTS voice name |
| `--speed` | TTS speed multiplier |
| `--hint` | Hint for script generator (repeatable) |
| `--no-cache` | Skip voice cache |
| `--resolution` | Video resolution (HD, FHD, 2K, 4K) |
| `--format` | Output format (mp4, webm) |

## Architecture

The CLI uses a hybrid approach:

1. **Citty** for declarative arg definitions and `--help` rendering (`renderUsage`)
2. **Manual arg parsing** (`parseArgs`) for multi-value flags (`--tag`, `--hint`) that Citty doesn't natively accumulate
3. **Command Pattern** for execution — `InitCommand`, `TrackCommand`, `ScriptRouterCommand`, `RunSingleCommand`, `RunAllCommand`

```
parseArgs() ─► CliOptions ─► runCli() ─► Command.execute()
                    ▲
          cliDef (citty) ─► renderUsage() ─► showHelp()
```

The citty `cliDef` serves double duty: it defines the arg schema for `--help` rendering and provides a reference for the manual `parseArgs` logic.

## Exports

| Export | Type | Purpose |
|--------|------|---------|
| `runCli()` | `() => Promise<number>` | Parse args from `process.argv` and execute. Returns exit code. |
| `main()` | `() => Promise<void>` | Calls `runCli()` and `process.exit()`. |
| `showHelp()` | `() => Promise<void>` | Renders and prints auto-generated help via Citty. |
| `parseArgs()` | `() => { scenario?, options }` | Legacy arg parser (internal). |
