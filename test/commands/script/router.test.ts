import { describe, expect, it, vi } from "vitest";
import {
  ScriptRouterCommand,
  createDefaultScriptRouterContext,
  type ScriptRouterCommandContext,
} from "../../../src/commands/script/router.js";
import type { GlobalOptions } from "../../../src/commands/types.js";

function createGlobalOptions(overrides: Partial<GlobalOptions> = {}): GlobalOptions {
  return {
    verbose: false,
    dryRun: false,
    ...overrides,
  };
}

function createMockContext(
  overrides: Partial<ScriptRouterCommandContext> = {},
): ScriptRouterCommandContext {
  return {
    fs: {
      writeFile: vi.fn().mockResolvedValue(undefined),
    },
    cwd: vi.fn().mockReturnValue("/workspace/project"),
    console: {
      log: vi.fn(),
      error: vi.fn(),
    },
    getArgAfter: vi.fn((token: string) => {
      if (token === "generate") {
        return "show signup";
      }
      if (token === "script.json") {
        return "script.json";
      }
      return undefined;
    }),
    resolveVoiceConfig: vi.fn().mockReturnValue({
      provider: "openai",
      voice: "alloy",
      speed: 1,
    }),
    ...overrides,
  };
}

describe("ScriptRouterCommand", () => {
  it("validates only when subcommand or description exists", () => {
    const cmd = new ScriptRouterCommand();

    expect(cmd.validate(["generate"], createGlobalOptions())).toBe(true);
    expect(cmd.validate([], createGlobalOptions())).toBe(false);
  });

  it("routes generate and executes script generator", async () => {
    const executeGenerate = vi.fn().mockResolvedValue(0);
    const cmd = new ScriptRouterCommand({
      generate: {
        name: "script:generate",
        validate: vi.fn().mockReturnValue(true),
        execute: executeGenerate,
      },
      voice: {
        name: "script:voice",
        validate: vi.fn().mockReturnValue(true),
        execute: vi.fn().mockResolvedValue(0),
      },
      build: {
        name: "script:build",
        validate: vi.fn().mockReturnValue(true),
        execute: vi.fn().mockResolvedValue(0),
      },
      validate: {
        name: "script:validate",
        validate: vi.fn().mockReturnValue(true),
        execute: vi.fn().mockResolvedValue(0),
      },
      fix: {
        name: "script:fix",
        validate: vi.fn().mockReturnValue(true),
        execute: vi.fn().mockResolvedValue(0),
      },
      pipeline: {
        name: "script:pipeline",
        validate: vi.fn().mockReturnValue(true),
        execute: vi.fn().mockResolvedValue(0),
      },
    });
    const ctx = createMockContext({
      getArgAfter: vi.fn((token: string) => (token === "generate" ? "show signup" : undefined)),
    });

    const exitCode = await cmd.execute(
      ["generate"],
      createGlobalOptions({ scriptUrl: "https://example.com" }),
      ctx,
    );

    expect(exitCode).toBe(0);
    expect(executeGenerate).toHaveBeenCalledWith(
      ["show signup"],
      createGlobalOptions({ scriptUrl: "https://example.com" }),
      expect.objectContaining({ getArgAfter: expect.any(Function) }),
    );
  });

  it("returns usage error when generate missing description", async () => {
    const cmd = new ScriptRouterCommand();
    const ctx = createMockContext({
      getArgAfter: vi.fn().mockReturnValue(undefined),
    });

    const exitCode = await cmd.execute(
      ["generate"],
      createGlobalOptions({ scriptUrl: "https://example.com" }),
      ctx,
    );

    expect(exitCode).toBe(1);
    expect(ctx.console.error).toHaveBeenCalledWith(
      "Usage: demo-reel script generate <description> --url <url>",
    );
  });

  it("returns usage error when validate subcommand missing path", async () => {
    const cmd = new ScriptRouterCommand();
    const ctx = createMockContext({
      getArgAfter: vi.fn().mockReturnValue(undefined),
    });

    const exitCode = await cmd.execute(["validate"], createGlobalOptions(), ctx);

    expect(exitCode).toBe(1);
    expect(ctx.console.error).toHaveBeenCalledWith(
      "Usage: demo-reel script validate <script.json>",
    );
  });

  it("returns usage error for pipeline route when URL missing", async () => {
    const cmd = new ScriptRouterCommand();
    const ctx = createMockContext();

    const exitCode = await cmd.execute(["show signup"], createGlobalOptions(), ctx);

    expect(exitCode).toBe(1);
    expect(ctx.console.error).toHaveBeenCalledWith(
      "Usage: demo-reel script <description> --url <url>",
    );
    expect(ctx.console.error).toHaveBeenCalledWith(
      "Or use a subcommand: generate, voice, build, validate, fix",
    );
  });
});

describe("createDefaultScriptRouterContext", () => {
  it("returns arg after token and undefined when missing", () => {
    const base = {
      fs: {
        writeFile: vi.fn().mockResolvedValue(undefined),
      },
      cwd: vi.fn().mockReturnValue("/workspace/project"),
      console: {
        log: vi.fn(),
        error: vi.fn(),
      },
    };

    const originalArgv = process.argv;
    process.argv = ["node", "cli", "script", "generate", "show signup"];
    const ctx = createDefaultScriptRouterContext(base);

    expect(ctx.getArgAfter("generate")).toBe("show signup");
    expect(ctx.getArgAfter("voice")).toBeUndefined();

    process.argv = originalArgv;
  });
});
