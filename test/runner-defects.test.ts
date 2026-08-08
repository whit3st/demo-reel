import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("playwright", () => ({ chromium: { launch: vi.fn() } }));

import { formatStepForLog } from "../src/runner.js";
import { runStep } from "../src/runner/steps.js";
import { runWithConfirmSimple } from "../src/runner/step-simple.js";
import { validateConfig } from "../src/index.js";
import { createFakePage, createFakeLocator, asPage } from "./helpers/fake-page.js";
import type { Step } from "../src/schemas.js";

describe("formatStepForLog", () => {
  // `fill` is a valid step (schemas/steps.ts) and is handled by both runners,
  // but had no branch here — so every fill step logged as "unknown-step",
  // making verbose output useless for exactly the steps people debug most.
  it("describes a fill step rather than falling through to unknown-step", () => {
    const step = {
      action: "fill",
      selector: { strategy: "id", value: "birthday" },
      value: "2024-01-01",
    } as unknown as Step;

    const log = formatStepForLog(step);

    expect(log).not.toBe("unknown-step");
    expect(log).toContain("fill");
    expect(log).toContain("birthday");
  });

  it("still reports a genuinely unrecognised action as unknown-step", () => {
    expect(formatStepForLog({ action: "teleport" } as unknown as Step)).toBe("unknown-step");
  });
});

describe("drag with a detached element", () => {
  const config = validateConfig({
    video: { resolution: "HD" },
    cursor: "dot",
    motion: "instant",
    typing: "instant",
    timing: "instant",
    steps: [{ action: "wait", ms: 0 }],
  });

  const dragStep = {
    action: "drag",
    source: { strategy: "id", value: "card" },
    target: { strategy: "id", value: "bin" },
  } as unknown as Step;

  const runDrag = (locator: ReturnType<typeof createFakeLocator>) => {
    const page = createFakePage({ locator });
    return {
      page,
      run: () =>
        runStep(
          asPage(page),
          dragStep,
          config,
          { x: 0, y: 0 },
          { x: 0, y: 0 },
          { ...config.cursor, start: { x: 0, y: 0 } },
          true,
        ),
    };
  };

  // runStepSimple throws here; the full runner silently skipped the drag events
  // while still performing mouse.down()/up(), so the demo "succeeded" having
  // dragged nothing at all. Two runners must not disagree about this.
  it("throws when the source element cannot be resolved", async () => {
    const locator = createFakeLocator({ elementHandle: vi.fn().mockResolvedValue(null) });
    const { run } = runDrag(locator);

    await expect(run()).rejects.toThrow(/drag source or target/i);
  });

  it("throws when only the target element is missing", async () => {
    const elementHandle = vi
      .fn()
      .mockResolvedValueOnce({ __handle: "source" })
      .mockResolvedValueOnce(null);
    const { run } = runDrag(createFakeLocator({ elementHandle }));

    await expect(run()).rejects.toThrow(/drag source or target/i);
  });

  it("does not press the mouse down when the drag cannot be performed", async () => {
    const locator = createFakeLocator({ elementHandle: vi.fn().mockResolvedValue(null) });
    const { page, run } = runDrag(locator);

    await expect(run()).rejects.toThrow();

    // A half-executed drag leaves the mouse button held down, which breaks
    // every subsequent step in the demo.
    expect(page.mouse.down.mock.calls.length).toBe(page.mouse.up.mock.calls.length);
  });

  it("dispatches the drag events when both elements resolve", async () => {
    const { page, run } = runDrag(createFakeLocator());

    await expect(run()).resolves.toBe(true);
    expect(page.evaluate).toHaveBeenCalled();
    expect(page.mouse.down).toHaveBeenCalled();
    expect(page.mouse.up).toHaveBeenCalled();
  });
});

describe("runWithConfirmSimple", () => {
  let unhandled: unknown[];
  let onUnhandled: (reason: unknown) => void;

  beforeEach(() => {
    unhandled = [];
    onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
  });

  afterEach(() => {
    process.off("unhandledRejection", onUnhandled);
  });

  // The step and the dialog waiter race under Promise.all. Which error wins is
  // what the user sees in the failure report, and the loser must not resurface
  // as an unhandled rejection later (Promise.all subscribes to both, so it
  // doesn't — these tests pin that, since switching to Promise.race or a
  // manual .then() chain here would silently break it).
  it("does not leave the dialog waiter unhandled when the step fails", async () => {
    const page = createFakePage();
    page.waitForEvent = vi.fn(
      () =>
        new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error("Timeout waiting for dialog")), 5);
        }),
    ) as never;
    page.locator = vi.fn(() => {
      throw new Error("step blew up");
    }) as never;
    page.getByTestId = page.locator;

    await expect(
      runWithConfirmSimple(
        asPage(page),
        { action: "click", selector: { strategy: "id", value: "go" } } as Step,
        { action: "confirm", accept: true } as Step as never,
      ),
    ).rejects.toThrow("step blew up");

    await new Promise((r) => setTimeout(r, 30));

    expect(unhandled).toEqual([]);
  });

  it("still reports the step error rather than the dialog error", async () => {
    const page = createFakePage();
    page.waitForEvent = vi.fn(() => Promise.reject(new Error("dialog never appeared"))) as never;
    page.locator = vi.fn(() => {
      throw new Error("step blew up");
    }) as never;
    page.getByTestId = page.locator;

    await expect(
      runWithConfirmSimple(
        asPage(page),
        { action: "click", selector: { strategy: "id", value: "go" } } as Step,
        { action: "confirm", accept: true } as Step as never,
      ),
    ).rejects.toThrow("step blew up");

    await new Promise((r) => setTimeout(r, 30));
    expect(unhandled).toEqual([]);
  });

  it("propagates the dialog error when the step itself succeeds", async () => {
    const page = createFakePage();
    page.waitForEvent = vi.fn(() => Promise.reject(new Error("dialog never appeared"))) as never;

    await expect(
      runWithConfirmSimple(
        asPage(page),
        { action: "click", selector: { strategy: "id", value: "go" } } as Step,
        { action: "confirm", accept: true } as Step as never,
      ),
    ).rejects.toThrow("dialog never appeared");
  });
});
