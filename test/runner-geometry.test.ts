import { describe, expect, it, vi } from "vitest";

vi.mock("playwright", () => ({ chromium: { launch: vi.fn() } }));

import { getLocatorCenter, prepareLocator, clamp, applyJitter } from "../src/runner/utils.js";
import { resolveCursorStart } from "../src/runner/cursor.js";
import { createFakeLocator, createFakePage, asPage, asLocator } from "./helpers/fake-page.js";

describe("getLocatorCenter", () => {
  it("returns the centre of the bounding box", async () => {
    const locator = createFakeLocator({
      boundingBox: vi.fn().mockResolvedValue({ x: 100, y: 200, width: 50, height: 30 }),
    });

    await expect(getLocatorCenter(asLocator(locator))).resolves.toEqual({ x: 125, y: 215 });
  });

  it("handles a box at the origin", async () => {
    const locator = createFakeLocator({
      boundingBox: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 10, height: 10 }),
    });

    await expect(getLocatorCenter(asLocator(locator))).resolves.toEqual({ x: 5, y: 5 });
  });

  it("returns fractional centres for odd dimensions", async () => {
    const locator = createFakeLocator({
      boundingBox: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 5, height: 7 }),
    });

    await expect(getLocatorCenter(asLocator(locator))).resolves.toEqual({ x: 2.5, y: 3.5 });
  });

  // boundingBox() returns null for a display:none, zero-size or detached
  // element. This message is what the user sees when a demo step targets
  // something that isn't really on screen, so it has to be explanatory.
  it("throws a descriptive error when the element has no box", async () => {
    const locator = createFakeLocator({ boundingBox: vi.fn().mockResolvedValue(null) });

    await expect(getLocatorCenter(asLocator(locator))).rejects.toThrow(
      "Unable to determine bounding box for target element.",
    );
  });

  // Scrolling before measuring is the whole point: a box measured before the
  // element is scrolled into view gives coordinates the mouse cannot reach.
  it("waits for visibility and scrolls into view before measuring", async () => {
    const locator = createFakeLocator();

    await getLocatorCenter(asLocator(locator));

    expect(locator.waitFor).toHaveBeenCalledWith({ state: "visible" });
    expect(locator.waitFor.mock.invocationCallOrder[0]).toBeLessThan(
      locator.scrollIntoViewIfNeeded.mock.invocationCallOrder[0],
    );
    expect(locator.scrollIntoViewIfNeeded.mock.invocationCallOrder[0]).toBeLessThan(
      locator.boundingBox.mock.invocationCallOrder[0],
    );
  });
});

describe("prepareLocator", () => {
  it("does not measure or interact, only prepares", async () => {
    const locator = createFakeLocator();

    await prepareLocator(asLocator(locator));

    expect(locator.waitFor).toHaveBeenCalledOnce();
    expect(locator.scrollIntoViewIfNeeded).toHaveBeenCalledOnce();
    expect(locator.boundingBox).not.toHaveBeenCalled();
  });
});

describe("resolveCursorStart", () => {
  const at = (
    viewport: { width: number; height: number } | null,
    start: { x: number; y: number },
  ) => resolveCursorStart(asPage(createFakePage({ viewport })), start);

  it("leaves an in-bounds point untouched", () => {
    expect(at({ width: 1920, height: 1080 }, { x: 100, y: 200 })).toEqual({ x: 100, y: 200 });
  });

  // The last addressable pixel is width-1: a cursor at x === width sits just
  // off-screen and the overlay disappears.
  it("clamps to the last addressable pixel, not the viewport size", () => {
    expect(at({ width: 1920, height: 1080 }, { x: 5000, y: 5000 })).toEqual({ x: 1919, y: 1079 });
  });

  it("allows exactly the last pixel", () => {
    expect(at({ width: 800, height: 600 }, { x: 799, y: 599 })).toEqual({ x: 799, y: 599 });
  });

  it("clamps negative coordinates to the origin", () => {
    expect(at({ width: 800, height: 600 }, { x: -50, y: -1 })).toEqual({ x: 0, y: 0 });
  });

  it("clamps each axis independently", () => {
    expect(at({ width: 800, height: 600 }, { x: -10, y: 9999 })).toEqual({ x: 0, y: 599 });
  });

  // Math.max(0, width - 1) keeps the range valid rather than producing -1.
  it("collapses to the origin for a zero-size viewport", () => {
    expect(at({ width: 0, height: 0 }, { x: 40, y: 40 })).toEqual({ x: 0, y: 0 });
  });

  // A page with no viewport (headed browsers can report null) has no bounds to
  // clamp against, so the requested point must pass through unchanged.
  it("passes the point through when the viewport is unknown", () => {
    expect(at(null, { x: 5000, y: -20 })).toEqual({ x: 5000, y: -20 });
  });
});

describe("clamp", () => {
  it.each([
    [5, 0, 10, 5],
    [-1, 0, 10, 0],
    [11, 0, 10, 10],
    [0, 0, 10, 0],
    [10, 0, 10, 10],
  ])("clamp(%s, %s, %s) === %s", (value, min, max, expected) => {
    expect(clamp(value, min, max)).toBe(expected);
  });
});

describe("applyJitter", () => {
  it("returns the value unchanged without a random source", () => {
    expect(applyJitter(100, 0.5)).toBe(100);
  });

  it("returns 0 unchanged so an instant setting stays instant", () => {
    expect(applyJitter(0, 0.5, () => 1)).toBe(0);
  });

  it("returns the value unchanged for a non-positive jitter", () => {
    expect(applyJitter(100, 0, () => 1)).toBe(100);
  });

  it("scales up at the top of the random range", () => {
    expect(applyJitter(100, 0.2, () => 1)).toBeCloseTo(120);
  });

  it("scales down at the bottom of the random range", () => {
    expect(applyJitter(100, 0.2, () => 0)).toBeCloseTo(80);
  });

  it("leaves the value unchanged at the midpoint", () => {
    expect(applyJitter(100, 0.2, () => 0.5)).toBeCloseTo(100);
  });

  // A negative delay would be passed to waitForTimeout and throw.
  it("never returns a negative delay", () => {
    expect(applyJitter(100, 5, () => 0)).toBe(0);
  });
});
