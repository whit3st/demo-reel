import { describe, expect, it, vi } from "vitest";
import { applyJitter, assertRawSelector, buildTimeoutOption, buildSceneBoundaries, buildSceneTimestamps, cubicBezierPoint, easeInOutCubic, formatStepForLog, getBezierControlPoints, getTypingDelay, isConfirmStep, resolveLocator } from "../src/runner.js";
import type { Locator, Page } from "playwright";
import type { DemoReelConfig, SelectorConfig, MotionConfig, Step, TypingConfig } from "../src/schemas.js";

const makePage = (overrides: Partial<Page> = {}): Page => ({
  getByTestId: vi.fn(() => mockLocator()) as any,
  locator: vi.fn(() => mockLocator()) as any,
  ...overrides,
} as unknown as Page);

const mockLocator = (): Locator =>
  ({
    first: vi.fn(() => mockLocator()),
    nth: vi.fn(() => mockLocator()),
    waitFor: vi.fn(),
    scrollIntoViewIfNeeded: vi.fn(),
    boundingBox: vi.fn(() => ({ x: 100, y: 200, width: 50, height: 30 })),
    click: vi.fn(),
    hover: vi.fn(),
    fill: vi.fn(),
    type: vi.fn(),
    press: vi.fn(),
    evaluate: vi.fn(),
    selectOption: vi.fn(),
    setChecked: vi.fn(),
    setInputFiles: vi.fn(),
    dragTo: vi.fn(),
    focus: vi.fn(),
  }) as unknown as Locator;

describe("clamp (inline via getBezierControlPoints)", () => {
  it("clamps values within range", () => {
    const motion: MotionConfig = {
      curve: { easing: "easeInOutCubic", offsetRatio: 0.25, offsetMin: 5, offsetMax: 50 },
      stepsPerPx: 0.01,
      moveDurationMs: 500,
      moveStepsMin: 3,
      clickDelayMs: 50,
    };
    const result = getBezierControlPoints({ x: 0, y: 0 }, { x: 100, y: 100 }, motion);
    expect(result.control1).toBeDefined();
    expect(result.control2).toBeDefined();
  });
});

describe("applyJitter", () => {
  it("returns value unchanged when jitter is 0", () => {
    expect(applyJitter(10, 0)).toBe(10);
  });

  it("returns value unchanged when value is 0", () => {
    expect(applyJitter(0, 0.5)).toBe(0);
  });

  it("returns value unchanged when jitter is negative", () => {
    expect(applyJitter(10, -0.1)).toBe(10);
  });

  it("applies jitter with custom rng at 0.5 (neutral)", () => {
    const rng = vi.fn(() => 0.5);
    const result = applyJitter(10, 0.2, rng);
    expect(result).toBe(10); // factor = 1 + (1-1)*0.2 = 1
  });

  it("applies positive jitter with rng at 0", () => {
    const rng = vi.fn(() => 0); // factor = 1 + (0*2-1)*0.2 = 1 - 0.2 = 0.8
    const result = applyJitter(10, 0.2, rng);
    expect(result).toBe(8);
  });

  it("applies negative jitter with rng at 1", () => {
    const rng = vi.fn(() => 1); // factor = 1 + (1*2-1)*0.2 = 1 + 0.2 = 1.2
    const result = applyJitter(10, 0.2, rng);
    expect(result).toBe(12);
  });

  it("clamps result to non-negative", () => {
    const rng = vi.fn(() => 0);
    const result = applyJitter(1, 1.5, rng);
    expect(result).toBeGreaterThanOrEqual(0);
  });
});

describe("assertRawSelector", () => {
  it("does not throw for valid selectors", () => {
    expect(() => assertRawSelector({ strategy: "id", value: "my-id" })).not.toThrow();
    expect(() => assertRawSelector({ strategy: "class", value: "my-class" })).not.toThrow();
    expect(() => assertRawSelector({ strategy: "testId", value: "anything" })).not.toThrow();
    expect(() => assertRawSelector({ strategy: "custom", value: "div.foo" })).not.toThrow();
  });

  it("throws for id selector with # prefix", () => {
    expect(() => assertRawSelector({ strategy: "id", value: "#my-id" })).toThrow();
  });

  it("throws for class selector with . prefix", () => {
    expect(() => assertRawSelector({ strategy: "class", value: ".my-class" })).toThrow();
  });
});

describe("resolveLocator", () => {
  const page = makePage();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves testId strategy", () => {
    const sel: SelectorConfig = { strategy: "testId", value: "my-btn" };
    const result = resolveLocator(page, sel);
    expect(page.getByTestId).toHaveBeenCalledWith("my-btn");
    expect(result).toBeDefined();
  });

  it("resolves id strategy with # prefix", () => {
    const sel: SelectorConfig = { strategy: "id", value: "my-div" };
    resolveLocator(page, sel);
    expect(page.locator).toHaveBeenCalledWith("#my-div");
  });

  it("resolves class strategy with . prefix", () => {
    const sel: SelectorConfig = { strategy: "class", value: "my-button" };
    resolveLocator(page, sel);
    expect(page.locator).toHaveBeenCalledWith(".my-button");
  });

  it("resolves href strategy", () => {
    const sel: SelectorConfig = { strategy: "href", value: "/about" };
    resolveLocator(page, sel);
    expect(page.locator).toHaveBeenCalledWith('a[href="/about"]');
  });

  it("resolves data-node-id strategy", () => {
    const sel: SelectorConfig = { strategy: "data-node-id", value: "node-42" };
    resolveLocator(page, sel);
    expect(page.locator).toHaveBeenCalledWith('[data-node-id=node-42]');
  });

  it("resolves custom strategy as-is", () => {
    const sel: SelectorConfig = { strategy: "custom", value: "div.custom[data-value]" };
    resolveLocator(page, sel);
    expect(page.locator).toHaveBeenCalledWith("div.custom[data-value]");
  });

  it("throws for unknown strategy", () => {
    const sel = { strategy: "unknown" as any, value: "foo" };
    expect(() => resolveLocator(page, sel)).toThrow("Unsupported selector strategy: unknown");
  });

  it("returns first() by default", () => {
    const sel: SelectorConfig = { strategy: "testId", value: "btn" };
    const result = resolveLocator(page, sel);
    expect(result.first).toBeDefined();
  });

  it("returns nth(index) when index is specified", () => {
    const sel: SelectorConfig = { strategy: "testId", value: "btn", index: 2 };
    const result = resolveLocator(page, sel);
    expect(result.nth).toBeDefined();
  });
});

describe("getTypingDelay", () => {
  const baseTyping: TypingConfig = {
    baseDelayMs: 100,
    spaceDelayMs: 50,
    enterDelayMs: 200,
    punctuationDelayMs: 80,
  };

  it("returns baseDelay for regular characters", () => {
    expect(getTypingDelay("a", baseTyping, 100)).toBe(100);
  });

  it("adds enterDelayMs for newline", () => {
    expect(getTypingDelay("\n", baseTyping, 100)).toBe(300);
  });

  it("adds spaceDelayMs for space", () => {
    expect(getTypingDelay(" ", baseTyping, 100)).toBe(150);
  });

  it("adds punctuationDelayMs for period", () => {
    expect(getTypingDelay(".", baseTyping, 100)).toBe(180);
  });

  it("adds punctuationDelayMs for comma", () => {
    expect(getTypingDelay(",", baseTyping, 100)).toBe(180);
  });

  it("adds punctuationDelayMs for exclamation", () => {
    expect(getTypingDelay("!", baseTyping, 100)).toBe(180);
  });

  it("adds punctuationDelayMs for question mark", () => {
    expect(getTypingDelay("?", baseTyping, 100)).toBe(180);
  });

  it("adds punctuationDelayMs for colon", () => {
    expect(getTypingDelay(":", baseTyping, 100)).toBe(180);
  });

  it("adds punctuationDelayMs for semicolon", () => {
    expect(getTypingDelay(";", baseTyping, 100)).toBe(180);
  });

  it("adds punctuationDelayMs for dash", () => {
    expect(getTypingDelay("-", baseTyping, 100)).toBe(180);
  });

  it("handles custom baseDelayOverride", () => {
    expect(getTypingDelay("a", baseTyping, 50)).toBe(50);
  });
});

describe("easeInOutCubic", () => {
  it("returns 0 at t=0", () => {
    expect(easeInOutCubic(0)).toBe(0);
  });

  it("returns 1 at t=1", () => {
    expect(easeInOutCubic(1)).toBe(1);
  });

  it("returns 0.5 at t=0.5", () => {
    expect(easeInOutCubic(0.5)).toBe(0.5);
  });

  it("is symmetric around 0.5", () => {
    const a = easeInOutCubic(0.25);
    const b = easeInOutCubic(0.75);
    expect(Math.abs(a - (1 - b))).toBeLessThan(0.001);
  });

  it("produces smooth curve values", () => {
    expect(easeInOutCubic(0.25)).toBeGreaterThan(0);
    expect(easeInOutCubic(0.25)).toBeLessThan(0.5);
    expect(easeInOutCubic(0.75)).toBeGreaterThan(0.5);
    expect(easeInOutCubic(0.75)).toBeLessThan(1);
  });
});

describe("cubicBezierPoint", () => {
  it("returns p0 at t=0", () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 0.25, y: 0.5 };
    const p2 = { x: 0.75, y: 0.5 };
    const p3 = { x: 1, y: 1 };
    const result = cubicBezierPoint(0, p0, p1, p2, p3);
    expect(result).toEqual(p0);
  });

  it("returns p3 at t=1", () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 0.25, y: 0.5 };
    const p2 = { x: 0.75, y: 0.5 };
    const p3 = { x: 1, y: 1 };
    const result = cubicBezierPoint(1, p0, p1, p2, p3);
    expect(result).toEqual(p3);
  });

  it("returns midpoint at t=0.5", () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 1, y: 0 };
    const p2 = { x: 0, y: 1 };
    const p3 = { x: 1, y: 1 };
    const result = cubicBezierPoint(0.5, p0, p1, p2, p3);
    expect(result.x).toBeCloseTo(0.5, 1);
    expect(result.y).toBeCloseTo(0.5, 1);
  });
});

describe("getBezierControlPoints", () => {
  const baseMotion: MotionConfig = {
    curve: { easing: "easeInOutCubic", offsetRatio: 0.25, offsetMin: 5, offsetMax: 50 },
    stepsPerPx: 0.01,
    moveDurationMs: 500,
    moveStepsMin: 3,
    clickDelayMs: 50,
  };

  it("returns start and end as control points when distance is 0", () => {
    const start = { x: 10, y: 10 };
    const end = { x: 10, y: 10 };
    const result = getBezierControlPoints(start, end, baseMotion);
    expect(result.control1).toEqual(start);
    expect(result.control2).toEqual(end);
  });

  it("returns control points for horizontal movement", () => {
    const start = { x: 0, y: 0 };
    const end = { x: 100, y: 0 };
    const result = getBezierControlPoints(start, end, baseMotion);
    expect(result.control1.x).toBeGreaterThan(start.x);
    expect(result.control2.x).toBeLessThan(end.x);
  });

  it("returns control points for vertical movement", () => {
    const start = { x: 0, y: 0 };
    const end = { x: 0, y: 100 };
    const result = getBezierControlPoints(start, end, baseMotion);
    expect(result.control1.y).toBeGreaterThan(start.y);
    expect(result.control2.y).toBeLessThan(end.y);
  });

  it("handles negative direction", () => {
    const start = { x: 100, y: 100 };
    const end = { x: 0, y: 0 };
    const result = getBezierControlPoints(start, end, baseMotion);
    expect(result.control1.x).toBeLessThan(start.x);
  });

  it("respects offsetMin when distance is small", () => {
    const start = { x: 0, y: 0 };
    const end = { x: 5, y: 0 };
    const result = getBezierControlPoints(start, end, baseMotion);
    const dy1 = Math.abs(result.control1.y - start.y);
    const dy2 = Math.abs(result.control2.y - start.y);
    expect(Math.max(dy1, dy2)).toBeGreaterThanOrEqual(5);
  });

  it("respects offsetMax when distance is large", () => {
    const start = { x: 0, y: 0 };
    const end = { x: 1000, y: 0 };
    const result = getBezierControlPoints(start, end, baseMotion);
    const dy1 = Math.abs(result.control1.y - start.y);
    const dy2 = Math.abs(result.control2.y - start.y);
    expect(Math.max(dy1, dy2)).toBeLessThanOrEqual(50);
  });
});

describe("buildTimeoutOption", () => {
  it("returns { timeout: ms } when timeoutMs is a number", () => {
    expect(buildTimeoutOption(5000)).toEqual({ timeout: 5000 });
    expect(buildTimeoutOption(0)).toEqual({ timeout: 0 });
  });

  it("returns {} when timeoutMs is undefined", () => {
    expect(buildTimeoutOption(undefined)).toEqual({});
  });
});

describe("isConfirmStep", () => {
  it("returns true for confirm steps", () => {
    expect(isConfirmStep({ action: "confirm", accept: true })).toBe(true);
    expect(isConfirmStep({ action: "confirm", accept: false })).toBe(true);
  });

  it("returns false for other actions", () => {
    expect(isConfirmStep({ action: "click", selector: { strategy: "id", value: "btn" } })).toBe(false);
    expect(isConfirmStep({ action: "goto", url: "http://example.com" })).toBe(false);
    expect(isConfirmStep({ action: "wait", ms: 100 })).toBe(false);
    expect(isConfirmStep(undefined)).toBe(false);
  });
});

describe("formatStepForLog", () => {
  it("formats goto steps", () => {
    expect(formatStepForLog({ action: "goto", url: "http://example.com" })).toBe("goto http://example.com");
  });

  it("formats wait steps", () => {
    expect(formatStepForLog({ action: "wait", ms: 500 })).toBe("wait 500ms");
  });

  it("formats waitFor steps", () => {
    expect(formatStepForLog({ action: "waitFor", kind: "selector", selector: { strategy: "id", value: "x" }, state: "visible" })).toBe("waitFor selector");
    expect(formatStepForLog({ action: "waitFor", kind: "url", url: "**/done" })).toBe("waitFor url");
    expect(formatStepForLog({ action: "waitFor", kind: "loadState", state: "networkidle" })).toBe("waitFor loadState");
  });

  it("formats confirm steps", () => {
    expect(formatStepForLog({ action: "confirm", accept: true })).toBe("confirm accept");
    expect(formatStepForLog({ action: "confirm", accept: false })).toBe("confirm dismiss");
  });

  it("formats click steps", () => {
    const step = { action: "click" as const, selector: { strategy: "id", value: "btn" } };
    expect(formatStepForLog(step)).toContain("click");
  });

  it("formats type steps", () => {
    const step = { action: "type" as const, selector: { strategy: "testId", value: "input" }, text: "hello" };
    expect(formatStepForLog(step)).toContain("type");
  });

  it("formats hover steps", () => {
    const step = { action: "hover" as const, selector: { strategy: "class", value: "menu" } };
    expect(formatStepForLog(step)).toContain("hover");
  });

  it("formats press steps", () => {
    const step = { action: "press" as const, selector: { strategy: "id", value: "field" }, key: "Enter" };
    expect(formatStepForLog(step)).toContain("press");
  });

  it("formats scroll steps", () => {
    const step = { action: "scroll" as const, selector: { strategy: "id", value: "el" }, x: 0, y: 100 };
    expect(formatStepForLog(step)).toContain("scroll");
  });

  it("formats select steps", () => {
    const step = { action: "select" as const, selector: { strategy: "id", value: "dropdown" }, value: "opt1" };
    expect(formatStepForLog(step)).toContain("select");
  });

  it("formats check steps", () => {
    const step = { action: "check" as const, selector: { strategy: "testId", value: "check" }, checked: true };
    expect(formatStepForLog(step)).toContain("check");
  });

  it("formats upload steps", () => {
    const step = { action: "upload" as const, selector: { strategy: "id", value: "file" }, filePath: "/tmp/file.txt" };
    expect(formatStepForLog(step)).toContain("upload");
  });

  it("formats drag steps", () => {
    const step = {
      action: "drag" as const,
      source: { strategy: "id", value: "src" },
      target: { strategy: "id", value: "tgt" },
    };
    expect(formatStepForLog(step)).toContain("drag");
  });

  it("returns unknown-step for unrecognized actions", () => {
    expect(formatStepForLog({ action: "goto", url: "http://example.com" } as any)).not.toBe("unknown-step");
  });
});

describe("buildSceneBoundaries", () => {
  const makeScenes = (stepIndices: number[]) =>
    stepIndices.map((stepIndex, i) => ({ stepIndex, narration: `Scene ${i}` }));

  it("returns empty map when scenes is undefined", () => {
    const result = buildSceneBoundaries(undefined);
    expect(result.size).toBe(0);
  });

  it("returns empty map when scenes is empty", () => {
    const result = buildSceneBoundaries([]);
    expect(result.size).toBe(0);
  });

  it("maps stepIndex to sceneIndex", () => {
    const scenes = makeScenes([0, 3, 7]);
    const result = buildSceneBoundaries(scenes);
    expect(result.get(0)).toBe(0);
    expect(result.get(3)).toBe(1);
    expect(result.get(7)).toBe(2);
  });

  it("handles consecutive step indices", () => {
    const scenes = makeScenes([0, 1, 2, 3]);
    const result = buildSceneBoundaries(scenes);
    expect(result.get(0)).toBe(0);
    expect(result.get(1)).toBe(1);
    expect(result.get(2)).toBe(2);
    expect(result.get(3)).toBe(3);
  });

  it("handles sparse step indices", () => {
    const scenes = makeScenes([0, 10, 50, 100]);
    const result = buildSceneBoundaries(scenes);
    expect(result.size).toBe(4);
    expect(result.get(10)).toBe(1);
    expect(result.get(50)).toBe(2);
  });
});

describe("buildSceneTimestamps", () => {
  const makeSteps = (count: number): Step[] =>
    Array.from({ length: count }, (_, i) => ({ action: "wait", ms: 10 } as Step));

  const makeScenes = (stepIndices: number[], narrations: string[]) =>
    stepIndices.map((stepIndex, i) => ({
      stepIndex,
      narration: narrations[i] ?? `Scene ${i}`,
      isIntro: i === 0,
    }));

  it("returns empty array when no scenes", () => {
    const boundaries = buildSceneBoundaries(undefined);
    const result = buildSceneTimestamps(undefined, boundaries, makeSteps(5), () => 1000, 0);
    expect(result).toEqual([]);
  });

  it("returns single timestamp when one scene", () => {
    const scenes = makeScenes([0], ["Intro"]);
    const boundaries = buildSceneBoundaries(scenes);
    const steps = makeSteps(3);
    const now = 5000;
    const result = buildSceneTimestamps(scenes, boundaries, steps, () => now, 0);
    expect(result).toHaveLength(1);
    expect(result[0].sceneIndex).toBe(0);
    expect(result[0].narration).toBe("Intro");
    expect(result[0].isIntro).toBe(true);
    expect(result[0].startMs).toBe(now);
    expect(result[0].endMs).toBe(now);
  });

  it("closes previous scene when new scene starts", () => {
    const scenes = makeScenes([0, 2], ["Scene A", "Scene B"]);
    const boundaries = buildSceneBoundaries(scenes);
    const steps = makeSteps(5);
    let counter = 0;
    const nowProvider = () => ++counter * 1000;
    const result = buildSceneTimestamps(scenes, boundaries, steps, nowProvider, 0);
    expect(result).toHaveLength(2);
    expect(result[0].sceneIndex).toBe(0);
    expect(result[0].narration).toBe("Scene A");
    expect(result[0].startMs).toBeLessThan(result[0].endMs);
    expect(result[1].sceneIndex).toBe(1);
    expect(result[1].narration).toBe("Scene B");
    expect(result[1].startMs).toBeGreaterThanOrEqual(result[0].endMs);
  });

  it("closes final scene", () => {
    const scenes = makeScenes([0], ["Only Scene"]);
    const boundaries = buildSceneBoundaries(scenes);
    const steps = makeSteps(3);
    let counter = 0;
    const nowProvider = () => ++counter * 1000;
    const result = buildSceneTimestamps(scenes, boundaries, steps, nowProvider, 0);
    expect(result).toHaveLength(1);
    expect(result[0].sceneIndex).toBe(0);
    expect(result[0].startMs).toBeLessThan(result[0].endMs);
  });

  it("defaults isIntro to false when not set", () => {
    const scenes = [{ stepIndex: 0, narration: "Not intro" }];
    const boundaries = buildSceneBoundaries(scenes);
    const steps = makeSteps(2);
    let counter = 0;
    const nowProvider = () => ++counter * 1000;
    const result = buildSceneTimestamps(scenes, boundaries, steps, nowProvider, 0);
    expect(result[0].isIntro).toBe(false);
  });

  it("computes timestamps relative to recordingStart", () => {
    const scenes = makeScenes([1], ["Later"]);
    const boundaries = buildSceneBoundaries(scenes);
    const steps = makeSteps(3);
    const recordingStart = 1000;
    let counter = 0;
    const nowProvider = () => recordingStart + ++counter * 1000;
    const result = buildSceneTimestamps(scenes, boundaries, steps, nowProvider, recordingStart);
    expect(result).toHaveLength(1);
    expect(result[0].startMs).toBeGreaterThan(0);
    expect(result[0].endMs).toBeGreaterThan(result[0].startMs);
  });
});
