# Phase 6: Proper CLI Command Wiring

## Objective

Fix `src/cli.ts` to use `CommandRegistry` properly for all commands, instead of manually instantiating commands with `new`. Currently the CLI:

- Uses `registry.find(["init"])` only for `InitCommand`
- Manually creates `RunAllCommand`, `RunSingleCommand`, `RunDefaultCommand`, `TrackCommand`, `ScriptRouterCommand` with `new`
- Manually wires their context dependencies inline

### The Problem

```ts
// In cli.ts currently:
if (options.init) {
  const registry = new CommandRegistry()
  registry.register(new InitCommand())
  const command = registry.find(["init"])
  // ...
} else if (options.track) {
  const cmd = new TrackCommand()       // Direct instantiation
  const trackCtx = { ... }             // Manually wired context
  // ...
} else if (options.all) {
  const cmd = new RunAllCommand()      // Direct instantiation
  const runAllCtx = { ... }            // Manually wired context
  // ...
} else if (scenario) {
  const cmd = new RunSingleCommand()   // Direct instantiation
  // ...
} else {
  const cmd = new RunDefaultCommand()  // Direct instantiation
  // ...
}
```

The `CommandRegistry` exists but is only used for `init`. All other commands bypass it entirely.

## The Fix

### Step 1: Create a command registration function

```ts
// src/cli.ts — new function
function createDefaultRegistry(): CommandRegistry {
  const registry = new CommandRegistry();
  registry.register(new InitCommand());
  registry.register(new TrackCommand());
  registry.register(new RunAllCommand());
  registry.register(new RunSingleCommand());
  registry.register(new RunDefaultCommand());
  // Script commands registered via ScriptRouterCommand (which is itself registered)
  return registry;
}
```

### Step 2: Create context builders

Each command type needs its own context, so we need context factories:

```ts
function buildRunSingleContext(options: CliOptions): RunSingleCommandContext<LoadedConfig> {
  return {
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
}

function buildRunAllContext(options: CliOptions): RunAllCommandContext<LoadedConfig> {
  return {
    ...createCommandContext(),
    findScenarioFiles,
    loadConfig,
    runScenario: async (loaded) => runScenario(loaded, options),
  };
}

function buildRunDefaultContext(options: CliOptions): RunDefaultCommandContext<LoadedConfig> {
  return {
    ...createCommandContext(),
    findScenarioFiles,
    loadConfig,
    runScenario: async (loaded) => runScenario(loaded, options),
  };
}

function buildTrackContext(options: CliOptions): TrackCommandContext {
  return {
    ...createCommandContext(),
    async launchBrowser() {
      const browser = await chromium.launch({ headless: false });
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const page = await context.newPage();
      return { browser, context, page };
    },
  };
}
```

### Step 3: Rewrite runCli() to use registry dispatch

```ts
export async function runCli(): Promise<number> {
  const { scenario, options } = parseArgs();
  setupSignalHandlers();

  // Register all commands
  const registry = createDefaultRegistry();

  try {
    if (options.help) {
      showHelp();
      return 0;
    }

    let args: string[];
    let commandName: string;
    let ctx: CommandContext;

    if (options.init) {
      commandName = "init";
      args = ["init"];
      ctx = createCommandContext();
    } else if (options.track) {
      commandName = "track";
      args = ["track", ...(scenario ? [scenario] : [])];
      ctx = buildTrackContext(options);
    } else if (options.script) {
      commandName = "script";
      args = ["script", ...(scenario ? [scenario] : [])];
      ctx = createDefaultScriptRouterContext(createCommandContext());
    } else if (options.all) {
      commandName = "run:all";
      args = ["run:all"];
      ctx = buildRunAllContext(options);
    } else if (scenario) {
      commandName = "run:single";
      args = ["run:single", scenario];
      ctx = buildRunSingleContext(options);
    } else {
      commandName = "run:default";
      args = ["run:default"];
      ctx = buildRunDefaultContext(options);
    }

    const command = registry.find(args);
    if (!command) {
      console.error(`Unknown command: ${commandName}`);
      return 1;
    }

    const globalOptions = toGlobalOptions(options);
    if (!command.validate(args, globalOptions)) {
      console.error(`Invalid arguments for ${commandName}`);
      return 1;
    }

    return await command.execute(args, globalOptions, ctx);
  } catch (error) {
    if (options.verbose) {
      console.error(error);
    } else {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
    return 1;
  }
}
```

### Step 4 (Optional): Add command aliases

The registry currently does exact name matching. Commands like `RunSingleCommand` have name `"run:single"` but the CLI dispatches by scenario name, not by command name prefix.

Two approaches:

1. **Keep current dispatch logic** — the CLI still decides which command to run based on options/flags; the registry is just for lookup. The `find()` method matches by command name, not by scenario name.
2. **Use subcommand routing** — make registry support multi-level lookup (e.g., `find(["run", "onboarding"])` → `RunSingleCommand`).

For Phase 6, approach 1 is simpler and doesn't change the user-facing CLI interface at all. The registry is used purely for resolving the right command instance after the CLI already knows what the user wants.

### Even simpler: Keep CLI dispatch logic, just use registry for command instances

```ts
export async function runCli(): Promise<number> {
  const { scenario, options } = parseArgs();
  setupSignalHandlers();

  const registry = createDefaultRegistry();
  const globalOptions = toGlobalOptions(options);

  const resolveAndRun = async (commandName: string, args: string[], ctx: CommandContext) => {
    const cmd = registry.find(args);
    if (!cmd) throw new Error(`Command not found: ${commandName}`);
    if (!cmd.validate(args, globalOptions)) throw new Error(`Invalid args for ${commandName}`);
    return cmd.execute(args, globalOptions, ctx);
  };

  try {
    if (options.help) {
      showHelp();
      return 0;
    }
    if (options.init) {
      return resolveAndRun("init", ["init"], createCommandContext());
    }
    if (options.track) {
      return resolveAndRun("track", ["track"], buildTrackContext(options));
    }
    if (options.script) {
      return resolveAndRun(
        "script",
        ["script", ...(scenario ? [scenario] : [])],
        createDefaultScriptRouterContext(createCommandContext()),
      );
    }
    if (options.all) {
      return resolveAndRun("run:all", ["run:all"], buildRunAllContext(options));
    }
    if (scenario) {
      return resolveAndRun("run:single", ["run:single", scenario], buildRunSingleContext(options));
    }
    return resolveAndRun("run:default", ["run:default"], buildRunDefaultContext(options));
  } catch (error) {
    // ... error handling
  }
}
```

This is the minimum viable change: every command flows through `registry.find()` + `command.execute()`, removing all direct `new Command()` calls.

## Files to Modify

### `src/cli.ts`

- Add `createDefaultRegistry()` function
- Add context builder functions
- Replace `runCli()` body to use registry dispatch
- Remove direct `new InitCommand()`, `new TrackCommand()`, `new RunAllCommand()`, `new RunSingleCommand()`, `new RunDefaultCommand()` — all go through registry

### `src/commands/registry.ts`

Optionally enhance `find()` to support multi-word commands:

```ts
find(args: string[]): Command | null {
  // Try exact match on first arg
  if (this.commands.has(args[0])) return this.commands.get(args[0])!

  // Try "prefix:rest" pattern for subcommands
  for (let i = 1; i <= args.length; i++) {
    const candidate = args.slice(0, i).join(":")
    if (this.commands.has(candidate)) return this.commands.get(candidate)!
  }

  return null
}
```

This allows `find(["run", "onboarding"])` to match `RunSingleCommand` (name `"run:single"`).

### `src/commands/registry.ts` — `createDefaultRegistry()`

The existing `createDefaultRegistry()` is empty. Populate it:

```ts
export function createDefaultRegistry(): CommandRegistry {
  const registry = new CommandRegistry();
  registry.register(new InitCommand());
  registry.register(new TrackCommand());
  registry.register(new RunAllCommand());
  registry.register(new RunSingleCommand());
  registry.register(new RunDefaultCommand());
  // Script commands are registered internally by ScriptRouterCommand
  return registry;
}
```

But wait — `createDefaultRegistry()` in `registry.ts` can't import command classes without creating circular dependencies (commands import types from registry's module). So keep `createDefaultRegistry()` in `cli.ts` where the imports already exist.

## Files NOT to Modify

- `src/commands/*` — All command implementations stay the same
- `src/index.ts` — Already refactored in Phase 5
- Test files — All tests pass as-is (tests use mock contexts, not the real CLI)

## Verification

```bash
pnpm lint
pnpm test test/cli.test.ts test/commands/**/*.test.ts
pnpm build
```

Key test files:

- `test/cli.test.ts` — CLI parsing + dispatch tests
- `test/commands/run/single.test.ts` — RunSingleCommand tests
- `test/commands/run/all.test.ts` — RunAllCommand tests
- `test/commands/run/default.test.ts` — RunDefaultCommand tests
- `test/commands/registry.test.ts` — Registry tests
- `test/commands/track.test.ts` — TrackCommand tests

## Dependencies

- Phase 5 (new `generate()` pipeline — RunSingleCommand calls `generate()`)

## Result

After Phase 6:

- Every CLI operation flows through `CommandRegistry.find()` → `command.execute()`
- No direct `new Command()` in `cli.ts`
- Contexts are built by factory functions (testable, injectable)
- CLI is thin: parse args, build context, dispatch to registry, handle errors
