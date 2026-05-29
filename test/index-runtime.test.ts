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

vi.mock("fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockRejectedValue(new Error("not found")),
  rmdir: vi.fn().mockResolvedValue(undefined),
  copyFile: vi.fn().mockResolvedValue(undefined),
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
  processVideoWithAudio: vi.fn(),
  handleAuth: vi.fn(),
  buildSubtitleCuesWithNarrationPlacements: vi.fn().mockReturnValue([]),
  generateSRT: vi.fn().mockReturnValue(""),
  generateVTT: vi.fn().mockReturnValue(""),
  generateMetadata: vi.fn().mockReturnValue({}),
  setOnBrowserCreated: vi.fn(),
}));

vi.mock("../src/browser/pool.js", () => ({
  BrowserPool: vi.fn().mockImplementation(function (this: any) {
    this.acquire = vi.fn().mockResolvedValue({
      browser: {},
      context: {},
      page: {
        viewportSize: vi.fn().mockReturnValue({ width: 1920, height: 1080 }),
        addInitScript: vi.fn(),
        evaluate: vi.fn().mockResolvedValue(true),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue("https://example.com"),
        video: vi.fn().mockReturnValue({
          path: vi.fn().mockResolvedValue("/workspace/project/.demo-reel-temp/video.webm"),
        }),
        close: vi.fn().mockResolvedValue(undefined),
        mouse: { move: vi.fn() },
        screenshot: vi.fn().mockResolvedValue(undefined),
      },
      isRecording: true,
    });
    this.release = vi.fn().mockResolvedValue("/workspace/project/.demo-reel-temp/video.webm");
    this.releaseAll = vi.fn();
  }),
}));

import { existsSync, mkdirSync, readFileSync } from "fs";
import { loadConfig } from "../src/config-loader.js";
import { runVideoScenario, processVideoWithAudio } from "../src/video-handler.js";
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
    vi.mocked(processVideoWithAudio).mockResolvedValue({
      finalPath: "/workspace/project/output/demo.mp4",
      narrationPlacements: [],
      warnings: [],
    });
    vi.mocked(generateVoiceSegments).mockResolvedValue([]);
    vi.mocked(generateNarrationAudio).mockResolvedValue({
      timedScenes: [],
      narrationManifestPath: "/workspace/project/output/demo-narration-manifest.json",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs locally via pipeline without temp JSON roundtrip", async () => {
    const { generate } = await import("../src/index.js");

    await generate(createConfig(), { verbose: true });

    expect(runVideoScenario).not.toHaveBeenCalled();
    expect(processVideoWithAudio).toHaveBeenCalledWith(
      "/workspace/project/.demo-reel-temp/video.webm",
      "/workspace/project/output/demo.mp4",
      undefined,
      "/workspace/project",
      [],
      "auto",
    );
  });

  it("generates narration audio via local TTS", async () => {
    const manifestJson = JSON.stringify({
      version: 1,
      processingVersion: "v4-old-processing",
      audioPath: "output/demo-narration.mp3",
      clips: [
        {
          sceneIndex: 0,
          stepIndex: 1,
          narration: "test",
          filePath: "output/demo-narration-clips/clip-0.mp3",
          audioDurationMs: 1000,
          audioOffsetMs: 0,
          gapAfterMs: 0,
        },
      ],
    });
    vi.mocked(existsSync).mockImplementation((path: string) => {
      if (path.endsWith("demo-narration.manifest.json")) return true;
      if (path.endsWith("demo-narration.mp3")) return true;
      return false;
    });
    vi.mocked(readFileSync as any).mockImplementation((path: string) => {
      if (path.endsWith(".manifest.json")) return manifestJson;
      return undefined;
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
  });

  it("uses outputPath to derive the narration filename", async () => {
    const manifestJson = JSON.stringify({
      version: 1,
      processingVersion: "v5-no-volume-normalization",
      audioPath: "videos/custom-name-narration.mp3",
      clips: [
        {
          sceneIndex: 0,
          stepIndex: 0,
          narration: "test",
          filePath: "videos/custom-name-narration-clips/clip-0.mp3",
          audioDurationMs: 1000,
          audioOffsetMs: 0,
          gapAfterMs: 0,
        },
      ],
    });
    vi.mocked(existsSync).mockImplementation((path: string) => {
      if (path.endsWith("custom-name-narration.manifest.json")) return true;
      if (path.endsWith("custom-name-narration.mp3")) return true;
      return false;
    });
    vi.mocked(readFileSync as any).mockImplementation((path: string) => {
      if (path.endsWith(".manifest.json")) return manifestJson;
      return undefined;
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
  });

  it("handles pipeline errors gracefully", async () => {
    vi.mocked(generateVoiceSegments).mockRejectedValue(new Error("TTS engine failure"));

    const { generate } = await import("../src/index.js");

    await expect(
      generate(
        createConfig({
          scenes: [{ narration: "Hello world", stepIndex: 0 }],
          voice: { provider: "piper", voice: "en_US-amy-medium", speed: 1 },
        }),
      ),
    ).rejects.toThrow("TTS engine failure");
  });
});
