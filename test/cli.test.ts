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

vi.mock("../src/index.js", () => ({
  generate: vi.fn(),
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
import { generate } from "../src/index.js";
import {
  scriptGenerate,
  scriptVoice,
  scriptBuild,
  scriptValidate,
  scriptFix,
  scriptFullPipeline,
} from "../src/script/cli.js";

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

  it("parses dry-run, url=, and no-cache flags", async () => {
    process.argv = [
      "node",
      "cli",
      "script",
      "generate",
      "Flow",
      "--url=https://app.example.com",
      "--dry-run",
      "--no-cache",
    ];

    const { parseArgs } = await import("../src/cli.js");
    const result = parseArgs();

    expect(result.options.dryRun).toBe(true);
    expect(result.options.scriptUrl).toBe("https://app.example.com");
    expect(result.options.noCache).toBe(true);
  });

  it("ignores invalid --tag values", async () => {
    process.argv = ["node", "cli", "demo", "--tag"];

    const { parseArgs } = await import("../src/cli.js");
    const noValue = parseArgs();
    expect(noValue.options.tags).toBeUndefined();

    process.argv = ["node", "cli", "demo", "--tag", " ,  "];
    const emptyValue = parseArgs();
    expect(emptyValue.options.tags).toBeUndefined();
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

  it("shows help and exits success", async () => {
    process.argv = ["node", "cli", "--help"];

    const { runCli } = await import("../src/cli.js");

    await expect(runCli()).resolves.toBe(0);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
  });

  it("returns usage error when script command has no subcommand or description", async () => {
    process.argv = ["node", "cli", "script"];

    const { runCli } = await import("../src/cli.js");

    await expect(runCli()).resolves.toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      "Usage: demo-reel script <subcommand|description> [options]",
    );
  });

  it("returns usage errors for script subcommands missing required script path", async () => {
    process.argv = ["node", "cli", "script", "voice"];
    const { runCli } = await import("../src/cli.js");
    await expect(runCli()).resolves.toBe(1);
    expect(console.error).toHaveBeenCalledWith("Usage: demo-reel script voice <script.json>");

    process.argv = ["node", "cli", "script", "build"];
    await expect(runCli()).resolves.toBe(1);
    expect(console.error).toHaveBeenCalledWith("Usage: demo-reel script build <script.json>");

    process.argv = ["node", "cli", "script", "fix"];
    await expect(runCli()).resolves.toBe(1);
    expect(console.error).toHaveBeenCalledWith("Usage: demo-reel script fix <script.json>");
  });

  it("returns usage error for script description without --url", async () => {
    process.argv = ["node", "cli", "script", "Show signup"];

    const { runCli } = await import("../src/cli.js");

    await expect(runCli()).resolves.toBe(1);
    expect(console.error).toHaveBeenCalledWith("Usage: demo-reel script <description> --url <url>");
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

  it("routes script voice subcommand with default voice config", async () => {
    process.argv = ["node", "cli", "script", "voice", "demo.script.json"];

    const { runCli } = await import("../src/cli.js");

    await expect(runCli()).resolves.toBe(0);
    expect(scriptVoice).toHaveBeenCalledWith(
      "demo.script.json",
      { provider: "openai", voice: "alloy", speed: 1.0 },
      {
        verbose: false,
        headed: undefined,
        noCache: undefined,
      },
    );
  });

  it("routes script build and fix subcommands", async () => {
    process.argv = ["node", "cli", "script", "build", "demo.script.json", "--resolution", "2K"];

    const { runCli } = await import("../src/cli.js");

    await expect(runCli()).resolves.toBe(0);
    expect(scriptBuild).toHaveBeenCalledWith("demo.script.json", {
      verbose: false,
      headed: undefined,
      noCache: undefined,
      resolution: "2K",
      format: undefined,
    });

    process.argv = ["node", "cli", "script", "fix", "demo.script.json", "--headed"];
    await expect(runCli()).resolves.toBe(0);
    expect(scriptFix).toHaveBeenCalledWith("demo.script.json", {
      verbose: false,
      headed: true,
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

  it("runs default no-arg flow across all scenarios", async () => {
    process.argv = ["node", "cli"];

    const { runCli } = await import("../src/cli.js");

    await expect(runCli()).resolves.toBe(0);
    expect(findScenarioFiles).toHaveBeenCalledTimes(1);
    expect(runVideoScenario).toHaveBeenCalledTimes(2);
  });

  it("returns error for --all when no scenarios exist", async () => {
    vi.mocked(findScenarioFiles).mockResolvedValue([]);
    process.argv = ["node", "cli", "--all"];

    const { runCli } = await import("../src/cli.js");

    await expect(runCli()).resolves.toBe(1);
    expect(console.error).toHaveBeenCalledWith("No *.demo.ts files found");
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

  it("falls back to scenario lookup when direct path is missing", async () => {
    vi.mocked(access).mockRejectedValueOnce(new Error("missing"));
    vi.mocked(loadScenario).mockResolvedValueOnce(null);
    process.argv = ["node", "cli", "missing.demo.ts"];

    const { runCli } = await import("../src/cli.js");

    await expect(runCli()).resolves.toBe(1);
    expect(loadScenario).toHaveBeenCalledWith("missing.demo.ts");
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

  it("invokes browser-created callback to register cleanup target", async () => {
    process.argv = ["node", "cli", "demo"];

    const { runCli } = await import("../src/cli.js");

    await expect(runCli()).resolves.toBe(0);

    const callback = vi.mocked(setOnBrowserCreated).mock.calls[0]?.[0];
    expect(callback).toBeTypeOf("function");

    const context = { close: vi.fn().mockResolvedValue(undefined) };
    const browser = { close: vi.fn().mockResolvedValue(undefined) };
    callback?.(browser as never, context as never);
  });

  it("executes registered SIGINT cleanup handler", async () => {
    vi.resetModules();
    process.argv = ["node", "cli", "demo"];

    let sigintHandler: (() => void) | undefined;
    vi.spyOn(process, "once").mockImplementation(((event: string, handler: () => void) => {
      if (event === "SIGINT") {
        sigintHandler = handler;
      }
      return process;
    }) as never);
    vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    const configLoader = await import("../src/config-loader.js");
    const videoHandler = await import("../src/video-handler.js");
    const { runCli } = await import("../src/cli.js");

    vi.mocked(configLoader.loadConfig).mockResolvedValue(createLoadedConfig() as never);
    vi.mocked(configLoader.loadScenario).mockResolvedValue("/tmp/example.demo.ts");
    vi.mocked(configLoader.findScenarioFiles).mockResolvedValue(["/tmp/one.demo.ts"]);

    await expect(runCli()).resolves.toBe(0);

    const browserCreated = vi.mocked(videoHandler.setOnBrowserCreated).mock.calls[0]?.[0];
    const context = { close: vi.fn().mockResolvedValue(undefined) };
    const browser = { close: vi.fn().mockResolvedValue(undefined) };
    browserCreated?.(browser as never, context as never);

    sigintHandler?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(context.close).toHaveBeenCalledTimes(1);
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  it("uses voice-generation path when config requires narration audio", async () => {
    vi.mocked(loadConfig).mockResolvedValueOnce({
      ...createLoadedConfig(),
      config: {
        ...createLoadedConfig().config,
        voice: { provider: "openai", voice: "alloy", speed: 1.0 },
        scenes: [{ narration: "Welcome", steps: [{ action: "goto", url: "https://example.com" }] }],
        audio: undefined,
      },
    } as never);
    process.argv = ["node", "cli", "demo"];

    const { runCli } = await import("../src/cli.js");

    await expect(runCli()).resolves.toBe(0);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(runVideoScenario).not.toHaveBeenCalled();
  });

  it("main exits process with runCli exit code", async () => {
    process.argv = ["node", "cli", "--help"];
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    const { main } = await import("../src/cli.js");

    await main();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});
