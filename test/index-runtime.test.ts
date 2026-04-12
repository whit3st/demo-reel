import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("child_process", () => ({
  execSync: vi.fn(),
  spawn: vi.fn(),
  spawnSync: vi.fn(),
}));

vi.mock("fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock("../src/config-loader.js", () => ({
  loadConfig: vi.fn(),
}));

vi.mock("../src/video-handler.js", () => ({
  runVideoScenario: vi.fn(),
}));

import { execSync, spawn, spawnSync } from "child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "fs";
import { loadConfig } from "../src/config-loader.js";
import { runVideoScenario } from "../src/video-handler.js";

function createConfig(overrides: Record<string, unknown> = {}) {
  return {
    video: { resolution: "FHD" },
    cursor: "dot",
    motion: "smooth",
    typing: "humanlike",
    timing: "normal",
    steps: [{ action: "goto", url: "https://example.com" }],
    ...overrides,
  };
}

function createSpawnProcess(exitCode = 0) {
  return {
    on(event: string, handler: (value?: number | Error) => void) {
      if (event === "close") {
        queueMicrotask(() => handler(exitCode));
      }
      return this;
    },
  };
}

describe("index runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.spyOn(process, "cwd").mockReturnValue("/workspace/project");
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(execSync).mockImplementation((command: string) => {
      if (command === "docker info") {
        return "ok";
      }
      if (command.includes("docker image inspect demo-reel:latest")) {
        return "ok";
      }
      return "ok";
    });
    vi.mocked(spawn).mockReturnValue(createSpawnProcess() as never);
    vi.mocked(spawnSync).mockReturnValue({ status: 0, error: undefined } as never);
    vi.mocked(loadConfig).mockResolvedValue({
      config: createConfig(),
      outputPath: "/workspace/project/output/demo.webm",
      configPath: "/workspace/project/.demo.tmp.json",
    });
    vi.mocked(runVideoScenario).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs locally when docker is disabled", async () => {
    const { generate } = await import("../src/index.js");

    await generate(createConfig(), { noDocker: true, verbose: true });

    expect(mkdirSync).toHaveBeenCalledWith("/workspace/project/output", { recursive: true });
    expect(writeFileSync).toHaveBeenCalledWith(
      ".demo.tmp.json",
      expect.stringContaining('"https://example.com"'),
      "utf-8",
    );
    expect(loadConfig).toHaveBeenCalledWith("/workspace/project/.demo.tmp.json");
    expect(runVideoScenario).toHaveBeenCalledWith(
      expect.any(Object),
      "/workspace/project/output/demo.webm",
      "/workspace/project/.demo.tmp.json",
      { verbose: true },
    );
    expect(spawn).not.toHaveBeenCalled();
    expect(unlinkSync).toHaveBeenCalledWith(".demo.tmp.json");
  });

  it("runs through docker when available", async () => {
    const { generate } = await import("../src/index.js");

    await generate(createConfig(), { verbose: true });

    expect(spawn).toHaveBeenCalledWith(
      "docker",
      expect.arrayContaining(["run", "--rm", "demo-reel:latest", ".demo.tmp.json", "--verbose"]),
      expect.objectContaining({ stdio: "inherit", env: process.env }),
    );
    expect(loadConfig).not.toHaveBeenCalled();
    expect(unlinkSync).toHaveBeenCalledWith(".demo.tmp.json");
  });

  it("generates narration audio in stepIndex order and injects mp4 audio config", async () => {
    let audioChecks = 0;
    vi.mocked(existsSync).mockImplementation((path: string) => {
      if (path.endsWith("demo-narration.mp3")) {
        audioChecks += 1;
        return audioChecks > 1;
      }
      return false;
    });

    const { generate } = await import("../src/index.js");

    await generate(createConfig({
      outputDir: "./output",
      scenes: [
        { narration: "Third scene", stepIndex: 11 },
        { narration: "First scene", stepIndex: 1 },
        { narration: "Second scene", stepIndex: 7 },
      ],
      voice: { provider: "piper", voice: "en_US-amy-medium", speed: 1 },
    }), { noDocker: true });

    expect(writeFileSync).toHaveBeenCalledWith(
      ".demo.voice.tmp.json",
      expect.stringContaining('"First scene"'),
      "utf-8",
    );
    const voiceScriptCall = vi.mocked(writeFileSync).mock.calls.find(([path]) => path === ".demo.voice.tmp.json");
    expect(voiceScriptCall?.[1]).toContain('"First scene"');
    expect(voiceScriptCall?.[1]).toContain('"Second scene"');
    expect(voiceScriptCall?.[1]).toContain('"Third scene"');
    expect((voiceScriptCall?.[1] as string).indexOf('"First scene"')).toBeLessThan((voiceScriptCall?.[1] as string).indexOf('"Second scene"'));
    expect((voiceScriptCall?.[1] as string).indexOf('"Second scene"')).toBeLessThan((voiceScriptCall?.[1] as string).indexOf('"Third scene"'));
    expect(spawnSync).toHaveBeenCalledWith(
      "docker",
      expect.arrayContaining([
        "--entrypoint",
        "node",
        "/app/dist/script/voice-cli.js",
        ".demo.voice.tmp.json",
        "--output",
        "output/demo-narration.mp3",
      ]),
      expect.objectContaining({ stdio: "inherit", env: process.env }),
    );
    expect(writeFileSync).toHaveBeenCalledWith(
      ".demo.tmp.json",
      expect.stringContaining('"outputFormat": "mp4"'),
      "utf-8",
    );
    expect(writeFileSync).toHaveBeenCalledWith(
      ".demo.tmp.json",
      expect.stringContaining('"narration": "output/demo-narration.mp3"'),
      "utf-8",
    );
    expect(unlinkSync).toHaveBeenCalledWith(".demo.voice.tmp.json");
    const unlinkOrder = vi.mocked(unlinkSync).mock.invocationCallOrder[0];
    const runOrder = vi.mocked(runVideoScenario).mock.invocationCallOrder[0];
    expect(unlinkOrder).toBeGreaterThan(runOrder);
  });

  it("uses outputPath to derive the narration filename", async () => {
    let audioChecks = 0;
    vi.mocked(existsSync).mockImplementation((path: string) => {
      if (path.endsWith("custom-name-narration.mp3")) {
        audioChecks += 1;
        return audioChecks > 1;
      }
      return false;
    });

    const { generate } = await import("../src/index.js");

    await generate(createConfig({
      outputPath: "videos/custom-name.webm",
      scenes: [{ narration: "Hello world", stepIndex: 0 }],
      voice: { provider: "piper", voice: "en_US-amy-medium", speed: 1 },
    }));

    expect(mkdirSync).toHaveBeenCalledWith("/workspace/project/videos", { recursive: true });
    expect(writeFileSync).toHaveBeenCalledWith(
      ".custom-name.voice.tmp.json",
      expect.any(String),
      "utf-8",
    );
    expect(writeFileSync).toHaveBeenCalledWith(
      ".custom-name.tmp.json",
      expect.stringContaining('"narration": "videos/custom-name-narration.mp3"'),
      "utf-8",
    );
  });

  it("wraps config write failures with a helpful error", async () => {
    vi.mocked(writeFileSync).mockImplementation((path: string) => {
      if (path === ".demo.tmp.json") {
        throw new Error("disk full");
      }
    });

    const { generate } = await import("../src/index.js");

    await expect(generate(createConfig(), { noDocker: true })).rejects.toThrow("Failed to write config: disk full");
    expect(unlinkSync).not.toHaveBeenCalled();
  });
});
