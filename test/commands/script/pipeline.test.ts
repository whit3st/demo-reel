import { describe, expect, it, vi } from "vitest";
import {
  ScriptPipelineCommand,
  type ScriptPipelineCommandContext,
} from "../../../src/commands/script/pipeline.js";
import type { GlobalOptions } from "../../../src/commands/types.js";

function createMockContext(
  overrides: Partial<ScriptPipelineCommandContext> = {},
): ScriptPipelineCommandContext {
  return {
    fs: {
      writeFile: vi.fn().mockResolvedValue(undefined),
    },
    cwd: vi.fn().mockReturnValue("/workspace/project"),
    console: {
      log: vi.fn(),
      error: vi.fn(),
    },
    resolveVoiceConfig: vi.fn().mockReturnValue({
      provider: "openai",
      voice: "alloy",
      speed: 1.0,
    }),
    scriptCommands: {
      pipeline: vi.fn().mockResolvedValue("demo.demo.ts"),
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

describe("ScriptPipelineCommand", () => {
  describe("validation", () => {
    it("validates when description and URL are provided", () => {
      const cmd = new ScriptPipelineCommand();

      expect(
        cmd.validate(["show signup"], createGlobalOptions({ scriptUrl: "https://example.com" })),
      ).toBe(true);
    });

    it("rejects when description is missing", () => {
      const cmd = new ScriptPipelineCommand();

      expect(cmd.validate([], createGlobalOptions({ scriptUrl: "https://example.com" }))).toBe(
        false,
      );
    });

    it("rejects when URL is missing", () => {
      const cmd = new ScriptPipelineCommand();

      expect(cmd.validate(["show signup"], createGlobalOptions())).toBe(false);
    });
  });

  describe("execution", () => {
    it("calls pipeline with description, URL, and defaults", async () => {
      const cmd = new ScriptPipelineCommand();
      const ctx = createMockContext();
      const options = createGlobalOptions({ scriptUrl: "https://example.com" });

      const exitCode = await cmd.execute(["show signup"], options, ctx);

      expect(exitCode).toBe(0);
      expect(ctx.resolveVoiceConfig).toHaveBeenCalledWith({
        provider: "openai",
        voice: "alloy",
        speed: 1.0,
      });
      expect(ctx.scriptCommands.pipeline).toHaveBeenCalledWith(
        "show signup",
        "https://example.com",
        expect.objectContaining({
          output: undefined,
          hints: undefined,
          resolution: undefined,
          format: undefined,
        }),
      );
    });

    it("passes custom voice, speed, and pipeline options", async () => {
      const cmd = new ScriptPipelineCommand();
      const ctx = createMockContext();
      const options = createGlobalOptions({
        scriptUrl: "https://example.com",
        scriptVoice: "nova",
        scriptSpeed: 1.4,
        scriptOutput: "landing",
        scriptHints: ["focus CTA"],
        resolution: "FHD",
        format: "webm",
        verbose: true,
        headed: true,
        noCache: true,
      });

      await cmd.execute(["show signup"], options, ctx);

      expect(ctx.resolveVoiceConfig).toHaveBeenCalledWith({
        provider: "openai",
        voice: "nova",
        speed: 1.4,
      });
      expect(ctx.scriptCommands.pipeline).toHaveBeenCalledWith(
        "show signup",
        "https://example.com",
        expect.objectContaining({
          output: "landing",
          hints: ["focus CTA"],
          resolution: "FHD",
          format: "webm",
          verbose: true,
          headed: true,
          noCache: true,
        }),
      );
    });
  });
});
