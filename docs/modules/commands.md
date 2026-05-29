# Commands Module

## Purpose

Implements the Command pattern for CLI operations. Every CLI operation is a `Command` that the `CommandRegistry` discovers and dispatches. The CLI entry point (`cli.ts`) delegates to the registry rather than manually wiring commands.

## Location

`src/commands/`

## Core Interface

```ts
export interface Command {
  readonly name: string;
  validate(args: string[], options: GlobalOptions): boolean;
  execute(args: string[], options: GlobalOptions, ctx: CommandContext): Promise<number>;
}

export interface CommandContext {
  fs: { writeFile: WriteFile };
  cwd: () => string;
  console: { log: (msg: string) => void; error: (msg: string) => void };
}

export interface GlobalOptions {
  verbose: boolean;
  dryRun: boolean;
  headed?: boolean;
  outputDir?: string;
  tags?: string[];
  scriptUrl?: string;
  scriptOutput?: string;
  scriptVoice?: string;
  scriptSpeed?: number;
  scriptHints?: string[];
  noCache?: boolean;
  resolution?: string;
  format?: string;
  trackName?: string;
  trackSession?: string;
}
```

## CommandRegistry

```ts
export class CommandRegistry {
  register(command: Command): void;
  find(args: string[]): Command | null;
  getAll(): Command[];
}

export function createDefaultRegistry(): CommandRegistry;
```

Maps command names to `Command` instances. `find()` matches the first CLI argument against registered command names.

## Command List

| Command                 | Name                | Purpose                              |
| ----------------------- | ------------------- | ------------------------------------ |
| `InitCommand`           | `"init"`            | Create example `.demo.ts` file       |
| `RunSingleCommand`      | `"run:single"`      | Run one scenario by name             |
| `RunAllCommand`         | `"run:all"`         | Run all `*.demo.ts` files            |
| `RunDefaultCommand`     | `"run:default"`     | Run single file or error if multiple |
| `TrackCommand`          | `"track"`           | Record browser interactions          |
| `ScriptRouterCommand`   | `"script"`          | AI script generation pipeline        |
| `ScriptGenerateCommand` | `"script:generate"` | Generate script from description     |
| `ScriptVoiceCommand`    | `"script:voice"`    | Generate voiceover for script        |
| `ScriptBuildCommand`    | `"script:build"`    | Build `.demo.ts` from script         |
| `ScriptValidateCommand` | `"script:validate"` | Validate selectors                   |
| `ScriptFixCommand`      | `"script:fix"`      | Fix broken selectors                 |
| `ScriptPipelineCommand` | `"script:pipeline"` | Full generate + voice + build        |

## Context Extension Pattern

Commands that need more than the base `CommandContext` define their own context type:

```ts
// RunSingleCommand needs config loading + scenario execution
export interface RunSingleCommandContext<T> extends CommandContext {
  resolvePath: (path: string) => string;
  pathExists: (path: string) => Promise<boolean>;
  loadScenario: (name: string, cwd?: string) => Promise<string | null>;
  loadConfig: (path: string, outputDir?: string) => Promise<T>;
  runScenario: (loaded: T) => Promise<void>;
}

// TrackCommand needs browser launch capability
export interface TrackCommandContext extends CommandContext {
  launchBrowser: () => Promise<{ browser: Browser; context: BrowserContext; page: Page }>;
}
```

## Dependency Injection via Context

All I/O is abstracted through `CommandContext`:

- `fs.writeFile` — File writing (testable with mock)
- `cwd()` — Current working directory (injectable)
- `console.log/error` — Output (capturable in tests)

Extended contexts inject domain operations (config loading, scenario running, browser launching) that the command orchestrates but doesn't own.

## Flow

```
cli.ts :: runCli()
  → parseArgs()
  → setupSignalHandlers()
  → if options.init:    registry.register(InitCommand) → find(["init"]) → execute()
  → if options.track:   new TrackCommand() → execute()
  → if options.script:  new ScriptRouterCommand() → execute()
  → if options.all:     new RunAllCommand() → execute()
  → if scenario name:   new RunSingleCommand() → execute()
  → else:               new RunDefaultCommand() → execute()
```

## Known Issue

Currently, `cli.ts` manually creates command instances with `new` and manually wires their context dependencies. The `CommandRegistry` is only used for `InitCommand`. Other commands are instantiated directly.

**Proposed fix:** `cli.ts` registers all commands in the registry, then dispatches via `registry.find()`. Each command is responsible for building its own pipeline (e.g., `RunSingleCommand` composes the pipeline stages and calls `generate()`).

## Command Execution Contract

Every command, regardless of internal logic:

1. Returns exit code `0` on success, non-zero on failure
2. Logs to `ctx.console` for user-visible output
3. Throws on fatal errors (caught by `cli.ts` error handler)
4. Is independently testable with mock context
