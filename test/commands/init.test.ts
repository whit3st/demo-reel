import { describe, expect, it, vi } from "vitest";
import { InitCommand } from "../../src/commands/init.js";
import type { CommandContext, GlobalOptions } from "../../src/commands/types.js";

function createMockContext(): CommandContext {
  return {
    fs: {
      writeFile: vi.fn().mockResolvedValue(undefined),
    },
    cwd: vi.fn().mockReturnValue("/workspace/project"),
    console: {
      log: vi.fn(),
      error: vi.fn(),
    },
  };
}

function createGlobalOptions(overrides: Partial<GlobalOptions> = {}): GlobalOptions {
  return {
    verbose: false,
    dryRun: false,
    ...overrides,
  };
}

describe("InitCommand", () => {
  it("validates with no arguments", () => {
    const cmd = new InitCommand();
    expect(cmd.validate([])).toBe(true);
    expect(cmd.validate(["extra"])).toBe(false);
  });

  it("creates example.demo.ts file", async () => {
    const cmd = new InitCommand();
    const ctx = createMockContext();
    const options = createGlobalOptions();

    const exitCode = await cmd.execute([], options, ctx);

    expect(exitCode).toBe(0);
    expect(ctx.fs.writeFile).toHaveBeenCalledWith(
      "/workspace/project/example.demo.ts",
      expect.stringContaining("export default defineConfig"),
      "utf-8",
    );
    expect(ctx.console.log).toHaveBeenCalledWith(
      "Created /workspace/project/example.demo.ts",
    );
  });

  it("creates a valid demo-reel config", async () => {
    const cmd = new InitCommand();
    const ctx = createMockContext();
    const options = createGlobalOptions();

    await cmd.execute([], options, ctx);

    const writtenContent = vi.mocked(ctx.fs.writeFile).mock.calls[0]?.[1] as string;
    
    expect(writtenContent).toContain("import { defineConfig } from 'demo-reel'");
    expect(writtenContent).toContain('resolution: "FHD"');
    expect(writtenContent).toContain("cursor: 'dot'");
    expect(writtenContent).toContain("motion: 'smooth'");
    expect(writtenContent).toContain("steps: [");
  });
});
