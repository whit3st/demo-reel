import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../src/video-handler.js", () => ({
  runVideoScenario: vi.fn(),
}));

vi.mock("../src/runtime/core.js", () => ({
  createRuntimeContext: vi.fn(),
  closeRuntimeContext: vi.fn(),
  runStepSequence: vi.fn(),
}));

import { runVideoScenario } from "../src/video-handler.js";
import { createRuntimeContext, closeRuntimeContext, runStepSequence } from "../src/runtime/core.js";
import { VideoRuntime } from "../src/runtime/video-runtime.js";
import { E2ERuntime } from "../src/runtime/e2e-runtime.js";

describe("runtime wrappers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("VideoRuntime returns ok result and video artifact", async () => {
    vi.mocked(runVideoScenario).mockResolvedValue("/tmp/out.mp4");
    const runtime = new VideoRuntime();

    const result = await runtime.run({
      config: {
        mode: "video",
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
          moveDurationMs: 100,
          moveStepsMin: 1,
          stepsPerPx: 1,
          clickDelayMs: 0,
          curve: { offsetRatio: 0, offsetMin: 0, offsetMax: 0, easing: "easeInOutCubic" },
        },
        typing: { baseDelayMs: 0, spaceDelayMs: 0, punctuationDelayMs: 0, enterDelayMs: 0 },
        timing: { afterGotoDelayMs: 0, endDelayMs: 0, narrationSyncMode: "off", narrationGapMs: 0, maxAutoPadMs: 0, maxSyncPasses: 1 },
        steps: [{ action: "goto", url: "https://example.com" }],
      },
      outputPath: "/tmp/out.mp4",
      configPath: "/tmp/config.ts",
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts?.videoPath).toBe("/tmp/out.mp4");
  });

  it("E2ERuntime runs setup, steps, and cleanup", async () => {
    vi.mocked(createRuntimeContext).mockResolvedValue({
      browser: {} as never,
      context: {} as never,
      page: {} as never,
    });
    vi.mocked(runStepSequence).mockResolvedValue(undefined);
    vi.mocked(closeRuntimeContext).mockResolvedValue(undefined);

    const runtime = new E2ERuntime();
    const result = await runtime.run({
      mode: "e2e",
      report: { formats: ["json"], outputDir: "./artifacts", includeStepLogs: true },
      setup: [{ action: "goto", url: "https://example.com/login" }],
      steps: [{ action: "goto", url: "https://example.com" }],
      cleanup: [{ action: "wait", ms: 50 }],
    });

    expect(result.ok).toBe(true);
    expect(runStepSequence).toHaveBeenCalledTimes(3);
    expect(closeRuntimeContext).toHaveBeenCalledTimes(1);
  });
});
