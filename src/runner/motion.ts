import type { Locator, Page } from "playwright";
import type { MotionConfig } from "../schemas.js";
import type { RandomSource } from "../random.js";
import type { Point, MouseState } from "./types.js";
import { resolveCursorStart } from "./cursor.js";
import { clamp, applyJitter, getLocatorCenter } from "./utils.js";

const MOTION_OFFSET_JITTER = 0.15;

export const cubicBezierPoint = (t: number, p0: Point, p1: Point, p2: Point, p3: Point): Point => {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;

  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  };
};

export const easeInOutCubic = (t: number) => {
  if (t < 0.5) {
    return 4 * t * t * t;
  }

  return 1 - Math.pow(-2 * t + 2, 3) / 2;
};

const easingLookup = {
  easeInOutCubic,
} as const;

export const getBezierControlPoints = (
  start: Point,
  end: Point,
  motion: MotionConfig,
  rng?: RandomSource,
) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.hypot(dx, dy);

  if (distance === 0) {
    return { control1: start, control2: end };
  }

  const dominantAxis = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
  const curveDirection = dominantAxis >= 0 ? 1 : -1;
  const perpendicular = { x: -dy / distance, y: dx / distance };
  const baseOffset = clamp(
    distance * motion.curve.offsetRatio,
    motion.curve.offsetMin,
    motion.curve.offsetMax,
  );
  const offset = applyJitter(baseOffset, MOTION_OFFSET_JITTER, rng) * curveDirection;

  return {
    control1: {
      x: start.x + dx * 0.25 + perpendicular.x * offset,
      y: start.y + dy * 0.25 + perpendicular.y * offset,
    },
    control2: {
      x: start.x + dx * 0.75 + perpendicular.x * offset,
      y: start.y + dy * 0.75 + perpendicular.y * offset,
    },
  };
};

const ensureMouseStart = async (page: Page, state: MouseState, start: Point) => {
  if (state.initialized) {
    return;
  }

  const resolvedStart = resolveCursorStart(page, start);
  await page.mouse.move(resolvedStart.x, resolvedStart.y);
  state.position = resolvedStart;
  state.initialized = true;
};

export const moveMouseBezier = async (
  page: Page,
  state: MouseState,
  targetX: number,
  targetY: number,
  motion: MotionConfig,
  rng?: RandomSource,
) => {
  const start = state.position;
  const end = { x: targetX, y: targetY };
  const distance = Math.hypot(end.x - start.x, end.y - start.y);

  if (distance === 0) {
    return;
  }

  if (motion.moveDurationMs === 0) {
    await page.mouse.move(targetX, targetY);
    state.position = end;
    return;
  }

  const stepsByDistance = Math.max(3, Math.round(distance / motion.stepsPerPx));
  const steps = Math.max(motion.moveStepsMin, stepsByDistance);
  const stepDelay = Math.max(1, Math.floor(motion.moveDurationMs / steps));
  const { control1, control2 } = getBezierControlPoints(start, end, motion, rng);
  const easing = easingLookup[motion.curve.easing];

  for (let i = 1; i <= steps; i += 1) {
    const progress = i / steps;
    const eased = easing(progress);
    const point = cubicBezierPoint(eased, start, control1, control2, end);
    await page.mouse.move(point.x, point.y);
    await page.waitForTimeout(stepDelay);
  }

  state.position = end;
};

export const humanClick = async (
  page: Page,
  locator: Locator,
  state: MouseState,
  motion: MotionConfig,
  start: Point,
  rng?: RandomSource,
) => {
  const target = await getLocatorCenter(locator);

  await ensureMouseStart(page, state, start);
  await moveMouseBezier(page, state, target.x, target.y, motion, rng);
  await page.waitForTimeout(motion.clickDelayMs);
  await page.mouse.down();
  await page.waitForTimeout(motion.clickDelayMs);
  await page.mouse.up();
};

export const humanMoveToLocator = async (
  page: Page,
  locator: Locator,
  state: MouseState,
  motion: MotionConfig,
  start: Point,
  rng?: RandomSource,
) => {
  const target = await getLocatorCenter(locator);

  await ensureMouseStart(page, state, start);
  await moveMouseBezier(page, state, target.x, target.y, motion, rng);
  return target;
};

const SCROLL_STEP_PX = 80;
const SCROLL_STEP_DELAY_MS = 16;

export const humanScroll = async (
  page: Page,
  deltaX: number,
  deltaY: number,
  _motion: MotionConfig,
) => {
  const totalDistance = Math.max(Math.abs(deltaX), Math.abs(deltaY));
  if (totalDistance === 0) {
    return;
  }

  const steps = Math.max(3, Math.ceil(totalDistance / SCROLL_STEP_PX));
  let scrolledX = 0;
  let scrolledY = 0;

  for (let i = 1; i <= steps; i += 1) {
    const eased = easeInOutCubic(i / steps);
    const targetX = Math.round(deltaX * eased);
    const targetY = Math.round(deltaY * eased);
    await page.mouse.wheel(targetX - scrolledX, targetY - scrolledY);
    scrolledX = targetX;
    scrolledY = targetY;
    await page.waitForTimeout(SCROLL_STEP_DELAY_MS);
  }
};
