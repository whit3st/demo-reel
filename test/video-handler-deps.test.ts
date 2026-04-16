import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mkdirMock,
  readFileMock,
  copyFileMock,
  unlinkMock,
  rmdirMock,
  writeFileMock,
  resolveAudioPathsMock,
  mergeAudioVideoMock,
  narrationManifestSchemaMock,
  loadSessionMock,
  saveSessionMock,
  clearSessionMock,
  validateSessionMock,
  captureSessionMock,
  restoreSessionMock,
  runStepSimpleMock,
  launchMock,
  pageMock,
  contextMock,
  browserMock,
  videoMock,
} = vi.hoisted(() => ({
  mkdirMock: vi.fn(),
  readFileMock: vi.fn(),
  copyFileMock: vi.fn(),
  unlinkMock: vi.fn(),
  rmdirMock: vi.fn(),
  writeFileMock: vi.fn(),
  resolveAudioPathsMock: vi.fn(),
  mergeAudioVideoMock: vi.fn(),
  narrationManifestSchemaMock: vi.fn(),
  loadSessionMock: vi.fn(),
  saveSessionMock: vi.fn(),
  clearSessionMock: vi.fn(),
  validateSessionMock: vi.fn(),
  captureSessionMock: vi.fn(),
  restoreSessionMock: vi.fn(),
  runStepSimpleMock: vi.fn(),
  launchMock: vi.fn(),
  pageMock: { close: vi.fn(), video: vi.fn(), goto: vi.fn() },
  contextMock: {
    newPage: vi.fn(),
    setDefaultTimeout: vi.fn(),
    close: vi.fn(),
  },
  browserMock: {
    newContext: vi.fn(),
    close: vi.fn(),
  },
  videoMock: { path: vi.fn() },
}));

vi.mock("fs/promises", () => ({
  mkdir: mkdirMock,
  readFile: readFileMock,
  copyFile: copyFileMock,
  unlink: unlinkMock,
  rmdir: rmdirMock,
  writeFile: writeFileMock,
}));

vi.mock("../src/audio-processor.js", () => ({
  resolveAudioPaths: resolveAudioPathsMock,
  mergeAudioVideo: mergeAudioVideoMock,
}));

vi.mock("../src/narration-manifest.js", () => ({
  narrationManifestSchema: { parse: narrationManifestSchemaMock },
}));

vi.mock("../src/auth.js", () => ({
  loadSession: loadSessionMock,
  saveSession: saveSessionMock,
  clearSession: clearSessionMock,
  validateSession: validateSessionMock,
  captureSession: captureSessionMock,
  restoreSession: restoreSessionMock,
}));

vi.mock("../src/runner.js", () => ({
  runStepSimple: runStepSimpleMock,
  runDemo: vi.fn(),
  runSteps: vi.fn(),
}));

import { runDemo as runDemoMock } from "../src/runner.js";

vi.mock("playwright", () => ({
  chromium: { launch: launchMock },
}));

import {
  handleAuth,
  processVideoWithAudio,
  startBrowser,
  startRecording,
  stopRecording,
  setOnBrowserCreated,
  runVideoScenario,
} from "../src/video-handler.js";

// ── handleAuth ────────────────────────────────────────────────────
describe("handleAuth", () => {
  const context = { close: vi.fn() } as any;
  const page = { goto: vi.fn() } as any;
  const authConfig = {
    storage: { name: "auth", types: ["cookies"] as const },
    validate: { url: "/dashboard" },
    loginSteps: [{ action: "click", selector: "#btn" }],
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when saved session is valid", async () => {
    loadSessionMock.mockResolvedValue({ cookies: [] });
    validateSessionMock.mockResolvedValue(true);
    restoreSessionMock.mockResolvedValue(undefined);

    const result = await handleAuth(context, page, authConfig, "/path/config.yaml", false);

    expect(result).toBe(true);
    expect(restoreSessionMock).toHaveBeenCalled();
    expect(validateSessionMock).toHaveBeenCalled();
    expect(runStepSimpleMock).not.toHaveBeenCalled();
  });

  it("clears invalid session and runs login", async () => {
    loadSessionMock.mockResolvedValue({ cookies: [] });
    validateSessionMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    captureSessionMock.mockResolvedValue({ cookies: [] });
    saveSessionMock.mockResolvedValue(undefined);
    restoreSessionMock.mockResolvedValue(undefined);

    const result = await handleAuth(context, page, authConfig, "/path/config.yaml", true);

    expect(result).toBe(true);
    expect(clearSessionMock).toHaveBeenCalledWith("auth", "/path");
    expect(runStepSimpleMock).toHaveBeenCalledWith(page, { action: "click", selector: "#btn" });
    expect(saveSessionMock).toHaveBeenCalled();
  });

  it("throws when login fails", async () => {
    loadSessionMock.mockResolvedValue({ cookies: [] });
    validateSessionMock.mockResolvedValue(false);
    runStepSimpleMock.mockResolvedValue(undefined);
    const secondValidate = validateSessionMock.mockResolvedValue(false);

    await expect(handleAuth(context, page, authConfig, "/path/config.yaml")).rejects.toThrow(
      "Login failed",
    );
  });

  it("force reauth clears session first", async () => {
    const forcedConfig = {
      ...authConfig,
      behavior: { forceReauth: true },
    };
    loadSessionMock.mockResolvedValue(null);
    validateSessionMock.mockResolvedValueOnce(true);
    captureSessionMock.mockResolvedValue({ cookies: [] });
    saveSessionMock.mockResolvedValue(undefined);

    const result = await handleAuth(context, page, forcedConfig, "/path/config.yaml", true);

    expect(result).toBe(true);
    expect(clearSessionMock).toHaveBeenCalledWith("auth", "/path");
    expect(runStepSimpleMock).toHaveBeenCalled();
  });

  it("handles no saved session", async () => {
    loadSessionMock.mockResolvedValue(null);
    validateSessionMock.mockResolvedValueOnce(true);
    captureSessionMock.mockResolvedValue({ cookies: [] });
    saveSessionMock.mockResolvedValue(undefined);

    const result = await handleAuth(context, page, authConfig, "/path/config.yaml", false);

    expect(result).toBe(true);
    expect(runStepSimpleMock).toHaveBeenCalled();
  });
});

// ── processVideoWithAudio ─────────────────────────────────────────
describe("processVideoWithAudio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mkdirMock.mockResolvedValue(undefined);
  });

  it("copies video when no audio config", async () => {
    const result = await processVideoWithAudio(
      "/tmp/raw.mp4",
      "/out/demo.mp4",
      undefined,
      "/cfg/config.yaml",
      [],
    );

    expect(mkdirMock).toHaveBeenCalledWith("/out", { recursive: true });
    expect(copyFileMock).toHaveBeenCalledWith("/tmp/raw.mp4", "/out/demo.mp4");
    expect(result).toEqual({
      finalPath: "/out/demo.mp4",
      narrationPlacements: [],
      warnings: [],
    });
  });

  it("copies video when audio has no sources", async () => {
    const audio = {} as any;
    const result = await processVideoWithAudio(
      "/tmp/raw.mp4",
      "/out/demo.mp4",
      audio,
      "/cfg/config.yaml",
      [],
    );

    expect(copyFileMock).toHaveBeenCalled();
    expect(result.narrationPlacements).toEqual([]);
  });

  it("merges audio with video when audio present", async () => {
    resolveAudioPathsMock.mockReturnValue({ background: "/music/bg.mp3" });
    mergeAudioVideoMock.mockResolvedValue("/out/final.mp4");

    const audio = { background: "/music/bg.mp3" } as any;
    const result = await processVideoWithAudio(
      "/tmp/raw.mp4",
      "/out/final.mp4",
      audio,
      "/cfg/config.yaml",
      [],
    );

    expect(mergeAudioVideoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        videoPath: "/tmp/raw.mp4",
        outputPath: "/out/final.mp4",
      }),
    );
    expect(result.finalPath).toBe("/out/final.mp4");
    expect(result.narrationPlacements).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("builds narration placements from manifest", async () => {
    resolveAudioPathsMock.mockReturnValue({
      narrationManifest: "/cfg/narration-manifest.json",
    });
    readFileMock.mockResolvedValue('{"clips":[]}');
    narrationManifestSchemaMock.mockReturnValue({
      clips: [{ sceneIndex: 0, narration: "Hello", filePath: "clip-0.mp3", audioDurationMs: 800 }],
    });
    mergeAudioVideoMock.mockResolvedValue("/out/final.mp4");

    const timestamps = [
      { sceneIndex: 0, narration: "Hello", startMs: 0, endMs: 1000, isIntro: false },
    ];
    const audio = { narration: "/cfg/voice.mp3" } as any;
    const result = await processVideoWithAudio(
      "/tmp/raw.mp4",
      "/out/final.mp4",
      audio,
      "/cfg/config.yaml",
      timestamps,
    );

    expect(result.narrationPlacements).toEqual([
      expect.objectContaining({ sceneIndex: 0, startMs: 0, endMs: 800 }),
    ]);
    expect(mergeAudioVideoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: expect.objectContaining({
          narrationPlacements: result.narrationPlacements,
        }),
      }),
    );
  });

  it("warns when manifest clip has no matching scene", async () => {
    resolveAudioPathsMock.mockReturnValue({
      narrationManifest: "/cfg/narration-manifest.json",
    });
    readFileMock.mockResolvedValue('{"clips":[]}');
    narrationManifestSchemaMock.mockReturnValue({
      clips: [
        { sceneIndex: 99, narration: "Missing scene", filePath: "clip.mp3", audioDurationMs: 500 },
      ],
    });
    mergeAudioVideoMock.mockResolvedValue("/out/final.mp4");

    const timestamps = [
      { sceneIndex: 0, narration: "Hello", startMs: 0, endMs: 1000, isIntro: false },
    ];
    const audio = { narration: "v.mp3" } as any;
    const result = await processVideoWithAudio(
      "/tmp/raw.mp4",
      "/out/final.mp4",
      audio,
      "/cfg/config.yaml",
      timestamps,
    );

    expect(result.warnings[0]).toContain("No recorded scene timestamp");
    expect(result.narrationPlacements).toEqual([]);
  });

  it("warns when manifest clips overlap", async () => {
    resolveAudioPathsMock.mockReturnValue({
      narrationManifest: "/cfg/manifest.json",
    });
    readFileMock.mockResolvedValue('{"clips":[]}');
    narrationManifestSchemaMock.mockReturnValue({
      clips: [
        { sceneIndex: 0, narration: "A", filePath: "a.mp3", audioDurationMs: 1500 },
        { sceneIndex: 1, narration: "B", filePath: "b.mp3", audioDurationMs: 800 },
      ],
    });
    mergeAudioVideoMock.mockResolvedValue("/out/final.mp4");

    const timestamps = [
      { sceneIndex: 0, narration: "A", startMs: 0, endMs: 1000, isIntro: false },
      { sceneIndex: 1, narration: "B", startMs: 1000, endMs: 2000, isIntro: false },
    ];
    const audio = { narration: "v.mp3" } as any;
    const result = await processVideoWithAudio(
      "/tmp/raw.mp4",
      "/out/final.mp4",
      audio,
      "/cfg/config.yaml",
      timestamps,
    );

    expect(result.warnings.some((w) => w.includes("Narration overlap"))).toBe(true);
  });

  it("warns when manifest load fails", async () => {
    resolveAudioPathsMock.mockReturnValue({
      narrationManifest: "/cfg/manifest.json",
    });
    readFileMock.mockRejectedValue(new Error("ENOENT"));
    mergeAudioVideoMock.mockResolvedValue("/out/final.mp4");

    const audio = { narration: "v.mp3" } as any;
    const result = await processVideoWithAudio(
      "/tmp/raw.mp4",
      "/out/final.mp4",
      audio,
      "/cfg/config.yaml",
      [],
    );

    expect(result.warnings[0]).toContain("Failed to load narration manifest");
    expect(result.warnings[0]).toContain("ENOENT");
  });

  it("passes resolved audio without narrationPlacements when none", async () => {
    resolveAudioPathsMock.mockReturnValue({ background: "/bg.mp3" });
    mergeAudioVideoMock.mockResolvedValue("/out/final.mp4");

    const audio = { background: "/bg.mp3" } as any;
    await processVideoWithAudio("/tmp/raw.mp4", "/out/final.mp4", audio, "/cfg/config.yaml", []);

    expect(mergeAudioVideoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: expect.not.objectContaining({ narrationPlacements: expect.anything() }),
      }),
    );
  });
});

// ── startBrowser ──────────────────────────────────────────────────
describe("startBrowser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setOnBrowserCreated(null);
    browserMock.newContext.mockResolvedValue(contextMock);
    contextMock.newPage.mockResolvedValue(pageMock);
    launchMock.mockResolvedValue(browserMock);
  });

  it("launches browser and returns video result", async () => {
    const config = { video: { resolution: { width: 1920, height: 1080 } } } as any;
    const result = await startBrowser(config, false);

    expect(launchMock).toHaveBeenCalledWith({ headless: true });
    expect(browserMock.newContext).toHaveBeenCalledWith({
      viewport: { width: 1920, height: 1080 },
    });
    expect(contextMock.setDefaultTimeout).toHaveBeenCalledWith(5000);
    expect(contextMock.newPage).toHaveBeenCalled();
    expect(result.page).toBe(pageMock);
    expect(result.context).toBe(contextMock);
    expect(result.browser).toBe(browserMock);
  });

  it("launches headed browser", async () => {
    const config = { video: { resolution: { width: 1920, height: 1080 } } } as any;
    await startBrowser(config, true);

    expect(launchMock).toHaveBeenCalledWith({ headless: false });
  });

  it("calls onBrowserCreated callback when set", async () => {
    const cb = vi.fn();
    setOnBrowserCreated(cb);
    const config = { video: { resolution: { width: 1920, height: 1080 } } } as any;
    await startBrowser(config, false);

    expect(cb).toHaveBeenCalledWith(browserMock, contextMock);
  });
});

// ── startRecording ────────────────────────────────────────────────
describe("startRecording", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setOnBrowserCreated(null);
    browserMock.newContext.mockResolvedValue(contextMock);
    contextMock.newPage.mockResolvedValue(pageMock);
    launchMock.mockResolvedValue(browserMock);
  });

  it("launches with video recording config", async () => {
    const config = { video: { resolution: { width: 1920, height: 1080 } } } as any;
    const result = await startRecording(config, false);

    expect(launchMock).toHaveBeenCalledWith({ headless: true });
    expect(browserMock.newContext).toHaveBeenCalledWith(
      expect.objectContaining({
        recordVideo: expect.objectContaining({
          size: { width: 1920, height: 1080 },
        }),
      }),
    );
    expect(result.tempVideoPath).toBe("");
  });

  it("launches headed recording", async () => {
    const config = { video: { resolution: { width: 1920, height: 1080 } } } as any;
    await startRecording(config, true);

    expect(launchMock).toHaveBeenCalledWith({ headless: false });
  });

  it("calls onBrowserCreated callback", async () => {
    const cb = vi.fn();
    setOnBrowserCreated(cb);
    const config = { video: { resolution: { width: 1920, height: 1080 } } } as any;
    await startRecording(config, false);

    expect(cb).toHaveBeenCalledWith(browserMock, contextMock);
  });
});

// ── stopRecording ─────────────────────────────────────────────────
describe("stopRecording", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns video path after closing resources", async () => {
    videoMock.path.mockResolvedValue("/tmp/demo-reel-temp/video.webm");
    pageMock.video.mockReturnValue(videoMock);
    pageMock.close.mockResolvedValue(undefined);
    contextMock.close.mockResolvedValue(undefined);
    browserMock.close.mockResolvedValue(undefined);

    const result = {
      page: pageMock,
      context: contextMock,
      browser: browserMock,
      tempVideoPath: "",
    };
    const path = await stopRecording(result);

    expect(pageMock.close).toHaveBeenCalled();
    expect(contextMock.close).toHaveBeenCalled();
    expect(browserMock.close).toHaveBeenCalled();
    expect(path).toBe("/tmp/demo-reel-temp/video.webm");
  });

  it("calls saveSessionFn before closing context", async () => {
    videoMock.path.mockResolvedValue("/tmp/video.webm");
    pageMock.video.mockReturnValue(videoMock);
    pageMock.close.mockResolvedValue(undefined);
    contextMock.close.mockResolvedValue(undefined);
    browserMock.close.mockResolvedValue(undefined);

    const saveFn = vi.fn().mockResolvedValue(undefined);
    const result = {
      page: pageMock,
      context: contextMock,
      browser: browserMock,
      tempVideoPath: "",
    };
    await stopRecording(result, saveFn);

    expect(saveFn).toHaveBeenCalled();
    expect(saveFn.mock.invocationCallOrder[0]).toBeLessThan(
      contextMock.close.mock.invocationCallOrder[0],
    );
  });

  it("throws when no video recorded", async () => {
    pageMock.video.mockReturnValue(null);
    pageMock.close.mockResolvedValue(undefined);
    contextMock.close.mockResolvedValue(undefined);
    browserMock.close.mockResolvedValue(undefined);

    const result = {
      page: pageMock,
      context: contextMock,
      browser: browserMock,
      tempVideoPath: "",
    };
    await expect(stopRecording(result)).rejects.toThrow("No video was recorded");
  });
});

// ── runVideoScenario ──────────────────────────────────────────────
describe("runVideoScenario", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setOnBrowserCreated(null);
  });

  it("returns early on dry run", async () => {
    const config = { video: { resolution: { width: 1920, height: 1080 } } } as any;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await runVideoScenario(config, "/out/demo.mp4", "/cfg/config.yaml", {
      dryRun: true,
    });

    expect(result).toBe("/out/demo.mp4");
    expect(logSpy).toHaveBeenCalledWith("✓ Config validated successfully (dry run)");
    expect(launchMock).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("handles full recording with post-steps and verbose", async () => {
    browserMock.newContext.mockResolvedValue(contextMock);
    contextMock.newPage.mockResolvedValue(pageMock);
    launchMock.mockResolvedValue(browserMock);
    (runDemoMock as any).mockResolvedValue([]);
    videoMock.path.mockResolvedValue("/tmp/video.webm");
    pageMock.video.mockReturnValue(videoMock);
    pageMock.close.mockResolvedValue(undefined);
    contextMock.close.mockResolvedValue(undefined);
    browserMock.close.mockResolvedValue(undefined);
    mkdirMock.mockResolvedValue(undefined);
    copyFileMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);
    unlinkMock.mockResolvedValue(undefined);
    rmdirMock.mockResolvedValue(undefined);

    const { runSteps } = await import("../src/runner.js");
    (runSteps as any).mockResolvedValue(undefined);

    const postBrowserMock = {
      newContext: vi.fn().mockResolvedValue({
        newPage: vi
          .fn()
          .mockResolvedValue({
            goto: vi.fn(),
            close: vi.fn().mockResolvedValue(undefined),
            video: vi.fn().mockReturnValue(null),
          }),
        setDefaultTimeout: vi.fn(),
        close: vi.fn().mockResolvedValue(undefined),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    launchMock.mockResolvedValueOnce(browserMock).mockResolvedValueOnce(postBrowserMock);

    const config = {
      video: { resolution: { width: 1920, height: 1080 } },
      postSteps: [{ action: "click", selector: "#done" }],
    } as any;

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await runVideoScenario(config, "/out/demo.mp4", "/cfg/config.yaml", {
      verbose: true,
    });

    expect(result).toBe("/out/demo.mp4");
    expect(launchMock).toHaveBeenCalledTimes(2);
    expect(logSpy).toHaveBeenCalledWith("Running post-steps...");
    expect(logSpy).toHaveBeenCalledWith("✓ Post-steps complete");
    logSpy.mockRestore();
  });

  it("handles recording error with post-step cleanup", async () => {
    browserMock.newContext.mockResolvedValue(contextMock);
    contextMock.newPage.mockResolvedValue(pageMock);
    launchMock.mockResolvedValue(browserMock);
    (runDemoMock as any).mockRejectedValue(new Error("recording failed"));
    pageMock.close.mockResolvedValue(undefined);
    contextMock.close.mockRejectedValue(new Error("already closed"));
    browserMock.close.mockRejectedValue(new Error("already closed"));

    // Post-steps browser
    const postPageMock = { goto: vi.fn() };
    const postContextMock = {
      newPage: vi.fn().mockResolvedValue(postPageMock),
      setDefaultTimeout: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const postBrowserMock = {
      newContext: vi.fn().mockResolvedValue(postContextMock),
      close: vi.fn().mockResolvedValue(undefined),
    };
    launchMock.mockResolvedValueOnce(browserMock).mockResolvedValueOnce(postBrowserMock);

    const config = {
      video: { resolution: { width: 1920, height: 1080 } },
      postSteps: [{ action: "click", selector: "#cleanup" }],
    } as any;

    await expect(runVideoScenario(config, "/out/demo.mp4", "/cfg/config.yaml")).rejects.toThrow(
      "recording failed",
    );
  });

  it("ignores postSteps error during error cleanup", async () => {
    browserMock.newContext.mockResolvedValue(contextMock);
    contextMock.newPage.mockResolvedValue(pageMock);
    launchMock.mockResolvedValue(browserMock);
    (runDemoMock as any).mockRejectedValue(new Error("boom"));

    pageMock.close.mockResolvedValue(undefined);
    contextMock.close.mockResolvedValue(undefined);
    browserMock.close.mockResolvedValue(undefined);

    const postBrowserMock = {
      newContext: vi.fn().mockRejectedValue(new Error("post browser failed")),
      close: vi.fn().mockResolvedValue(undefined),
    };
    launchMock.mockResolvedValueOnce(browserMock).mockResolvedValueOnce(postBrowserMock);

    const config = {
      video: { resolution: { width: 1920, height: 1080 } },
      postSteps: [{ action: "click", selector: "#cleanup" }],
    } as any;

    await expect(runVideoScenario(config, "/out/demo.mp4", "/cfg/config.yaml")).rejects.toThrow(
      "boom",
    );
  });
});
