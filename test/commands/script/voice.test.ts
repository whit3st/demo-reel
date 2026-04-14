import { describe, expect, it, vi } from "vitest";
import {
  ScriptVoiceCommand,
  type ScriptVoiceCommandContext,
} from "../../../src/commands/script/voice.js";
import type { GlobalOptions } from "../../../src/commands/types.js";

function createMockContext(
  overrides: Partial<ScriptVoiceCommandContext> = {},
): ScriptVoiceCommandContext {
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
      voice: vi.fn().mockResolvedValue("demo-narration.mp3"),
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

describe("ScriptVoiceCommand", () => {
  describe("validation", () => {
    it("validates when script path is provided", () => {
      const cmd = new ScriptVoiceCommand();

      expect(cmd.validate(["demo.script.json"], createGlobalOptions())).toBe(true);
    });

    it("rejects when script path is missing", () => {
      const cmd = new ScriptVoiceCommand();

      expect(cmd.validate([], createGlobalOptions())).toBe(false);
    });

    it("rejects when script path is empty", () => {
      const cmd = new ScriptVoiceCommand();

      expect(cmd.validate([""], createGlobalOptions())).toBe(false);
    });
  });

  describe("execution", () => {
    it("calls resolveVoiceConfig with defaults", async () => {
      const cmd = new ScriptVoiceCommand();
      const ctx = createMockContext();

      const exitCode = await cmd.execute(["demo.script.json"], createGlobalOptions(), ctx);

      expect(exitCode).toBe(0);
      expect(ctx.resolveVoiceConfig).toHaveBeenCalledWith({
        provider: "openai",
        voice: "alloy",
        speed: 1.0,
      });
    });

    it("uses custom voice and speed when provided", async () => {
      const cmd = new ScriptVoiceCommand();
      const ctx = createMockContext();
      const options = createGlobalOptions({ scriptVoice: "nova", scriptSpeed: 1.3 });

      await cmd.execute(["demo.script.json"], options, ctx);

      expect(ctx.resolveVoiceConfig).toHaveBeenCalledWith({
        provider: "openai",
        voice: "nova",
        speed: 1.3,
      });
    });

    it("calls script voice with resolved voice and options", async () => {
      const cmd = new ScriptVoiceCommand();
      const ctx = createMockContext();
      const options = createGlobalOptions({ verbose: true, headed: true, noCache: true });

      await cmd.execute(["demo.script.json"], options, ctx);

      expect(ctx.scriptCommands.voice).toHaveBeenCalledWith(
        "demo.script.json",
        expect.any(Object),
        expect.objectContaining({ verbose: true, headed: true, noCache: true }),
      );
    });
  });
});
