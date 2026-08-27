import type { Point } from "./types.js";

/**
 * Pure camera arithmetic. These functions are unit-tested directly and are
 * also embedded into the injected camera script by source (fn.toString()), so
 * the page-side behaviour and these tests can never drift apart. They must
 * stay dependency-free — no imports beyond types, no DOM, no Node APIs, and
 * crucially no references to other module-scope helpers: a serialised
 * function carries its body only, never its closures.
 */

export interface ViewportSize {
  width: number;
  height: number;
}

/**
 * How far the pointer sits outside the central dead-zone box, in visual
 * pixels per axis. Inside the box the frame rests; outside, the overflow is
 * exactly the distance the camera wants to cover.
 */
export const deadZoneOverflow = (
  pointer: Point,
  viewport: ViewportSize,
  deadZoneFraction: number,
): Point => {
  // Inlined clamp — this function is serialised by source into the camera
  // script, so it cannot reach for module-scope helpers.
  const clamped = Math.min(1, Math.max(0, deadZoneFraction));
  const boxWidth = viewport.width * clamped;
  const boxHeight = viewport.height * clamped;
  const centerX = viewport.width / 2;
  const centerY = viewport.height / 2;

  const overX = Math.abs(pointer.x - centerX) - boxWidth / 2;
  const overY = Math.abs(pointer.y - centerY) - boxHeight / 2;

  return {
    x: overX > 0 ? Math.sign(pointer.x - centerX) * overX : 0,
    y: overY > 0 ? Math.sign(pointer.y - centerY) * overY : 0,
  };
};

/** Cap a pan step so catch-up stays gliding rather than snapping. */
export const capPan = (delta: Point, maxPanPx: number): Point => {
  const magnitude = Math.hypot(delta.x, delta.y);
  if (magnitude <= maxPanPx || magnitude === 0) {
    return delta;
  }
  const scale = maxPanPx / magnitude;
  return { x: delta.x * scale, y: delta.y * scale };
};

export const interpolate = (from: number, to: number, t: number) => from + (to - from) * t;

export const easeInOutCubicAt = (t: number) => {
  const clamped = Math.min(1, Math.max(0, t));
  if (clamped < 0.5) {
    return 4 * clamped * clamped * clamped;
  }
  return 1 - Math.pow(-2 * clamped + 2, 3) / 2;
};

export const zoomForPercent = (percent: number) => Math.max(1, percent / 100);

/**
 * Visual pixels to zoomed-local pixels. Event clientX/Y arrive in visual
 * space; anything drawn inside the zoomed root must divide by the active
 * zoom factor to land in the same place.
 */
export const visualToLocal = (value: number, zoomFactor: number) =>
  zoomFactor === 0 ? value : value / zoomFactor;

/**
 * Per-frame pan budget while following the pointer. Tuned against the
 * runner's ~8-25ms pointer cadence: large enough to keep up across the
 * viewport within a gesture, small enough that the glide reads as camera
 * work rather than a jump cut.
 */
export const MAX_PAN_PX_PER_FRAME = 72;
