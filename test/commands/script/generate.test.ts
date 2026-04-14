import { describe, expect, it, vi } from "vitest";
import {
  ScriptGenerateCommand,
  type ScriptGenerateCommandContext,
} from "../../../src/commands/script/generate.js";
import type { GlobalOptions } from "../../../src/commands/types.js";

function createMockContext(
  overrides: Partial<ScriptGenerateCommandContext> = {},
): ScriptGenerateCommandContext {
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
      generate: vi.fn().mockResolvedValue("demo.script.json"),
    },
    getArgs: () => ["node", "cli", "script", "generate", "test description"],
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

describe("ScriptGenerateCommand", () => {
  describe("validation", () => {
    it("validates when description and URL are provided", () => {
      const cmd = new ScriptGenerateCommand();
      const options = createGlobalOptions({ scriptUrl: "https://example.com" });

      expect(cmd.validate(["test description"], options)).toBe(true);
    });

    it("rejects when description is missing", () => {
      const cmd = new ScriptGenerateCommand();
      const options = createGlobalOptions({ scriptUrl: "https://example.com" });

      expect(cmd.validate([], options)).toBe(false);
    });

    it("rejects when URL is missing", () => {
      const cmd = new ScriptGenerateCommand();
      const options = createGlobalOptions();

      expect(cmd.validate(["test description"], options)).toBe(false);
    });

    it("rejects when URL is empty string", () => {
      const cmd = new ScriptGenerateCommand();
      const options = createGlobalOptions({ scriptUrl: "" });

      expect(cmd.validate(["test description"], options)).toBe(false);
    });
  });

  describe("execution", () => {
    it("calls scriptGenerate with description and URL", async () => {
      const cmd = new ScriptGenerateCommand();
      const ctx = createMockContext();
      const options = createGlobalOptions({ scriptUrl: "https://example.com" });

      const exitCode = await cmd.execute(["test description"], options, ctx);

      expect(exitCode).toBe(0);
      expect(ctx.scriptCommands.generate).toHaveBeenCalledWith(
        "test description",
        "https://example.com",
        "demo",
        expect.any(Object),
      );
    });

    it("uses custom output name when provided", async () => {
      const cmd = new ScriptGenerateCommand();
      const ctx = createMockContext();
      const options = createGlobalOptions({
        scriptUrl: "https://example.com",
        scriptOutput: "my-demo",
      });

      await cmd.execute(["test description"], options, ctx);

      expect(ctx.scriptCommands.generate).toHaveBeenCalledWith(
        "test description",
        "https://example.com",
        "my-demo",
        expect.any(Object),
      );
    });

    it("passes verbose option", async () => {
      const cmd = new ScriptGenerateCommand();
      const ctx = createMockContext();
      const options = createGlobalOptions({
        scriptUrl: "https://example.com",
        verbose: true,
      });

      await cmd.execute(["test description"], options, ctx);

      expect(ctx.scriptCommands.generate).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ verbose: true }),
      );
    });

    it("passes headed option", async () => {
      const cmd = new ScriptGenerateCommand();
      const ctx = createMockContext();
      const options = createGlobalOptions({
        scriptUrl: "https://example.com",
        headed: true,
      });

      await cmd.execute(["test description"], options, ctx);

      expect(ctx.scriptCommands.generate).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ headed: true }),
      );
    });

    it("passes hints when provided", async () => {
      const cmd = new ScriptGenerateCommand();
      const ctx = createMockContext();
      const options = createGlobalOptions({
        scriptUrl: "https://example.com",
        scriptHints: ["hint1", "hint2"],
      });

      await cmd.execute(["test description"], options, ctx);

      expect(ctx.scriptCommands.generate).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ hints: ["hint1", "hint2"] }),
      );
    });

    it("passes noCache option", async () => {
      const cmd = new ScriptGenerateCommand();
      const ctx = createMockContext();
      const options = createGlobalOptions({
        scriptUrl: "https://example.com",
        noCache: true,
      });

      await cmd.execute(["test description"], options, ctx);

      expect(ctx.scriptCommands.generate).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ noCache: true }),
      );
    });

    it("handles special characters in description", async () => {
      const cmd = new ScriptGenerateCommand();
      const ctx = createMockContext();
      const options = createGlobalOptions({ scriptUrl: "https://example.com" });
      const description = "Test \"quotes\" and 'apostrophes'";

      const exitCode = await cmd.execute([description], options, ctx);

      expect(exitCode).toBe(0);
      expect(ctx.scriptCommands.generate).toHaveBeenCalledWith(
        description,
        expect.any(String),
        expect.any(String),
        expect.any(Object),
      );
    });

    it("handles URL with query parameters", async () => {
      const cmd = new ScriptGenerateCommand();
      const ctx = createMockContext();
      const url = "https://example.com?token=abc&user=123";
      const options = createGlobalOptions({ scriptUrl: url });

      await cmd.execute(["test"], options, ctx);

      expect(ctx.scriptCommands.generate).toHaveBeenCalledWith(
        expect.any(String),
        url,
        expect.any(String),
        expect.any(Object),
      );
    });
  });
});
