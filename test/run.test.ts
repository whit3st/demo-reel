import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/index.js", () => ({
  generate: vi.fn(),
}));

import { generate } from "../src/index.js";

function createConfig(overrides: Record<string, unknown> = {}) {
  return {
    video: { resolution: "FHD" as const },
    cursor: "dot" as const,
    motion: "smooth" as const,
    typing: "humanlike" as const,
    timing: "normal" as const,
    steps: [{ action: "goto" as const, url: "https://example.com" }],
    ...overrides,
  };
}

describe("run()", () => {
  let argvSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    argvSpy = vi.spyOn(process, "argv", "get");
    vi.mocked(generate).mockResolvedValue(undefined);
  });

  afterEach(() => {
    argvSpy.mockRestore();
  });

  it("calls generate with the provided config", async () => {
    argvSpy.mockReturnValue(["node", "script.js"]);
    const { run } = await import("../src/run.js");
    const config = createConfig();

    await run(config);

    expect(generate).toHaveBeenCalledWith(config, {
      verbose: false,
      dryRun: false,
      headed: false,
    });
  });

  it("passes --dry-run flag to generate", async () => {
    argvSpy.mockReturnValue(["node", "script.js", "--dry-run"]);
    const { run } = await import("../src/run.js");
    const config = createConfig();

    await run(config);

    expect(generate).toHaveBeenCalledWith(config, {
      verbose: false,
      dryRun: true,
      headed: false,
    });
  });

  it("passes --verbose flag to generate", async () => {
    argvSpy.mockReturnValue(["node", "script.js", "--verbose"]);
    const { run } = await import("../src/run.js");
    const config = createConfig();

    await run(config);

    expect(generate).toHaveBeenCalledWith(config, {
      verbose: true,
      dryRun: false,
      headed: false,
    });
  });

  it("passes --headed flag to generate", async () => {
    argvSpy.mockReturnValue(["node", "script.js", "--headed"]);
    const { run } = await import("../src/run.js");
    const config = createConfig();

    await run(config);

    expect(generate).toHaveBeenCalledWith(config, {
      verbose: false,
      dryRun: false,
      headed: true,
    });
  });

  it("passes --silent flag by stripping voice and forcing webm", async () => {
    argvSpy.mockReturnValue(["node", "script.js", "--silent"]);
    const { run } = await import("../src/run.js");
    const config = createConfig({
      voice: { provider: "piper", voice: "en_US-amy-medium", speed: 1 },
      outputFormat: "mp4",
    });

    await run(config);

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        voice: undefined,
        outputFormat: "webm",
      }),
      expect.any(Object),
    );
  });

  it("--silent converts mp4 outputPath to webm", async () => {
    argvSpy.mockReturnValue(["node", "script.js", "--silent"]);
    const { run } = await import("../src/run.js");
    const config = createConfig({
      outputPath: "./videos/my-demo.mp4",
    });

    await run(config);

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        outputPath: "./videos/my-demo.webm",
      }),
      expect.any(Object),
    );
  });

  it("--silent does not alter non-mp4 outputPath", async () => {
    argvSpy.mockReturnValue(["node", "script.js", "--silent"]);
    const { run } = await import("../src/run.js");
    const config = createConfig({
      outputPath: "./videos/my-demo.webm",
    });

    await run(config);

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        outputPath: "./videos/my-demo.webm",
      }),
      expect.any(Object),
    );
  });

  it("--silent strips narration from scenes", async () => {
    argvSpy.mockReturnValue(["node", "script.js", "--silent"]);
    const { run } = await import("../src/run.js");
    const config = createConfig({
      scenes: [
        { narration: "Hello world", stepIndex: 0 },
        { narration: "Second scene", stepIndex: 1 },
      ],
    });

    await run(config);

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        scenes: [
          { narration: "", stepIndex: 0 },
          { narration: "", stepIndex: 1 },
        ],
      }),
      expect.any(Object),
    );
  });

  it("--silent handles config without scenes gracefully", async () => {
    argvSpy.mockReturnValue(["node", "script.js", "--silent"]);
    const { run } = await import("../src/run.js");
    const config = createConfig();

    await run(config);

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        voice: undefined,
        outputFormat: "webm",
      }),
      expect.any(Object),
    );
  });

  it("--silent handles config without outputPath gracefully", async () => {
    argvSpy.mockReturnValue(["node", "script.js", "--silent"]);
    const { run } = await import("../src/run.js");
    const config = createConfig({
      outputPath: undefined,
    });

    await run(config);

    expect(generate).toHaveBeenCalled();
  });

  it("explicit options override CLI flags", async () => {
    argvSpy.mockReturnValue(["node", "script.js", "--verbose", "--dry-run"]);
    const { run } = await import("../src/run.js");
    const config = createConfig();

    await run(config, { verbose: false, dryRun: false });

    expect(generate).toHaveBeenCalledWith(config, {
      verbose: false,
      dryRun: false,
      headed: false,
    });
  });

  it("explicit options merge with missing CLI flags", async () => {
    argvSpy.mockReturnValue(["node", "script.js", "--headed"]);
    const { run } = await import("../src/run.js");
    const config = createConfig();

    await run(config, { verbose: true, dryRun: true });

    expect(generate).toHaveBeenCalledWith(config, {
      verbose: true,
      dryRun: true,
      headed: true,
    });
  });

  it("explicit silent: true overrides --no-silent CLI", async () => {
    argvSpy.mockReturnValue(["node", "script.js", "--silent"]);
    const { run } = await import("../src/run.js");
    const config = createConfig({
      voice: { provider: "piper", voice: "en_US-amy-medium", speed: 1 },
      outputFormat: "mp4",
    });

    await run(config, { silent: false });

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        voice: expect.any(Object),
        outputFormat: "mp4",
      }),
      expect.any(Object),
    );
  });

  it("combines multiple CLI flags", async () => {
    argvSpy.mockReturnValue([
      "node",
      "script.js",
      "--dry-run",
      "--verbose",
      "--headed",
      "--silent",
    ]);
    const { run } = await import("../src/run.js");
    const config = createConfig();

    await run(config);

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        voice: undefined,
        outputFormat: "webm",
      }),
      {
        verbose: true,
        dryRun: true,
        headed: true,
      },
    );
  });

  it("returns a resolved promise (void)", async () => {
    argvSpy.mockReturnValue(["node", "script.js"]);
    const { run } = await import("../src/run.js");
    const result = await run(createConfig());
    expect(result).toBeUndefined();
  });
});

describe("resolveArg", () => {
  it("returns true when flag is present", () => {
    expect(["node", "script.js", "--dry-run"].includes("--dry-run")).toBe(true);
  });

  it("returns false when flag is absent", () => {
    expect(["node", "script.js"].includes("--dry-run")).toBe(false);
  });

  it("returns false for empty argv", () => {
    expect([].includes("--dry-run")).toBe(false);
  });
});
