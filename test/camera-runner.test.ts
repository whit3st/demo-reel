import { describe, expect, it, vi } from "vitest";
import type { Page } from "playwright";
import { runStep } from "../src/runner/steps.js";
import { validateConfig } from "../src/index.js";
import { createFakePage, createFakeLocator, asPage } from "./helpers/fake-page.js";
import type { CameraController } from "../src/runner/camera.js";
import type { DemoReelConfig, Step } from "../src/schemas.js";

const config: DemoReelConfig = validateConfig({
  video: { resolution: "HD" },
  cursor: "dot",
  motion: "instant",
  typing: "instant",
  timing: "instant",
  steps: [{ action: "wait", ms: 0 }],
});

const stubCamera = () =>
  ({
    enabled: true,
    auto: true,
    maybeEngage: vi.fn().mockResolvedValue(true),
    follow: vi.fn(),
    settle: vi.fn().mockResolvedValue(undefined),
    disengage: vi.fn().mockResolvedValue(undefined),
    applyZoomStep: vi.fn().mockResolvedValue(undefined),
  }) as unknown as CameraController & Record<string, ReturnType<typeof vi.fn>>;

const runWith = async (step: Step, camera?: CameraController, nextStep?: Step) => {
  const locator = createFakeLocator();
  const page = createFakePage({ locator });
  await runStep(
    asPage(page) as Page,
    step,
    config,
    { initialized: false, position: { x: 0, y: 0 } },
    { x: 0, y: 0 },
    { ...config.cursor, start: { x: 0, y: 0 } },
    true,
    undefined,
    camera ? { camera, nextStep } : undefined,
  );
  return { page, locator };
};

describe("auto camera around interaction steps", () => {
  it("engages the target before a click and settles after", async () => {
    const camera = stubCamera();
    const selector = { strategy: "id", value: "btn" };
    const { locator } = await runWith(
      { action: "click", selector } as unknown as Step,
      camera as CameraController,
    );

    expect(camera.maybeEngage).toHaveBeenCalledTimes(1);
    expect(camera.maybeEngage.mock.calls[0][0]).toBe(locator);
    // No next step → not chained → settle must ease back out.
    expect(camera.settle).toHaveBeenCalledWith(false);
  });

  it("holds the shot when the next step targets the same element", async () => {
    const camera = stubCamera();
    const selector = { strategy: "testId", value: "row" };
    await runWith(
      { action: "click", selector } as unknown as Step,
      camera as CameraController,
      { action: "type", selector, text: "hi" } as unknown as Step,
    );

    expect(camera.settle).toHaveBeenCalledWith(true);
  });

  it("never touches the camera for scroll steps", async () => {
    const camera = stubCamera();
    await runWith(
      {
        action: "scroll",
        selector: { strategy: "id", value: "pane" },
        x: 0,
        y: 500,
      } as unknown as Step,
      camera as CameraController,
    );

    expect(camera.maybeEngage).not.toHaveBeenCalled();
    expect(camera.settle).not.toHaveBeenCalled();
  });

  it("runs plain when no camera context is provided", async () => {
    const { page } = await runWith({
      action: "click",
      selector: { strategy: "id", value: "btn" },
    } as unknown as Step);

    // The click still happened through the ordinary path.
    expect(page.locator).toHaveBeenCalled();
  });
});

describe("manual zoom step dispatch", () => {
  it("routes an explicit zoom step to the camera", async () => {
    const camera = stubCamera();
    const target = { strategy: "id", value: "panel" };
    await runWith(
      { action: "zoom", percent: 200, target } as unknown as Step,
      camera as CameraController,
    );

    expect(camera.applyZoomStep).toHaveBeenCalledWith(
      expect.objectContaining({ percent: 200, target }),
    );
    expect(camera.maybeEngage).not.toHaveBeenCalled();
  });

  it("works even without a pre-installed camera context", async () => {
    const { page } = await runWith({ action: "zoom", direction: "out" } as unknown as Step);

    // The lazy-install fallback evaluates the camera script against the page.
    expect(page.evaluate).toHaveBeenCalled();
  });
});

describe("pointer follow feed", () => {
  it("fires onPointerMove for every synthetic pointer position", async () => {
    const moves: Array<{ x: number; y: number }> = [];
    const seen: Array<{ x: number; y: number }> = [];
    const page = {
      mouse: {
        move: vi.fn(async (x: number, y: number) => {
          moves.push({ x, y });
          await new Promise((r) => setTimeout(r, 12));
        }),
      },
      waitForTimeout: vi.fn((ms: number) => new Promise((r) => setTimeout(r, ms))),
    } as unknown as Page;

    const { moveMouseBezier } = await import("../src/runner/motion.js");
    const state = {
      initialized: true,
      position: { x: 0, y: 0 },
      onPointerMove: (p: { x: number; y: number }) => seen.push(p),
    };

    // A real duration forces the time-driven bezier loop rather than the
    // instant single-move branch.
    const motion = {
      ...config.motion,
      moveDurationMs: 120,
      moveStepsMin: 4,
    };

    await moveMouseBezier(page, state as Parameters<typeof moveMouseBezier>[1], 120, 80, motion);

    expect(moves.length).toBeGreaterThan(2);
    expect(seen.length).toBe(moves.length);
    expect(seen[seen.length - 1]).toEqual({ x: 120, y: 80 });
  });

  it("keeps working when no observer is attached", async () => {
    const page = {
      mouse: { move: vi.fn().mockResolvedValue(undefined) },
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    } as unknown as Page;

    const { moveMouseBezier } = await import("../src/runner/motion.js");
    await moveMouseBezier(
      page,
      { initialized: true, position: { x: 0, y: 0 } } as Parameters<typeof moveMouseBezier>[1],
      40,
      40,
      config.motion,
    );

    expect(page.mouse.move).toHaveBeenCalled();
  });
});
