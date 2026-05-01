import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../src/video-handler.js", () => ({
  runVideoScenario: vi.fn(),
}));

vi.mock("../src/runtime/core.js", () => ({
  createRuntimeContext: vi.fn(),
  closeRuntimeContext: vi.fn(),
  runStepSequence: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/runtime/assertions.js", () => ({
  AssertionFailure: class AssertionFailure extends Error {
    details: {
      assertion: { type: string };
      target: string;
      expected: string;
      actual: string;
    };

    constructor(details: {
      assertion: { type: string };
      target: string;
      expected: string;
      actual: string;
    }) {
      super("assertion failure");
      this.name = "AssertionFailure";
      this.details = details;
    }
  },
  runCheckpointAssertions: vi.fn(),
  selectCheckpointsForLabel: vi.fn().mockReturnValue([]),
  selectCheckpointsForStep: vi.fn().mockReturnValue([]),
}));

import { runVideoScenario } from "../src/video-handler.js";
import { createRuntimeContext, closeRuntimeContext, runStepSequence } from "../src/runtime/core.js";
import {
  AssertionFailure,
  runCheckpointAssertions,
  selectCheckpointsForLabel,
  selectCheckpointsForStep,
} from "../src/runtime/assertions.js";
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
      steps: [
        { action: "goto", url: "https://example.com" },
        { action: "wait", ms: 10 },
      ],
      cleanup: [{ action: "wait", ms: 50 }],
    });

    expect(result.ok).toBe(true);
    expect(runStepSequence).toHaveBeenCalledTimes(4);
    expect(closeRuntimeContext).toHaveBeenCalledTimes(1);
    expect(selectCheckpointsForStep).toHaveBeenCalledWith(undefined, 0);
    expect(selectCheckpointsForStep).toHaveBeenCalledWith(undefined, 1);
    expect(runCheckpointAssertions).toHaveBeenCalledTimes(0);
  });

  it("E2ERuntime runs checkpoints at step index and labels", async () => {
    vi.mocked(createRuntimeContext).mockResolvedValue({
      browser: {} as never,
      context: {} as never,
      page: {} as never,
    });
    vi.mocked(runStepSequence).mockResolvedValue(undefined);
    vi.mocked(closeRuntimeContext).mockResolvedValue(undefined);

    const stepCheckpoint = {
      atStep: 0,
      expect: [{ type: "expectUrl", url: "https://example.com" }],
    };
    const setupCheckpoint = {
      label: "setup",
      expect: [{ type: "expectUrl", url: "https://example.com/setup" }],
    };

    vi.mocked(selectCheckpointsForStep).mockReturnValue([stepCheckpoint] as never[]);
    vi.mocked(selectCheckpointsForLabel).mockImplementation((_, label) => {
      if (label === "setup") {
        return [setupCheckpoint] as never[];
      }
      return [];
    });

    const runtime = new E2ERuntime();
    const result = await runtime.run({
      mode: "e2e",
      report: { formats: ["json"], outputDir: "./artifacts", includeStepLogs: true },
      setup: [{ action: "goto", url: "https://example.com/login" }],
      steps: [{ action: "goto", url: "https://example.com" }],
      checkpoints: [stepCheckpoint, setupCheckpoint],
    });

    expect(result.ok).toBe(true);
    expect(runCheckpointAssertions).toHaveBeenCalledTimes(2);
  });

  it("E2ERuntime maps assertion failures to structured runtime failure", async () => {
    vi.mocked(createRuntimeContext).mockResolvedValue({
      browser: {} as never,
      context: {} as never,
      page: {} as never,
    });
    vi.mocked(runStepSequence).mockResolvedValue(undefined);
    vi.mocked(closeRuntimeContext).mockResolvedValue(undefined);

    const assertionError = new AssertionFailure({
      assertion: { type: "expectText" },
      target: "testId:title",
      expected: "text containing \"Done\"",
      actual: "text \"Loading\"",
    });
    vi.mocked(runCheckpointAssertions).mockRejectedValue(assertionError);
    vi.mocked(selectCheckpointsForStep).mockReturnValue([
      { atStep: 0, expect: [{ type: "expectText", selector: { strategy: "testId", value: "title" }, text: "Done" }] },
    ] as never[]);

    const runtime = new E2ERuntime();
    const result = await runtime.run({
      mode: "e2e",
      report: { formats: ["json"], outputDir: "./artifacts", includeStepLogs: true },
      steps: [{ action: "goto", url: "https://example.com" }],
      checkpoints: [{ atStep: 0, expect: [{ type: "expectText", selector: { strategy: "testId", value: "title" }, text: "Done" }] }],
    });

    expect(result.ok).toBe(false);
    expect(result.failure?.context).toBe("expectText");
    expect(result.failure?.target).toBe("testId:title");
    expect(result.failure?.expected).toContain("Done");
    expect(result.failure?.actual).toContain("Loading");
  });

  it("E2ERuntime retries and marks flaky pass", async () => {
    vi.mocked(createRuntimeContext).mockResolvedValue({
      browser: {} as never,
      context: {} as never,
      page: {} as never,
    });
    vi.mocked(closeRuntimeContext).mockResolvedValue(undefined);
    vi.mocked(runCheckpointAssertions).mockResolvedValue(undefined);
    vi.mocked(selectCheckpointsForStep).mockReturnValue([] as never[]);
    vi.mocked(selectCheckpointsForLabel).mockReturnValue([] as never[]);
    vi.mocked(runStepSequence)
      .mockRejectedValueOnce(new Error("first attempt runtime failure"))
      .mockResolvedValue(undefined);

    const runtime = new E2ERuntime();
    const result = await runtime.run({
      mode: "e2e",
      report: { formats: ["json"], outputDir: "./artifacts", includeStepLogs: true },
      execution: { retries: 1, repeat: 1, failFast: false, parallel: 1 },
      steps: [{ action: "goto", url: "https://example.com" }],
    });

    expect(result.ok).toBe(true);
    expect(result.flaky).toBe(true);
    expect(result.attempts).toHaveLength(2);
    expect(result.exitCode).toBe(0);
  });

  it("E2ERuntime fails early when failFast is enabled", async () => {
    vi.mocked(createRuntimeContext).mockResolvedValue({
      browser: {} as never,
      context: {} as never,
      page: {} as never,
    });
    vi.mocked(closeRuntimeContext).mockResolvedValue(undefined);
    vi.mocked(runCheckpointAssertions).mockResolvedValue(undefined);
    vi.mocked(selectCheckpointsForStep).mockReturnValue([] as never[]);
    vi.mocked(selectCheckpointsForLabel).mockReturnValue([] as never[]);
    vi.mocked(runStepSequence).mockRejectedValue(new Error("boom"));

    const runtime = new E2ERuntime();
    const result = await runtime.run({
      mode: "e2e",
      report: { formats: ["json"], outputDir: "./artifacts", includeStepLogs: true },
      execution: { retries: 0, repeat: 3, failFast: true, parallel: 1 },
      steps: [{ action: "goto", url: "https://example.com" }],
    });

    expect(result.ok).toBe(false);
    expect(result.attempts).toHaveLength(1);
    expect(result.exitCode).toBe(2);
  });

  it("E2ERuntime returns assertion exit code for test failures", async () => {
    vi.mocked(createRuntimeContext).mockResolvedValue({
      browser: {} as never,
      context: {} as never,
      page: {} as never,
    });
    vi.mocked(closeRuntimeContext).mockResolvedValue(undefined);
    vi.mocked(runStepSequence).mockResolvedValue(undefined);

    const assertionError = new AssertionFailure({
      assertion: { type: "expectVisible" },
      target: "testId:cta",
      expected: "visible",
      actual: "hidden",
    });
    vi.mocked(runCheckpointAssertions).mockRejectedValue(assertionError);
    vi.mocked(selectCheckpointsForStep).mockReturnValue([
      { atStep: 0, expect: [{ type: "expectVisible", selector: { strategy: "testId", value: "cta" } }] },
    ] as never[]);

    const runtime = new E2ERuntime();
    const result = await runtime.run({
      mode: "e2e",
      report: { formats: ["json"], outputDir: "./artifacts", includeStepLogs: true },
      steps: [{ action: "goto", url: "https://example.com" }],
      checkpoints: [{ atStep: 0, expect: [{ type: "expectVisible", selector: { strategy: "testId", value: "cta" } }] }],
    });

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
  });

  it("E2ERuntime runs suite with parallel workers", async () => {
    vi.mocked(createRuntimeContext).mockResolvedValue({
      browser: {} as never,
      context: {} as never,
      page: {} as never,
    });
    vi.mocked(closeRuntimeContext).mockResolvedValue(undefined);
    vi.mocked(runCheckpointAssertions).mockResolvedValue(undefined);
    vi.mocked(selectCheckpointsForStep).mockReturnValue([] as never[]);
    vi.mocked(selectCheckpointsForLabel).mockReturnValue([] as never[]);
    vi.mocked(runStepSequence).mockResolvedValue(undefined);

    const runtime = new E2ERuntime();
    const suite = await runtime.runSuite([
      {
        mode: "e2e",
        report: { formats: ["json"], outputDir: "./artifacts", includeStepLogs: true },
        execution: { parallel: 2, retries: 0, repeat: 1, failFast: false },
        steps: [{ action: "goto", url: "https://example.com/a" }],
      },
      {
        mode: "e2e",
        report: { formats: ["json"], outputDir: "./artifacts", includeStepLogs: true },
        execution: { parallel: 2, retries: 0, repeat: 1, failFast: false },
        steps: [{ action: "goto", url: "https://example.com/b" }],
      },
    ]);

    expect(suite.ok).toBe(true);
    expect(suite.results).toHaveLength(2);
    expect(suite.exitCode).toBe(0);
  });
});
