import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSceneWindows, logSyncReport, type SyncReport } from "../src/narration-sync.js";
import { estimateStepDuration, STEP_DURATION_MS } from "../src/step-duration.js";
import type { Step } from "../src/schemas.js";

/**
 * estimateStepDuration is private, but buildSceneWindows exposes it through
 * `estimatedDurationMs`: a single-step window's estimate IS the step's
 * duration. These numbers decide how much padding a scene gets, so a wrong
 * constant shows up as narration running past its visuals.
 */
const durationOf = (step: Step): number => {
  const windows = buildSceneWindows(
    [step],
    [{ sceneIndex: 0, audioDurationMs: 0, gapAfterMs: 0 }],
    [{ narration: "n", stepIndex: 0 }],
    0,
  );
  return windows[0].estimatedDurationMs;
};

const sel = { strategy: "custom", value: "button" } as const;

describe("step duration estimation", () => {
  it.each([
    ["goto", { action: "goto", url: "https://example.com" }, 2000],
    ["click", { action: "click", selector: sel }, 700],
    ["hover", { action: "hover", selector: sel }, 700],
    ["press", { action: "press", selector: sel, key: "Enter" }, 200],
    ["scroll", { action: "scroll", selector: sel, x: 0, y: 400 }, 400],
    ["select", { action: "select", selector: sel, value: "a" }, 300],
    ["check", { action: "check", selector: sel, checked: true }, 300],
    ["upload", { action: "upload", selector: sel, filePath: "f.png" }, 300],
    ["drag", { action: "drag", source: sel, target: sel }, 1000],
    ["waitFor", { action: "waitFor", kind: "loadState", state: "load" }, 500],
    ["confirm (default arm)", { action: "confirm", accept: true }, 500],
  ])("estimates %s at %sms", (_name, step, expected) => {
    expect(durationOf(step as unknown as Step)).toBe(expected);
  });

  it("estimates a wait step as its own duration", () => {
    expect(durationOf({ action: "wait", ms: 1234 } as Step)).toBe(1234);
  });

  it.each([
    ["", 0],
    ["hello", 500],
    ["a longer sentence", 1700],
  ])("estimates typing %o at %sms (100ms per character)", (text, expected) => {
    expect(durationOf({ action: "type", selector: sel, text } as unknown as Step)).toBe(expected);
  });

  describe("explicit delays", () => {
    it("adds delayBeforeMs and delayAfterMs to the base estimate", () => {
      const step = { action: "click", selector: sel, delayBeforeMs: 100, delayAfterMs: 250 };

      expect(durationOf(step as unknown as Step)).toBe(1050);
    });

    it("adds delays to a wait step too", () => {
      const step = { action: "wait", ms: 500, delayAfterMs: 300 };

      expect(durationOf(step as unknown as Step)).toBe(800);
    });
  });

  /**
   * The script timing engine and the narration sync engine used to keep
   * byte-identical copies of this table, with only a comment holding them in
   * sync. They now call one pure module, so this asserts the table's values and
   * that the sync engine really routes through it.
   */
  it("exposes one shared duration table for every engine", () => {
    expect(STEP_DURATION_MS).toEqual({
      typingPerChar: 100,
      click: 700,
      goto: 2000,
      press: 200,
      scroll: 400,
      selectCheckUpload: 300,
      drag: 1000,
      default: 500,
    });
  });

  it("builds scene estimates from the shared estimator", () => {
    const step = { action: "click", selector: sel, delayAfterMs: 125 } as Step;

    expect(durationOf(step)).toBe(estimateStepDuration(step));
  });
});

describe("logSyncReport", () => {
  const report = (overrides: Partial<SyncReport> = {}): SyncReport => ({
    windows: [],
    totalDeficitMs: 0,
    maxDeficitMs: 0,
    overflowScenes: [],
    appliedPadMs: 0,
    ...overrides,
  });

  const window = (sceneIndex: number, deficitMs: number) => ({
    sceneIndex,
    startStep: 0,
    endStep: 2,
    steps: [],
    estimatedDurationMs: 1000,
    narrationDurationMs: 1000 + deficitMs,
    requiredMs: 1000 + deficitMs,
    deficitMs,
  });

  afterEach(() => vi.restoreAllMocks());

  it("reports a clean run in one line", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    logSyncReport(report());

    expect(log).toHaveBeenCalledExactlyOnceWith("✓ Narration in sync — no padding needed");
  });

  it("prints the per-scene table only in verbose mode", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    logSyncReport(report({ windows: [window(0, 0), window(1, 0)] }), true);

    const output = log.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("Narration sync report");
    expect(output).toContain("Scene 0");
    expect(output).toContain("Scene 1");
  });

  it("reports how much padding was applied and to how many scenes", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    logSyncReport(
      report({ windows: [window(0, 800), window(1, 0)], totalDeficitMs: 800, appliedPadMs: 800 }),
    );

    const output = log.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("800ms");
    expect(output).toContain("1 scene(s)");
  });

  // Scenes past maxAutoPadMs get padded anyway, so the warning is the only
  // signal that a narration is far longer than the visuals it describes.
  it("warns about scenes that exceeded the auto-pad threshold", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    logSyncReport(report({ totalDeficitMs: 9000, appliedPadMs: 9000, overflowScenes: [2, 4] }));

    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toContain("2, 4");
  });

  it("does not warn when nothing overflowed", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    logSyncReport(report({ totalDeficitMs: 100, appliedPadMs: 100 }));

    expect(warn).not.toHaveBeenCalled();
  });
});
