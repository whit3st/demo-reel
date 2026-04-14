import { describe, expect, it, vi } from "vitest";
import {
  RunSingleCommand,
  type RunSingleCommandContext,
} from "../../../src/commands/run/single.js";
import type { GlobalOptions } from "../../../src/commands/types.js";

function createMockContext(
  overrides: Partial<RunSingleCommandContext> = {},
): RunSingleCommandContext {
  return {
    fs: {
      writeFile: vi.fn().mockResolvedValue(undefined),
    },
    cwd: vi.fn().mockReturnValue("/workspace/project"),
    console: {
      log: vi.fn(),
      error: vi.fn(),
    },
    resolvePath: vi.fn((value: string) => `/abs/${value}`),
    pathExists: vi.fn().mockResolvedValue(false),
    loadScenario: vi.fn().mockResolvedValue("/abs/onboarding.demo.ts"),
    loadConfig: vi.fn().mockResolvedValue({ config: { tags: ["smoke"] } }),
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

describe("RunSingleCommand", () => {
  describe("validation", () => {
    it("validates one scenario argument", () => {
      const cmd = new RunSingleCommand();

      expect(cmd.validate(["onboarding"], createGlobalOptions())).toBe(true);
      expect(cmd.validate([], createGlobalOptions())).toBe(false);
      expect(cmd.validate(["onboarding", "extra"], createGlobalOptions())).toBe(false);
    });
  });

  describe("execution", () => {
    it("uses direct file path when extension present and file exists", async () => {
      const cmd = new RunSingleCommand();
      const ctx = createMockContext({
        pathExists: vi.fn().mockResolvedValue(true),
        loadScenario: vi.fn().mockResolvedValue(null),
      });

      const exitCode = await cmd.execute(["flow.demo.ts"], createGlobalOptions(), ctx);

      expect(exitCode).toBe(0);
      expect(ctx.resolvePath).toHaveBeenCalledWith("flow.demo.ts");
      expect(ctx.loadConfig).toHaveBeenCalledWith("/abs/flow.demo.ts", undefined);
      expect(ctx.loadScenario).not.toHaveBeenCalled();
      expect(ctx.runScenario).toHaveBeenCalledTimes(1);
    });

    it("falls back to named scenario lookup", async () => {
      const cmd = new RunSingleCommand();
      const ctx = createMockContext();

      const exitCode = await cmd.execute(["onboarding"], createGlobalOptions(), ctx);

      expect(exitCode).toBe(0);
      expect(ctx.loadScenario).toHaveBeenCalledWith("onboarding");
      expect(ctx.loadConfig).toHaveBeenCalledWith("/abs/onboarding.demo.ts", undefined);
    });

    it("returns error when scenario cannot be resolved", async () => {
      const cmd = new RunSingleCommand();
      const ctx = createMockContext({
        loadScenario: vi.fn().mockResolvedValue(null),
      });

      const exitCode = await cmd.execute(["missing"], createGlobalOptions(), ctx);

      expect(exitCode).toBe(1);
      expect(ctx.console.error).toHaveBeenCalledWith("Scenario not found: missing");
      expect(ctx.console.error).toHaveBeenCalledWith("Looked for:");
      expect(ctx.console.error).toHaveBeenCalledWith("  - missing.demo.ts");
      expect(ctx.console.error).toHaveBeenCalledWith("  - missing.config.ts");
    });

    it("returns error when tags do not match", async () => {
      const cmd = new RunSingleCommand();
      const ctx = createMockContext({
        loadConfig: vi.fn().mockResolvedValue({ config: { tags: ["regression"] } }),
      });

      const exitCode = await cmd.execute(
        ["onboarding"],
        createGlobalOptions({ tags: ["smoke"] }),
        ctx,
      );

      expect(exitCode).toBe(1);
      expect(ctx.console.error).toHaveBeenCalledWith("Scenario does not match tags: smoke");
      expect(ctx.runScenario).not.toHaveBeenCalled();
    });

    it("passes outputDir into loadConfig", async () => {
      const cmd = new RunSingleCommand();
      const ctx = createMockContext();

      await cmd.execute(["onboarding"], createGlobalOptions({ outputDir: "./videos" }), ctx);

      expect(ctx.loadConfig).toHaveBeenCalledWith("/abs/onboarding.demo.ts", "./videos");
    });
  });
});
