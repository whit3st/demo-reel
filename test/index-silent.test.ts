import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const runPipelineMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("../src/pipeline/orchestrator.js", () => ({ runPipeline: runPipelineMock }));

vi.mock("../src/voice/chatterbox.js", () => ({ shutdownChatterbox: vi.fn() }));

vi.mock("../src/browser/pool.js", () => ({
  BrowserPool: vi.fn().mockImplementation(function (this: any) {
    this.acquire = vi.fn();
    this.release = vi.fn();
    this.releaseAll = vi.fn().mockResolvedValue(undefined);
  }),
}));

import { generate } from "../src/index.js";

/**
 * `silent: true` is the "video only, no voice" mode. It rewrites the config
 * before validation, so everything it touches has to stay internally
 * consistent — the resolved config is what the whole pipeline then reads.
 */
describe("generate({ silent: true })", () => {
  let capturedOutputPath: string | undefined;
  let capturedConfig: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, "cwd").mockReturnValue("/workspace/project");
    vi.spyOn(console, "log").mockImplementation(() => {});
    capturedOutputPath = undefined;
    capturedConfig = undefined;
    runPipelineMock.mockImplementation(async (_stages: unknown, ctx: any) => {
      capturedOutputPath = ctx.outputPath;
      capturedConfig = ctx.config;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function baseConfig(overrides: Record<string, unknown> = {}) {
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

  // Silent mode forces outputFormat: "webm", but the schema refuses webm when
  // audio.narration or audio.background is set (schemas/scenes.ts superRefine).
  // Leaving `audio` in place made `silent` unusable for any config with music.
  it("does not throw for a config that has background audio", async () => {
    await expect(
      generate(
        baseConfig({
          audio: { background: "music.mp3", backgroundVolume: 0.3 },
        }) as any,
        { silent: true },
      ),
    ).resolves.toBeUndefined();

    expect(capturedConfig.outputFormat).toBe("webm");
  });

  it("does not throw for a config that has narration audio", async () => {
    await expect(
      generate(baseConfig({ audio: { narration: "vo.mp3" } }) as any, { silent: true }),
    ).resolves.toBeUndefined();
  });

  // The default output path is built from getBaseName() and used to be
  // hardcoded to .mp4, so a silent run wrote a webm payload to a .mp4 name.
  it("defaults the output path to .webm when no outputPath is given", async () => {
    await generate(baseConfig({ name: "my-demo" }) as any, { silent: true });

    expect(capturedOutputPath).toMatch(/my-demo\.webm$/);
  });

  it("rewrites an explicit .mp4 outputPath to .webm", async () => {
    await generate(baseConfig({ outputPath: "out/demo.mp4" }) as any, { silent: true });

    expect(capturedOutputPath).toMatch(/demo\.webm$/);
  });

  // TTSStage gates on Boolean(scene.narration), so blanking the narration is
  // what actually makes the run silent. Note the transform's `voice: undefined`
  // is a no-op — voiceConfigSchema carries a .default() (voice-config.ts:147)
  // and repopulates it during validation. Harmless, since nothing is narrated.
  it("blanks every scene narration", async () => {
    await generate(
      baseConfig({
        steps: [
          { action: "goto", url: "https://example.com" },
          { action: "wait", ms: 100 },
        ],
        voice: { provider: "piper", voice: "en_US-amy-medium", speed: 1 },
        scenes: [
          { narration: "Hello", stepIndex: 0 },
          { narration: "World", stepIndex: 1 },
        ],
      }) as any,
      { silent: true },
    );

    expect(capturedConfig.scenes.map((s: any) => s.narration)).toEqual(["", ""]);
  });

  it("leaves a non-silent run on mp4 with its audio intact", async () => {
    await generate(
      baseConfig({
        audio: { background: "music.mp3", backgroundVolume: 0.3 },
        outputPath: "out/demo.mp4",
      }) as any,
      {},
    );

    expect(capturedOutputPath).toMatch(/demo\.mp4$/);
    expect(capturedConfig.audio?.background).toBeDefined();
  });
});
