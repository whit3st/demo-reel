import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/config-loader.js", () => ({
  loadConfig: vi.fn(),
  loadScenario: vi.fn(),
  findScenarioFiles: vi.fn(),
}));

vi.mock("../src/video-handler.js", () => ({
  runVideoScenario: vi.fn(),
  setOnBrowserCreated: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  writeFile: vi.fn(),
  access: vi.fn(),
}));

vi.mock("../src/script/cli.js", () => ({
  scriptGenerate: vi.fn(),
  scriptVoice: vi.fn(),
  scriptBuild: vi.fn(),
  scriptValidate: vi.fn(),
  scriptFix: vi.fn(),
  scriptFullPipeline: vi.fn(),
}));

import { writeFile, access } from "fs/promises";
import { loadConfig, loadScenario, findScenarioFiles } from "../src/config-loader.js";
import { runVideoScenario, setOnBrowserCreated } from "../src/video-handler.js";
import { scriptGenerate, scriptValidate, scriptFullPipeline } from "../src/script/cli.js";

const ORIGINAL_ARGV = [...process.argv];

function createLoadedConfig(tags?: string[]) {
  return {
    config: {
      video: { resolution: { width: 1920, height: 1080 } },
      cursor: {
        type: "dot",
        size: 12,
        borderWidth: 2,
        borderColor: "#fff",
        shadowColor: "#000",
        start: { x: 0, y: 0 },
        persistPosition: true,
      },
      motion: {
        moveDurationMs: 600,
        moveStepsMin: 25,
        stepsPerPx: 12,
        clickDelayMs: 60,
        curve: { offsetRatio: 0.1, offsetMin: 4, offsetMax: 80, easing: "easeInOutCubic" },
      },
      typing: { baseDelayMs: 80, spaceDelayMs: 120, punctuationDelayMs: 200, enterDelayMs: 220 },
      timing: { afterGotoDelayMs: 2000, endDelayMs: 2000 },
      steps: [{ action: "goto", url: "https://example.com" }],
      tags,
    },
    outputPath: "/tmp/output/demo.webm",
    configPath: "/tmp/example.demo.ts",
  };
}

describe("cli", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.spyOn(process, "cwd").mockReturnValue("/workspace/project");
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(loadConfig).mockResolvedValue(createLoadedConfig() as never);
    vi.mocked(loadScenario).mockResolvedValue("/tmp/example.demo.ts");
    vi.mocked(findScenarioFiles).mockResolvedValue(["/tmp/one.demo.ts", "/tmp/two.demo.ts"]);
    vi.mocked(scriptValidate).mockResolvedValue(true);
    vi.mocked(access).mockResolvedValue(undefined);
    process.argv = [...ORIGINAL_ARGV];
  });

  it("parses tags, output dir, and script hints", async () => {
    process.argv = [
      "node",
      "cli",
      "demo",
      "--tag=marketing, onboarding",
      "--tag",
      "sales",
      "-o",
      "./videos",
      "--hint",
      "one",
      "--hint",
      "two",
    ];

    const { parseArgs } = await import("../src/cli.js");
    const result = parseArgs();

    expect(result.scenario).toBe("demo");
    expect(result.options.tags).toEqual(["marketing", "onboarding", "sales"]);
    expect(result.options.outputDir).toBe("./videos");
    expect(result.options.scriptHints).toEqual(["one", "two"]);
  });

  it("runs init and writes the example scenario", async () => {
    process.argv = ["node", "cli", "init"];

    const { runCli } = await import("../src/cli.js");

    await expect(runCli()).resolves.toBe(0);
    expect(writeFile).toHaveBeenCalledWith(
      "/workspace/project/example.demo.ts",
      expect.stringContaining("export default defineConfig"),
      "utf-8",
    );
  });

  it("routes script generate subcommand with description, url, and hints", async () => {
    process.argv = [
      "node",
      "cli",
      "script",
      "generate",
      "Show signup",
      "--url",
      "https://app.example.com",
      "--name",
      "signup",
      "--hint",
      "Use hero",
    ];

    const { runCli } = await import("../src/cli.js");

    await expect(runCli()).resolves.toBe(0);
    expect(scriptGenerate).toHaveBeenCalledWith(
      "Show signup",
      "https://app.example.com",
      "signup",
      {
        verbose: false,
        headed: undefined,
        noCache: undefined,
        hints: ["Use hero"],
      },
    );
  });

  it("routes full script pipeline when the script command is given a description", async () => {
    process.argv = [
      "node",
      "cli",
      "script",
      "Show signup",
      "--url",
      "https://app.example.com",
      "--voice",
      "nova",
      "--speed",
      "1.25",
      "--resolution",
      "2K",
      "--format",
      "webm",
    ];

    const { runCli } = await import("../src/cli.js");

    await expect(runCli()).resolves.toBe(0);
    expect(scriptFullPipeline).toHaveBeenCalledWith("Show signup", "https://app.example.com", {
      verbose: false,
      headed: undefined,
      noCache: undefined,
      output: undefined,
      voice: { provider: "openai", voice: "nova", speed: 1.25 },
      hints: undefined,
      resolution: "2K",
      format: "webm",
    });
  });

  it("exits when script validate reports failure", async () => {
    vi.mocked(scriptValidate).mockResolvedValue(false);
    process.argv = ["node", "cli", "script", "validate", "demo.script.json"];

    const { runCli } = await import("../src/cli.js");

    await expect(runCli()).resolves.toBe(1);
    expect(scriptValidate).toHaveBeenCalledWith("demo.script.json", {
      verbose: false,
      headed: undefined,
      noCache: undefined,
    });
  });

  it("runs all scenarios and skips non-matching tags when verbose", async () => {
    vi.mocked(loadConfig)
      .mockResolvedValueOnce(createLoadedConfig(["marketing"]) as never)
      .mockResolvedValueOnce(createLoadedConfig(["sales"]) as never);
    process.argv = ["node", "cli", "--all", "--tag", "sales", "--verbose"];

    const { runCli } = await import("../src/cli.js");

    await expect(runCli()).resolves.toBe(0);
    expect(runVideoScenario).toHaveBeenCalledTimes(1);
    expect(runVideoScenario).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ["sales"] }),
      "/tmp/output/demo.webm",
      "/tmp/example.demo.ts",
      expect.objectContaining({ verbose: true, tags: ["sales"] }),
    );
    expect(console.log).toHaveBeenCalledWith("  ↳ Skipped (tags)");
  });

  it("accepts a direct scenario file path when it exists", async () => {
    process.argv = ["node", "cli", "./custom/demo.demo.ts", "--output-dir", "./videos"];

    const { runCli } = await import("../src/cli.js");

    await expect(runCli()).resolves.toBe(0);
    expect(loadScenario).not.toHaveBeenCalled();
    expect(loadConfig).toHaveBeenCalledWith(
      expect.stringContaining("/workspace/project/custom/demo.demo.ts"),
      "./videos",
    );
    expect(runVideoScenario).toHaveBeenCalledTimes(1);
  });

  it("fails when the selected scenario does not match the requested tags", async () => {
    vi.mocked(loadConfig).mockResolvedValue(createLoadedConfig(["marketing"]) as never);
    process.argv = ["node", "cli", "demo", "--tag", "sales"];

    const { runCli } = await import("../src/cli.js");

    await expect(runCli()).resolves.toBe(1);
    expect(console.error).toHaveBeenCalledWith("Scenario does not match tags: sales");
  });

  it("formats thrown errors differently based on verbose mode", async () => {
    const error = new Error("boom");
    vi.mocked(findScenarioFiles).mockRejectedValue(error);
    process.argv = ["node", "cli", "--verbose"];

    const { runCli } = await import("../src/cli.js");

    await expect(runCli()).resolves.toBe(1);
    expect(console.error).toHaveBeenCalledWith(error);

    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(findScenarioFiles).mockRejectedValue(new Error("boom"));
    process.argv = ["node", "cli"];

    const cli = await import("../src/cli.js");
    await expect(cli.runCli()).resolves.toBe(1);
    expect(console.error).toHaveBeenCalledWith("Error: boom");
  });

  it("registers browser cleanup through the video handler hook", async () => {
    process.argv = ["node", "cli", "demo"];

    const { runCli } = await import("../src/cli.js");

    await expect(runCli()).resolves.toBe(0);
    expect(setOnBrowserCreated).toHaveBeenCalledWith(expect.any(Function));
  });
});
