import type { Locator } from "playwright";
import { type RandomSource } from "../random.js";
import type { Step } from "../schemas.js";

export const clamp = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, value));
};

export const applyJitter = (value: number, jitter: number, rng?: RandomSource) => {
  if (!rng || value === 0 || jitter <= 0) {
    return value;
  }

  const factor = 1 + (rng() * 2 - 1) * jitter;
  return Math.max(0, value * factor);
};

export const buildTimeoutOption = (timeoutMs?: number) => {
  if (typeof timeoutMs === "number") {
    return { timeout: timeoutMs };
  }

  return {};
};

export const isConfirmStep = (
  step: Step | undefined,
): step is Extract<Step, { action: "confirm" }> => {
  return step?.action === "confirm";
};

export const prepareLocator = async (locator: Locator) => {
  await locator.waitFor({ state: "visible" });
  await locator.scrollIntoViewIfNeeded();
};

export const getLocatorCenter = async (locator: Locator) => {
  await prepareLocator(locator);

  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("Unable to determine bounding box for target element.");
  }

  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
};
