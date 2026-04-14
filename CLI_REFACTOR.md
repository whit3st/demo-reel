# CLI Refactoring Plan: Command Pattern

## Status: **In Progress** 🚧

- **Phase 1** (Init Command): ✅ Complete
- **Phase 2** (Script Commands): ⏳ Planned
- **Phase 3** (Run Commands): ⏳ Planned
- **Phase 4** (Cleanup & Finalize): ⏳ Planned

---

## 1. Problem Statement

### Current State

The CLI code in `src/cli.ts` has grown to ~485 lines with multiple responsibilities:

- **Argument parsing** (150+ lines of manual flag handling)
- **Command routing** (complex if/else and switch statements)
- **Business logic** (init, script commands, scenario execution)
- **Error handling** (scattered try/catch blocks)
- **Side effects** (file system, browser control, console output)

### Issues

1. **High Complexity**: `runCli()` function has 4+ levels of nesting
2. **Tight Coupling**: Business logic directly calls `runVideoScenario`, `scriptGenerate`, etc.
3. **Difficult Testing**: Requires extensive mocking of dependencies
4. **Low Coverage**: `cli.ts` at 60% coverage due to complex branching
5. **Code Duplication**: Similar patterns repeated across command handlers

### Code Smells

```typescript
// Big switch statement - hard to test each case independently
switch (subcommandOrDescription) {
  case "generate": {
    /* 20 lines */
  }
  case "voice": {
    /* 15 lines */
  }
  case "build": {
    /* 15 lines */
  }
  // ... more cases
}

// Deep nesting in runCli()
if (options.help) {
} else if (options.init) {
} else if (options.script) {
} else if (options.all) {
} else if (scenario) {
} else {
}
```

---

## 2. Proposed Solution: Command Pattern

### Design Overview

Separate CLI into three distinct layers:

```
┌─────────────────────────────────────┐
│  Presentation Layer (cli.ts)        │  ← Thin, just wiring
│  - Parse arguments                  │  - Delegate to commands
│  - Route to commands                │  - Handle top-level errors
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Command Layer (commands/)          │  ← Business logic
│  - InitCommand                      │  - Validate inputs
│  - ScriptGenerateCommand            │  - Orchestrate operations
│  - ScriptVoiceCommand               │  - Return exit codes
│  - RunCommand                       │
│  - ...                              │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Service Layer (injected)           │  ← Dependencies
│  - FileSystem (fs/promises)         │  - Easy to mock
│  - VideoHandler                     │  - Swappable implementations
│  - ScriptCommands                   │
│  - Logger                           │
└─────────────────────────────────────┘
```

### Key Interfaces

```typescript
// commands/types.ts
interface Command {
  readonly name: string;
  validate(args: string[], options: GlobalOptions): boolean;
  execute(args: string[], options: GlobalOptions, ctx: CommandContext): Promise<number>;
}

interface CommandContext {
  fs: { writeFile: WriteFile };
  cwd: () => string;
  console: { log: (msg: string) => void; error: (msg: string) => void };
}
```

### Benefits

1. **Single Responsibility**: Each command handles one thing
2. **Testability**: Dependencies injected, easy to mock
3. **Extensibility**: New commands just implement `Command` interface
4. **Composability**: Commands can call other commands via context
5. **Type Safety**: Full TypeScript support

---

## 3. Migration Plan

### Phase 1: Foundation ✅ (COMPLETE)

**Goal**: Establish the pattern with simplest command

- [x] Create `src/commands/` directory structure
- [x] Define `Command` interface and `CommandContext`
- [x] Implement `InitCommand`
- [x] Create `CommandRegistry` for routing
- [x] Refactor `cli.ts` to use Command Pattern for `init`
- [x] Write tests for `InitCommand` (achieved 100% coverage)

**Files Created**:

- `src/commands/types.ts`
- `src/commands/registry.ts`
- `src/commands/init.ts`
- `src/commands/index.ts`
- `test/commands/init.test.ts`
- `src/interfaces.ts`

**Commit**: `f46f47f`

### Phase 2: Script Commands ⏳

**Goal**: Extract all script subcommands

- [x] Create `ScriptGenerateCommand` ✅ **COMPLETE**
  - Move logic from `handleScriptCommand` case "generate"
  - Extract argument parsing (description, url, hints)
  - Write tests (12 tests, 100% coverage)
- [ ] Create `ScriptVoiceCommand`
  - Handle voice generation logic
  - Test with mocked TTS service
- [x] Create `ScriptBuildCommand` ✅ **COMPLETE**
  - Handle script building logic
- [x] Create `ScriptValidateCommand` ✅ **COMPLETE**
  - Handle validation logic
- [x] Create `ScriptFixCommand` ✅ **COMPLETE**
  - Handle fix logic
- [ ] Create `ScriptPipelineCommand`
  - Handle full pipeline (default case)
  - May delegate to other commands

**Expected Result**: `handleScriptCommand()` becomes a simple router

### Phase 3: Run Commands ⏳

**Goal**: Extract scenario execution logic

- [ ] Create `RunAllCommand` (`--all` flag)
  - Handle finding all scenario files
  - Tag filtering logic
  - Loop through files
- [ ] Create `RunSingleCommand` (specific scenario)
  - Handle file path resolution
  - Tag validation
- [ ] Create `RunDefaultCommand` (no args)
  - Find and run all scenarios
  - Error if none found

**Expected Result**: `runCli()` becomes ~50 lines of routing code

### Phase 4: Cleanup & Finalize ⏳

**Goal**: Polish and remove old code

- [ ] Remove old `EXAMPLE_SCENARIO` constant from `cli.ts`
- [ ] Remove old `handleScriptCommand()` function
- [ ] Extract remaining helper functions (if any)
- [ ] Add integration tests for command routing
- [ ] Update documentation
- [ ] Achieve 90%+ coverage on `cli.ts`

**Expected Result**:

- `cli.ts`: ~100 lines (down from ~485)
- All commands in `src/commands/`
- Each command has dedicated test file

---

## 4. Testing Strategy

### Unit Tests (Per Command)

Each command gets its own test file:

```typescript
// test/commands/generate.test.ts
describe("ScriptGenerateCommand", () => {
  it("validates required url option", () => {
    const cmd = new ScriptGenerateCommand();
    expect(cmd.validate([], { scriptUrl: undefined })).toBe(false);
    expect(cmd.validate(["desc"], { scriptUrl: "https://example.com" })).toBe(true);
  });

  it("calls script service with correct params", async () => {
    const ctx = createMockContext();
    const cmd = new ScriptGenerateCommand();

    await cmd.execute(["desc"], { scriptUrl: "url" }, ctx);

    expect(ctx.scriptCommands.generate).toHaveBeenCalledWith("desc", "url", expect.any(Object));
  });
});
```

### Integration Tests (CLI Router)

Test the routing logic in `cli.ts`:

```typescript
// test/cli-routing.test.ts
describe("CLI Routing", () => {
  it("routes 'init' to InitCommand", async () => {
    const registry = new CommandRegistry();
    registry.register(new InitCommand());

    const result = await routeCommand(registry, ["init"], {});

    expect(result).toBe(0);
  });
});
```

### Mock Strategy

```typescript
// Minimal, focused mocks
const createMockContext = () => ({
  fs: { writeFile: vi.fn() },
  cwd: () => "/test",
  console: { log: vi.fn(), error: vi.fn() },
  scriptCommands: {
    generate: vi.fn(),
    voice: vi.fn(),
    // ...
  },
});
```

---

## 5. Current Progress

### Completed ✅

- **Foundation**: Command interfaces and registry
- **InitCommand**: 100% coverage, fully tested
- **Integration**: `cli.ts` uses Command Pattern for `init`

### Commands To Migrate

| Command         | Current Location      | Complexity | Priority | Status            |
| --------------- | --------------------- | ---------- | -------- | ----------------- |
| init            | ✅ Migrated           | Low        | Done     | **100% coverage** |
| script generate | ✅ Migrated           | Medium     | High     | **100% coverage** |
| script voice    | `handleScriptCommand` | Medium     | High     | Pending           |
| script build    | ✅ Migrated           | Medium     | Medium   | **100% coverage** |
| script validate | ✅ Migrated           | Medium     | Medium   | **100% coverage** |
| script fix      | ✅ Migrated           | Medium     | Low      | **100% coverage** |
| script pipeline | `handleScriptCommand` | High       | Medium   |
| run all         | `runCli`              | High       | High     |
| run single      | `runCli`              | Medium     | High     |

### Coverage Targets

| File             | Current | Target |
| ---------------- | ------- | ------ |
| cli.ts           | 60%     | 90%+   |
| commands/init.ts | 100% ✅ | 100%   |
| commands/\*.ts   | N/A     | 90%+   |

---

## 6. Decision Log

### Decisions Made

1. **Use interfaces for dependencies** (not classes)
   - Keeps implementation flexible
   - Easy to mock for testing
   - No need for DI framework

2. **Keep CommandContext simple**
   - Just 3 properties: fs, cwd, console
   - Additional services injected per-command

3. **Return exit codes from execute()**
   - Commands return `Promise<number>`
   - 0 = success, 1+ = error
   - Consistent with CLI conventions

4. **Validate separately from execute**
   - `validate()` checks if args are valid
   - `execute()` assumes valid args
   - Allows for early error messages

### Open Questions

1. Should we use a proper CLI framework (Commander.js) for argument parsing?
   - **Current**: Keep manual parsing, just organize better
   - **Alternative**: Migrate to Commander.js in Phase 4

2. Should commands be able to call other commands?
   - **Current**: Yes, via CommandContext
   - **Example**: Pipeline command calls generate + voice + build

3. How to handle shared state (browser cleanup, signal handlers)?
   - **Current**: Keep in cli.ts, pass to commands that need it
   - **Alternative**: Create a Lifecycle service

---

## 7. References

### Design Patterns

- **Command Pattern**: Gang of Four Design Patterns
- **Dependency Injection**: Martin Fowler's articles
- **Ports and Adapters**: Hexagonal Architecture

### Code Examples

See:

- `src/commands/init.ts` - Reference implementation
- `test/commands/init.test.ts` - Testing example
- `src/cli.ts` lines 387-398 - Integration example

### Related Files

- `src/script/cli.ts` - Script command implementations (to be wrapped)
- `src/config-loader.ts` - Configuration loading (dependency)
- `src/video-handler.ts` - Video recording (dependency)

---

## 8. Development Workflow

### Pre-commit Checklist

Before committing any changes to the CLI or commands:

```bash
# 1. Run formatter
pnpm format

# 2. Run linter
pnpm lint

# 3. Run tests
pnpm test

# 4. Only then commit
git add -A
git commit -m "..."
```

**Note**: CI will fail if formatting or linting issues exist. Running these locally prevents broken builds.

---

## 9. Next Steps

### Immediate (Next Session)

1. ~~Extract `ScriptGenerateCommand` from `handleScriptCommand`~~ ✅ Done
2. ~~Write tests for `ScriptGenerateCommand`~~ ✅ Done
3. ~~Update `cli.ts` to route script generate through Command Pattern~~ ✅ Done

### Short Term (This Week)

1. Extract remaining script subcommands (voice, build, validate, fix)
2. Achieve 90%+ coverage on all script commands
3. Simplify `handleScriptCommand` to a router

### Long Term (This Month)

1. Extract run commands
2. Achieve 90%+ coverage on `cli.ts`
3. Document the new architecture

---

## Appendix A: File Structure (Target)

```
src/
  commands/
    types.ts              # Command interfaces
    registry.ts           # Command routing
    init.ts               # Init command
    script/
      generate.ts         # Script generate command
      voice.ts            # Script voice command
      build.ts            # Script build command
      validate.ts         # Script validate command
      fix.ts              # Script fix command
      pipeline.ts         # Full pipeline command
    run/
      all.ts              # Run all scenarios
      single.ts           # Run single scenario
  cli.ts                  # Thin CLI router (~100 lines)
test/
  commands/
    init.test.ts          # Init command tests
    script/
      generate.test.ts    # Script command tests
      ...
```

## Appendix B: Before/After Comparison

### Before (Current)

```typescript
// src/cli.ts ~485 lines
export async function runCli(): Promise<number> {
  const { scenario, options } = parseArgs();
  // ... 100+ lines of routing logic

  if (options.init) {
    const demoPath = join(process.cwd(), "example.demo.ts");
    await writeFile(demoPath, EXAMPLE_SCENARIO, "utf-8");
    console.log(`Created ${demoPath}`);
    return 0;
  }

  if (options.script) {
    return await handleScriptCommand(scenario, options);
  }
  // ... more conditions
}
```

### After (Target)

```typescript
// src/cli.ts ~50 lines
export async function runCli(): Promise<number> {
  const { args, options } = parseArgs();
  const registry = createCommandRegistry();
  const command = registry.find(args);

  if (!command || !command.validate(args, options)) {
    showHelp();
    return 1;
  }

  const ctx = createCommandContext();
  return await command.execute(args, options, ctx);
}
```

---

**Last Updated**: After Phase 1 completion  
**Author**: OpenCode Agent  
**Branch**: `refactor/command-pattern-for-cli`
