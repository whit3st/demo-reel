import { describe, expect, it } from "vitest";
import {
  capPan,
  deadZoneOverflow,
  easeInOutCubicAt,
  interpolate,
  visualToLocal,
  zoomForPercent,
} from "../src/runner/camera-math.js";

describe("deadZoneOverflow", () => {
  const viewport = { width: 800, height: 600 };
  const centre = { x: 400, y: 300 };

  it("rests while the pointer is inside the dead-zone box", () => {
    // deadZone 0.3 → box is 240x180 centred, so ±120/±90 from centre rest.
    expect(deadZoneOverflow({ x: centre.x + 100, y: centre.y }, viewport, 0.3)).toEqual({
      x: 0,
      y: 0,
    });
    expect(deadZoneOverflow({ x: centre.x, y: centre.y - 80 }, viewport, 0.3)).toEqual({
      x: 0,
      y: 0,
    });
    expect(deadZoneOverflow(centre, viewport, 0.3)).toEqual({ x: 0, y: 0 });
  });

  it("reports exactly the overflow past the box edge", () => {
    // 130 right of centre is 10px past the 120px half-width.
    expect(deadZoneOverflow({ x: centre.x + 130, y: centre.y }, viewport, 0.3)).toEqual({
      x: 10,
      y: 0,
    });
    expect(deadZoneOverflow({ x: centre.x, y: centre.y - 200 }, viewport, 0.3)).toEqual({
      x: 0,
      y: -110,
    });
  });

  it("signs the overflow toward the pointer's side", () => {
    const left = deadZoneOverflow({ x: 0, y: centre.y }, viewport, 0.3);
    const right = deadZoneOverflow({ x: 799, y: centre.y }, viewport, 0.3);
    expect(left.x).toBeLessThan(0);
    expect(right.x).toBeGreaterThan(0);
  });

  it("clamps degenerate fractions into range", () => {
    expect(deadZoneOverflow({ x: 799, y: 599 }, viewport, 2)).toEqual({ x: 0, y: 0 });
    expect(deadZoneOverflow({ x: 799, y: 599 }, viewport, -1).x).toBeGreaterThan(0);
  });
});

describe("capPan", () => {
  it("passes small pans through untouched", () => {
    expect(capPan({ x: 30, y: -40 }, 72)).toEqual({ x: 30, y: -40 });
  });

  it("scales oversized pans onto the cap along their own direction", () => {
    const capped = capPan({ x: 96, y: 128 }, 80); // magnitude 160 → half
    expect(capped.x).toBeCloseTo(48);
    expect(capped.y).toBeCloseTo(64);
  });

  it("handles the zero vector", () => {
    expect(capPan({ x: 0, y: 0 }, 72)).toEqual({ x: 0, y: 0 });
  });
});

describe("easing and interpolation", () => {
  it("interpolates linearly between zoom levels", () => {
    expect(interpolate(1, 3, 0.5)).toBe(2);
    expect(interpolate(2, 1, 1)).toBe(1);
  });

  it("keeps eased progress inside [0,1] with slow ends", () => {
    expect(easeInOutCubicAt(0)).toBe(0);
    expect(easeInOutCubicAt(1)).toBe(1);
    expect(easeInOutCubicAt(0.5)).toBeCloseTo(0.5);
    expect(easeInOutCubicAt(-0.4)).toBe(0);
    expect(easeInOutCubicAt(1.4)).toBe(1);
    expect(easeInOutCubicAt(0.25)).toBeLessThan(0.25);
    expect(easeInOutCubicAt(0.75)).toBeGreaterThan(0.75);
  });
});

describe("zoom conversions", () => {
  it("maps percent to a multiplier floor of 1", () => {
    expect(zoomForPercent(150)).toBe(1.5);
    expect(zoomForPercent(100)).toBe(1);
    expect(zoomForPercent(40)).toBe(1);
  });

  it("converts visual pixels to zoomed-local space", () => {
    expect(visualToLocal(500, 2)).toBe(250);
    expect(visualToLocal(120, 1)).toBe(120);
    expect(visualToLocal(90, 0)).toBe(90); // never divides by zero
  });
});
