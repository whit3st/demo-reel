import type { Step } from "./schemas.js";

/**
 * One source of truth for estimated step durations.
 *
 * Both the AI-script timing engine (`script/timing.ts`) and the narration
 * auto-sync engine (`narration-sync.ts`) budget scenes against how long their
 * steps take. They carried byte-identical copies of this table, so a tuning
 * change in one silently desynchronised the other. Pure: no I/O, no clock.
 */
export const STEP_DURATION_MS = {
  typingPerChar: 100,
  click: 700,
  goto: 2000,
  press: 200,
  scroll: 400,
  selectCheckUpload: 300,
  drag: 1000,
  default: 500,
} as const;

export function estimateStepDuration(step: Step): number {
  const delayBefore = ("delayBeforeMs" in step && step.delayBeforeMs) || 0;
  const delayAfter = ("delayAfterMs" in step && step.delayAfterMs) || 0;
  const base = delayBefore + delayAfter;

  switch (step.action) {
    case "goto":
      return base + STEP_DURATION_MS.goto;
    case "click":
    case "hover":
      return base + STEP_DURATION_MS.click;
    case "type":
      return base + step.text.length * STEP_DURATION_MS.typingPerChar;
    case "press":
      return base + STEP_DURATION_MS.press;
    case "scroll":
      return base + STEP_DURATION_MS.scroll;
    case "select":
    case "check":
    case "upload":
      return base + STEP_DURATION_MS.selectCheckUpload;
    case "drag":
      return base + STEP_DURATION_MS.drag;
    case "wait":
      return base + step.ms;
    default:
      return base + STEP_DURATION_MS.default;
  }
}

export function estimateStepsDuration(steps: readonly Step[]): number {
  return steps.reduce((total, step) => total + estimateStepDuration(step), 0);
}
