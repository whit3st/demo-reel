import { describe, expect, it, vi } from "vitest";
import {
  ScriptBuildCommand,
  type ScriptBuildFn,
  type ScriptBuildCommandContext,
} from "../../../src/commands/script/build.js";
import type { GlobalOptions } from "../../../src/commands/types.js";

function createMockContext(
  overrides: Partial<ScriptBuildCommandContext> = {},
): ScriptBuildCommandContext {
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

describe("ScriptBuildCommand", () => {
  describe("validation", () => {
    it("validates when script path is provided", () => {
      const cmd = new ScriptBuildCommand();

      expect(cmd.validate(["demo.script.json"], createGlobalOptions())).toBe(true);
    });

    it("rejects when script path is missing", () => {
      const cmd = new ScriptBuildCommand();

      expect(cmd.validate([], createGlobalOptions())).toBe(false);
    });

    it("rejects when script path is empty", () => {
      const cmd = new ScriptBuildCommand();

      expect(cmd.validate([""], createGlobalOptions())).toBe(false);
    });
  });

  describe("execution", () => {
    it("calls script build and returns success", async () => {
      const buildScript: ScriptBuildFn = vi.fn().mockResolvedValue("demo.demo.ts");
      const cmd = new ScriptBuildCommand(buildScript);
      const ctx = createMockContext();
      const options = createGlobalOptions();

      const exitCode = await cmd.execute(["demo.script.json"], options, ctx);

      expect(exitCode).toBe(0);
      expect(buildScript).toHaveBeenCalledWith(
        "demo.script.json",
        expect.objectContaining({
          verbose: false,
          headed: undefined,
          noCache: undefined,
          resolution: undefined,
          format: undefined,
        }),
      );
    });

    it("passes verbose option", async () => {
      const buildScript: ScriptBuildFn = vi.fn().mockResolvedValue("demo.demo.ts");
      const cmd = new ScriptBuildCommand(buildScript);
      const ctx = createMockContext();
      const options = createGlobalOptions({ verbose: true });

      await cmd.execute(["demo.script.json"], options, ctx);

      expect(buildScript).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ verbose: true }),
      );
    });

    it("passes resolution and format options", async () => {
      const buildScript: ScriptBuildFn = vi.fn().mockResolvedValue("demo.demo.ts");
      const cmd = new ScriptBuildCommand(buildScript);
      const ctx = createMockContext();
      const options = createGlobalOptions({ resolution: "FHD", format: "webm" });

      await cmd.execute(["demo.script.json"], options, ctx);

      expect(buildScript).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ resolution: "FHD", format: "webm" }),
      );
    });
  });
});
