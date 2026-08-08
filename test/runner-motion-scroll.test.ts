import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("playwright", () => ({ chromium: { launch: vi.fn() } }));

import { humanScroll } from "../src/runner/motion.js";
import { createFakePage, asPage, type FakePage } from "./helpers/fake-page.js";
import type { MotionConfig } from "../src/schemas.js";

const motion = {} as MotionConfig;

const wheelDeltas = (page: FakePage) =>
  page.mouse.wheel.mock.calls.map(([x, y]) => ({ x: x as number, y: y as number }));

const sumDeltas = (page: FakePage) =>
  wheelDeltas(page).reduce((acc, d) => ({ x: acc.x + d.x, y: acc.y + d.y }), { x: 0, y: 0 });

/**
 * humanScroll eases a scroll across several mouse.wheel calls. Each call sends
 * the *difference* between the eased target and what has been scrolled so far,
 * which is the only way to avoid rounding drift accumulating across steps — and
 * exactly where an off-by-one in the loop bounds would silently under-scroll,
 * leaving the page a few pixels short with nothing failing.
 */
describe("humanScroll", () => {
  let page: FakePage;

  beforeEach(() => {
    vi.clearAllMocks();
    page = createFakePage();
  });

  describe("total distance", () => {
    it.each([
      [0, 500],
      [0, 1000],
      [0, 137],
      [250, 0],
      [-400, 0],
      [0, -640],
      [300, 300],
      [-120, 480],
    ])("scrolls exactly (%s, %s) in total", async (dx, dy) => {
      await humanScroll(asPage(page), dx, dy, motion);

      expect(sumDeltas(page)).toEqual({ x: dx, y: dy });
    });

    // easeInOutCubic(steps/steps) must be exactly 1, otherwise the final
    // position falls short of the requested delta.
    it("lands exactly on target for a delta that does not divide evenly by the step size", async () => {
      await humanScroll(asPage(page), 0, 999, motion);

      expect(sumDeltas(page).y).toBe(999);
    });
  });

  describe("step count", () => {
    it("uses a minimum of 3 steps for a short scroll", async () => {
      await humanScroll(asPage(page), 0, 10, motion);

      expect(page.mouse.wheel).toHaveBeenCalledTimes(3);
    });

    it("scales the step count with distance at 80px per step", async () => {
      await humanScroll(asPage(page), 0, 800, motion);

      expect(page.mouse.wheel).toHaveBeenCalledTimes(10);
    });

    it("rounds the step count up", async () => {
      await humanScroll(asPage(page), 0, 801, motion);

      expect(page.mouse.wheel).toHaveBeenCalledTimes(11);
    });

    it("sizes steps by the dominant axis", async () => {
      await humanScroll(asPage(page), 800, 40, motion);

      expect(page.mouse.wheel).toHaveBeenCalledTimes(10);
    });
  });

  describe("no-op", () => {
    it("does not touch the wheel when both deltas are zero", async () => {
      await humanScroll(asPage(page), 0, 0, motion);

      expect(page.mouse.wheel).not.toHaveBeenCalled();
      expect(page.waitForTimeout).not.toHaveBeenCalled();
    });
  });

  describe("easing shape", () => {
    // Every increment must point the same way as the overall scroll; a negative
    // increment would visibly jerk the page backwards mid-scroll.
    it("never reverses direction mid-scroll", async () => {
      await humanScroll(asPage(page), 0, 640, motion);

      for (const delta of wheelDeltas(page)) {
        expect(delta.y).toBeGreaterThanOrEqual(0);
      }
    });

    it("moves fastest in the middle (ease-in-out)", async () => {
      await humanScroll(asPage(page), 0, 1600, motion);

      const deltas = wheelDeltas(page).map((d) => d.y);
      const middle = deltas[Math.floor(deltas.length / 2)];

      expect(middle).toBeGreaterThan(deltas[0]);
      expect(middle).toBeGreaterThan(deltas[deltas.length - 1]);
    });

    it("paces the steps with a wait between each", async () => {
      await humanScroll(asPage(page), 0, 800, motion);

      expect(page.waitForTimeout).toHaveBeenCalledTimes(10);
      expect(page.waitForTimeout).toHaveBeenCalledWith(16);
    });
  });
});
