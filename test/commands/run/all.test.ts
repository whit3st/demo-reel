import { describe, expect, it, vi } from "vitest";
import { RunAllCommand, type RunAllCommandContext } from "../../../src/commands/run/all.js";
import type { GlobalOptions } from "../../../src/commands/types.js";

function createMockContext(overrides: Partial<RunAllCommandContext> = {}): RunAllCommandContext {
  return {
    fs: {
      writeFile: vi.fn().mockResolvedValue(undefined),
    },
    cwd: vi.fn().mockReturnValue("/workspace/project"),
    console: {
      log: vi.fn(),
      error: vi.fn(),
    },
    findScenarioFiles: vi.fn().mockResolvedValue(["a.demo.ts", "b.demo.ts"]),
    loadConfig: vi.fn(async (file: string) => ({
      config: {
        tags: file === "a.demo.ts" ? ["smoke"] : ["regression"],
      },
    })),
    runScenario: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createGlobalOptions(overrides: Partial<GlobalOptions> = {}): GlobalOptions {
  return {
    verbose: false,
    dryRun: false,
    ...overrides,
  };
}

describe("RunAllCommand", () => {
  it("always validates", () => {
    const cmd = new RunAllCommand();

    expect(cmd.validate([], createGlobalOptions())).toBe(true);
    expect(cmd.validate(["extra"], createGlobalOptions({ tags: ["smoke"] }))).toBe(true);
  });

  it("returns error when no scenario files found", async () => {
    const cmd = new RunAllCommand();
    const ctx = createMockContext({
      findScenarioFiles: vi.fn().mockResolvedValue([]),
    });

    const exitCode = await cmd.execute([], createGlobalOptions(), ctx);

    expect(exitCode).toBe(1);
    expect(ctx.console.error).toHaveBeenCalledWith("No *.demo.ts files found");
  });

  it("runs all scenarios when no tag filter", async () => {
    const cmd = new RunAllCommand();
    const ctx = createMockContext();

    const exitCode = await cmd.execute([], createGlobalOptions({ outputDir: "./videos" }), ctx);

    expect(exitCode).toBe(0);
    expect(ctx.loadConfig).toHaveBeenCalledWith("a.demo.ts", "./videos");
    expect(ctx.loadConfig).toHaveBeenCalledWith("b.demo.ts", "./videos");
    expect(ctx.runScenario).toHaveBeenCalledTimes(2);
  });

  it("filters by tags and runs only matching scenarios", async () => {
    const cmd = new RunAllCommand();
    const ctx = createMockContext();

    const exitCode = await cmd.execute([], createGlobalOptions({ tags: ["smoke"] }), ctx);

    expect(exitCode).toBe(0);
    expect(ctx.runScenario).toHaveBeenCalledTimes(1);
    expect(ctx.console.log).toHaveBeenCalledWith("Filtering by tags: smoke");
  });

  it("logs skipped tag mismatch when verbose", async () => {
    const cmd = new RunAllCommand();
    const ctx = createMockContext();

    await cmd.execute([], createGlobalOptions({ tags: ["smoke"], verbose: true }), ctx);

    expect(ctx.console.log).toHaveBeenCalledWith("  ↳ Skipped (tags)");
  });

  it("returns error when tag filter matches no scenarios", async () => {
    const cmd = new RunAllCommand();
    const ctx = createMockContext({
      loadConfig: vi.fn().mockResolvedValue({ config: { tags: ["other"] } }),
    });

    const exitCode = await cmd.execute([], createGlobalOptions({ tags: ["smoke"] }), ctx);

    expect(exitCode).toBe(1);
    expect(ctx.console.error).toHaveBeenCalledWith("No scenarios match tags: smoke");
  });

  it("skips scenarios with missing tags when filter set", async () => {
    const cmd = new RunAllCommand();
    const ctx = createMockContext({
      loadConfig: vi
        .fn()
        .mockResolvedValueOnce({ config: {} })
        .mockResolvedValueOnce({ config: { tags: ["smoke"] } }),
    });

    const exitCode = await cmd.execute([], createGlobalOptions({ tags: ["smoke"] }), ctx);

    expect(exitCode).toBe(0);
    expect(ctx.runScenario).toHaveBeenCalledTimes(1);
  });
});
