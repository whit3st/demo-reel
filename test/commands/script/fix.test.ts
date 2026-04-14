import { describe, expect, it, vi } from "vitest";
import {
  ScriptFixCommand,
  type ScriptFixCommandContext,
} from "../../../src/commands/script/fix.js";
import type { GlobalOptions } from "../../../src/commands/types.js";

function createMockContext(
  overrides: Partial<ScriptFixCommandContext> = {},
): ScriptFixCommandContext {
  return {
    fs: {
      writeFile: vi.fn().mockResolvedValue(undefined),
    },
    cwd: vi.fn().mockReturnValue("/workspace/project"),
    console: {
      log: vi.fn(),
      error: vi.fn(),
    },
    scriptCommands: {
      fix: vi.fn().mockResolvedValue(undefined),
    },
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

describe("ScriptFixCommand", () => {
  describe("validation", () => {
    it("validates when script path is provided", () => {
      const cmd = new ScriptFixCommand();

      expect(cmd.validate(["demo.script.json"], createGlobalOptions())).toBe(true);
    });

    it("rejects when script path is missing", () => {
      const cmd = new ScriptFixCommand();

      expect(cmd.validate([], createGlobalOptions())).toBe(false);
    });

    it("rejects when script path is empty", () => {
      const cmd = new ScriptFixCommand();

      expect(cmd.validate([""], createGlobalOptions())).toBe(false);
    });
  });

  describe("execution", () => {
    it("calls script fix and returns success", async () => {
      const cmd = new ScriptFixCommand();
      const ctx = createMockContext();
      const options = createGlobalOptions();

      const exitCode = await cmd.execute(["demo.script.json"], options, ctx);

      expect(exitCode).toBe(0);
      expect(ctx.scriptCommands.fix).toHaveBeenCalledWith(
        "demo.script.json",
        expect.objectContaining({ verbose: false, headed: undefined }),
      );
    });

    it("passes verbose option", async () => {
      const cmd = new ScriptFixCommand();
      const ctx = createMockContext();
      const options = createGlobalOptions({ verbose: true });

      await cmd.execute(["demo.script.json"], options, ctx);

      expect(ctx.scriptCommands.fix).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ verbose: true }),
      );
    });

    it("passes headed option", async () => {
      const cmd = new ScriptFixCommand();
      const ctx = createMockContext();
      const options = createGlobalOptions({ headed: true });

      await cmd.execute(["demo.script.json"], options, ctx);

      expect(ctx.scriptCommands.fix).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ headed: true }),
      );
    });
  });
});
