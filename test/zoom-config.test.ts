import { describe, expect, it } from "vitest";
import { demoReelConfigSchema, resolveZoom } from "../src/schemas.js";
import type { DemoReelConfigInput } from "../src/schemas.js";
import { chainsToNextTarget } from "../src/runner/steps.js";
import type { CameraController } from "../src/runner/camera.js";

/**
 * Minimal valid input config — the schema demands fully-populated cursor,
 * motion, typing and timing blocks, which are irrelevant to the camera under
 * test here.
 */
const baseConfig = (): DemoReelConfigInput =>
  ({
    video: { resolution: { width: 1280, height: 720 } },
    cursor: {
      start: { x: 100, y: 100 },
      persistPosition: false,
      type: "dot",
      size: 10,
      borderWidth: 2,
      borderColor: "#000",
      shadowColor: "#fff",
    },
    motion: {
      moveDurationMs: 500,
      moveStepsMin: 20,
      stepsPerPx: 10,
      clickDelayMs: 100,
      curve: { offsetRatio: 0.1, offsetMin: 5, offsetMax: 50, easing: "easeInOutCubic" },
    },
    typing: { baseDelayMs: 50, spaceDelayMs: 100, punctuationDelayMs: 150, enterDelayMs: 200 },
    timing: { afterGotoDelayMs: 0, endDelayMs: 0 },
    steps: [{ action: "goto", url: "https://example.com" }],
  }) as DemoReelConfigInput;

describe("zoom config schema", () => {
  it("defaults an omitted zoom block to a disabled camera", () => {
    const result = demoReelConfigSchema.parse(baseConfig());

    expect(result.video.zoom).toEqual({
      mode: "off",
      percent: 150,
      deadZone: 0.3,
      leadMs: 250,
      settleMs: 600,
    });
  });

  it("accepts and normalises a partial zoom block", () => {
    const input = baseConfig();
    input.video = { ...input.video, zoom: { mode: "auto", percent: 200 } };

    const result = demoReelConfigSchema.parse(input);

    expect(result.video.zoom).toEqual({
      mode: "auto",
      percent: 200,
      deadZone: 0.3,
      leadMs: 250,
      settleMs: 600,
    });
  });

  it("rejects out-of-range percent and unknown modes", () => {
    const badPercent = baseConfig();
    badPercent.video = { ...badPercent.video, zoom: { percent: 900 } };
    expect(demoReelConfigSchema.safeParse(badPercent).success).toBe(false);

    const badMode = baseConfig();
    badMode.video = { ...badMode.video, zoom: { mode: "cinematic" as never } };
    expect(demoReelConfigSchema.safeParse(badMode).success).toBe(false);
  });

  it("carries scene-level overrides into runtime scenes", () => {
    const { steps: _omitted, ...sceneInput } = baseConfig() as Parameters<
      typeof demoReelConfigSchema.parse
    >[0];
    sceneInput.scenes = [
      { narration: "intro", steps: [{ action: "wait", ms: 10 }] },
      {
        narration: "feature",
        steps: [{ action: "wait", ms: 10 }],
        zoom: { percent: 250, mode: "manual" },
      },
    ];

    const result = demoReelConfigSchema.parse(sceneInput);

    expect(result.scenes?.[0]?.zoom).toBeUndefined();
    expect(result.scenes?.[1]?.zoom).toEqual({ percent: 250, mode: "manual" });
  });
});

describe("resolveZoom precedence", () => {
  it("layers global ← scene ← step so later layers win field-by-field", () => {
    const merged = resolveZoom(
      { mode: "auto", percent: 150, deadZone: 0.3, leadMs: 250, settleMs: 600 },
      { percent: 220 },
      { percent: 300, settleMs: 0 },
    );

    // Step wins on the fields it sets...
    expect(merged.percent).toBe(300);
    expect(merged.settleMs).toBe(0);
    // ...and untouched fields keep their higher-layer values.
    expect(merged.mode).toBe("auto");
    expect(merged.deadZone).toBe(0.3);
    expect(merged.leadMs).toBe(250);
  });

  it("tolerates undefined layers at any position", () => {
    expect(resolveZoom(undefined, undefined)).toEqual({
      mode: "off",
      percent: 150,
      deadZone: 0.3,
      leadMs: 250,
      settleMs: 600,
    });
    expect(resolveZoom({ percent: 180 }, undefined).percent).toBe(180);
  });
});

describe("zoom step schema", () => {
  const parseStep = (step: unknown) =>
    demoReelConfigSchema.parse({ ...baseConfig(), steps: [step] });

  it("accepts a bare zoom-out", () => {
    const result = parseStep({ action: "zoom", direction: "out" });
    expect(result.steps[0]).toMatchObject({ action: "zoom", direction: "out" });
  });

  it("accepts percent with target selector and delays", () => {
    const result = parseStep({
      action: "zoom",
      percent: 220,
      target: { strategy: "testId", value: "checkout-btn" },
      delayAfterMs: 400,
    });

    expect(result.steps[0]).toMatchObject({
      action: "zoom",
      percent: 220,
      target: { strategy: "testId", value: "checkout-btn" },
      delayAfterMs: 400,
    });
  });

  it("rejects absurd percentages", () => {
    expect(() => parseStep({ action: "zoom", percent: 500 })).toThrow();
    expect(() => parseStep({ action: "zoom", percent: 5 })).toThrow();
  });
});

describe("chainsToNextTarget", () => {
  const camera = {} as CameraController;
  const ctx = (nextStep?: unknown) => ({ camera, nextStep }) as never;

  it("chains when the next auto-action targets the same selector", () => {
    const selector = { strategy: "testId", value: "same" };
    const next = { action: "click", selector };

    expect(chainsToNextTarget(ctx(next), selector)).toBe(true);
  });

  it("does not chain across different targets", () => {
    const next = { action: "click", selector: { strategy: "id", value: "other" } };
    expect(chainsToNextTarget(ctx(next), { strategy: "id", value: "same" })).toBe(false);
  });

  it("ignores non-interaction next steps like scroll and confirm", () => {
    const selector = { strategy: "id", value: "same" };
    expect(chainsToNextTarget(ctx({ action: "scroll", selector }), selector)).toBe(false);
    expect(chainsToNextTarget(ctx({ action: "confirm", accept: true }), selector)).toBe(false);
  });

  it("never chains without a next step", () => {
    expect(chainsToNextTarget(ctx(undefined), { strategy: "id", value: "x" })).toBe(false);
    expect(chainsToNextTarget(undefined, { strategy: "id", value: "x" })).toBe(false);
  });
});
