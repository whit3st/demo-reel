import { describe, expect, it, vi } from "vitest";
import {
  ScriptValidateCommand,
  type ScriptValidateFn,
  type ScriptValidateCommandContext,
} from "../../../src/commands/script/validate.js";
import type { GlobalOptions } from "../../../src/commands/types.js";

function createMockContext(
  overrides: Partial<ScriptValidateCommandContext> = {},
): ScriptValidateCommandContext {
  return {
    fs: {
      writeFile: vi.fn().mockResolvedValue(undefined),
    },
    cwd: vi.fn().mockReturnValue("/workspace/project"),
    console: {
      log: vi.fn(),
      error: vi.fn(),
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

describe("ScriptValidateCommand", () => {
  describe("validation", () => {
    it("validates when script path is provided", () => {
      const cmd = new ScriptValidateCommand();

      expect(cmd.validate(["demo.script.json"], createGlobalOptions())).toBe(true);
    });

    it("rejects when script path is missing", () => {
      const cmd = new ScriptValidateCommand();

      expect(cmd.validate([], createGlobalOptions())).toBe(false);
    });

    it("rejects when script path is empty", () => {
      const cmd = new ScriptValidateCommand();

      expect(cmd.validate([""], createGlobalOptions())).toBe(false);
    });
  });

  describe("execution", () => {
    it("returns success when script validates", async () => {
      const validateScript: ScriptValidateFn = vi.fn().mockResolvedValue(true);
      const cmd = new ScriptValidateCommand(validateScript);
      const ctx = createMockContext();

      const exitCode = await cmd.execute(["demo.script.json"], createGlobalOptions(), ctx);

      expect(exitCode).toBe(0);
    });

    it("returns error when script validation fails", async () => {
      const validateScript: ScriptValidateFn = vi.fn().mockResolvedValue(false);
      const cmd = new ScriptValidateCommand(validateScript);
      const ctx = createMockContext();

      const exitCode = await cmd.execute(["demo.script.json"], createGlobalOptions(), ctx);

      expect(exitCode).toBe(1);
    });

    it("passes verbose and headed options", async () => {
      const validateScript: ScriptValidateFn = vi.fn().mockResolvedValue(true);
      const cmd = new ScriptValidateCommand(validateScript);
      const ctx = createMockContext();

      await cmd.execute(
        ["demo.script.json"],
        createGlobalOptions({ verbose: true, headed: true }),
        ctx,
      );

      expect(validateScript).toHaveBeenCalledWith(
        "demo.script.json",
        expect.objectContaining({ verbose: true, headed: true }),
      );
    });
  });
});
