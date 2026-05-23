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
  readFileSync: vi.fn(),
}));

vi.mock("../src/script/tts.js", () => ({
  generateVoiceSegments: vi.fn(),
  generateNarrationAudio: vi.fn(),
}));

vi.mock("../src/config-loader.js", () => ({
  loadConfig: vi.fn(),
}));

vi.mock("../src/video-handler.js", () => ({
  runVideoScenario: vi.fn(),
}));

import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "fs";
import { loadConfig } from "../src/config-loader.js";
import { runVideoScenario } from "../src/video-handler.js";
import { generateVoiceSegments, generateNarrationAudio } from "../src/script/tts.js";

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

describe("index runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.spyOn(process, "cwd").mockReturnValue("/workspace/project");
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(loadConfig).mockResolvedValue({
      config: createConfig(),
      outputPath: "/workspace/project/output/demo.webm",
      configPath: "/workspace/project/.demo.tmp.json",
    });
    vi.mocked(runVideoScenario).mockResolvedValue(undefined);
    vi.mocked(generateVoiceSegments).mockResolvedValue([]);
    vi.mocked(generateNarrationAudio).mockResolvedValue({
      timedScenes: [],
      narrationManifestPath: "/workspace/project/output/demo-narration-manifest.json",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs locally and calls video handler", async () => {
    const { generate } = await import("../src/index.js");

    await generate(createConfig(), { verbose: true });

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
    expect(unlinkSync).toHaveBeenCalledWith(".demo.tmp.json");
  });

  it("generates narration audio via local TTS and injects mp4 audio config", async () => {
    let audioChecks = 0;
    vi.mocked(existsSync).mockImplementation((path: string) => {
      if (path.endsWith("demo-narration.mp3")) {
        audioChecks += 1;
        return audioChecks > 1;
      }
      return false;
    });

    vi.mocked(generateVoiceSegments).mockResolvedValue([
      {
        sceneIndex: 0,
        narration: "First scene",
        audio: Buffer.from("fake-audio"),
        durationMs: 1000,
      },
      {
        sceneIndex: 1,
        narration: "Second scene",
        audio: Buffer.from("fake-audio"),
        durationMs: 2000,
      },
    ]);

    const { generate } = await import("../src/index.js");

    await generate(
      createConfig({
        outputDir: "./output",
        steps: Array.from({ length: 12 }, () => ({ action: "wait" as const, ms: 100 })),
        scenes: [
          { narration: "First scene", stepIndex: 1 },
          { narration: "Second scene", stepIndex: 7 },
          { narration: "Third scene", stepIndex: 11 },
        ],
        voice: { provider: "piper", voice: "en_US-amy-medium", speed: 1 },
      }),
    );

    expect(generateVoiceSegments).toHaveBeenCalledWith(
      expect.objectContaining({
        scenes: expect.arrayContaining([
          expect.objectContaining({ narration: "First scene" }),
          expect.objectContaining({ narration: "Second scene" }),
          expect.objectContaining({ narration: "Third scene" }),
        ]),
      }),
      expect.objectContaining({ provider: "piper" }),
      expect.any(Object),
    );
    expect(generateNarrationAudio).toHaveBeenCalled();
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

    await generate(
      createConfig({
        outputPath: "videos/custom-name.webm",
        scenes: [{ narration: "Hello world", stepIndex: 0 }],
        voice: { provider: "piper", voice: "en_US-amy-medium", speed: 1 },
      }),
    );

    expect(mkdirSync).toHaveBeenCalledWith("/workspace/project/videos", { recursive: true });
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

    await expect(generate(createConfig())).rejects.toThrow("Failed to write config: disk full");
    expect(unlinkSync).not.toHaveBeenCalled();
  });
});
