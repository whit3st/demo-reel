import type { Page } from "playwright";
import type { CursorConfig, DemoReelConfig, Step, TimingConfig } from "../schemas.js";
import type { RandomSource } from "../random.js";
import type { Point, MouseState } from "./types.js";
import { resolveLocator } from "./selectors.js";
import { ensureCursorOverlay } from "./cursor.js";
import { humanType } from "./typing.js";
import { humanClick, humanMoveToLocator, humanScroll, moveMouseBezier } from "./motion.js";
import { runAssertion } from "./assertions.js";
import { prepareLocator, getLocatorCenter } from "./utils.js";
import { handleDialogForConfirmStep, getWaitFor, getWaitForSelector } from "./step-simple.js";

const applyStepDelay = async (page: Page, delayMs?: number) => {
  if (typeof delayMs === "number" && delayMs > 0) {
    await page.waitForTimeout(delayMs);
  }
};

const applyStartDelayIfNeeded = async (
  page: Page,
  timing: TimingConfig,
  startDelayApplied: boolean,
) => {
  if (startDelayApplied) {
    return true;
  }

  if (timing.afterGotoDelayMs > 0) {
    await page.waitForTimeout(timing.afterGotoDelayMs);
  }

  return true;
};

export const runWithConfirm = async (
  page: Page,
  step: Step,
  confirmStep: Extract<Step, { action: "confirm" }>,
  config: DemoReelConfig,
  state: MouseState,
  cursorStart: Point,
  resolvedCursor: CursorConfig & { start: Point },
  startDelayApplied: boolean,
  rng?: RandomSource,
): Promise<boolean> => {
  const [, updatedStartDelayApplied] = await Promise.all([
    handleDialogForConfirmStep(page, confirmStep),
    runStep(page, step, config, state, cursorStart, resolvedCursor, startDelayApplied, rng),
  ]);

  return updatedStartDelayApplied;
};

export const runStep = async (
  page: Page,
  step: Step,
  config: DemoReelConfig,
  state: MouseState,
  cursorStart: Point,
  resolvedCursor: CursorConfig & { start: Point },
  startDelayApplied: boolean,
  rng?: RandomSource,
): Promise<boolean> => {
  if (step.action === "goto") {
    await page.goto(step.url, step.waitUntil ? { waitUntil: step.waitUntil } : undefined);
    await ensureCursorOverlay(page, resolvedCursor);
    return applyStartDelayIfNeeded(page, config.timing, startDelayApplied);
  }

  if (step.action === "wait") {
    await page.waitForTimeout(step.ms);
    return startDelayApplied;
  }

  if (step.action === "confirm") {
    await handleDialogForConfirmStep(page, step);
    return startDelayApplied;
  }

  if (step.action === "waitFor") {
    if (step.kind === "selector") {
      const target = resolveLocator(page, step.selector);
      await target.waitFor({
        state: step.state,
        ...(typeof step.timeoutMs === "number" ? { timeout: step.timeoutMs } : {}),
      });
      return startDelayApplied;
    }

    if (step.kind === "url") {
      await page.waitForURL(step.url, {
        waitUntil: step.waitUntil,
        ...(typeof step.timeoutMs === "number" ? { timeout: step.timeoutMs } : {}),
      });
      await ensureCursorOverlay(page, resolvedCursor);
      return startDelayApplied;
    }

    if (step.kind === "loadState") {
      await page.waitForLoadState(
        step.state,
        typeof step.timeoutMs === "number" ? { timeout: step.timeoutMs } : undefined,
      );
      await ensureCursorOverlay(page, resolvedCursor);
      return startDelayApplied;
    }

    if (step.kind === "request") {
      await page.waitForRequest(
        step.url,
        typeof step.timeoutMs === "number" ? { timeout: step.timeoutMs } : undefined,
      );
      return startDelayApplied;
    }

    if (step.kind === "response") {
      await page.waitForResponse(
        step.url,
        typeof step.timeoutMs === "number" ? { timeout: step.timeoutMs } : undefined,
      );
      return startDelayApplied;
    }

    if (step.kind === "function") {
      await page.waitForFunction(step.expression, step.arg, {
        polling: step.polling,
        ...(typeof step.timeoutMs === "number" ? { timeout: step.timeoutMs } : {}),
      });
      return startDelayApplied;
    }
  }

  if (getWaitFor(step)) {
    const locator = resolveLocator(page, getWaitForSelector(step));
    await locator.waitFor({ state: "visible", timeout: 5000 });
    await ensureCursorOverlay(page, resolvedCursor);
  }

  if (step.action === "click") {
    const delayApplied = await applyStartDelayIfNeeded(page, config.timing, startDelayApplied);

    await applyStepDelay(page, step.delayBeforeMs);
    const target = resolveLocator(page, step.selector);
    await humanClick(page, target, state, config.motion, cursorStart, rng);
    await applyStepDelay(page, step.delayAfterMs);
    return delayApplied;
  }

  if (step.action === "hover") {
    const delayApplied = await applyStartDelayIfNeeded(page, config.timing, startDelayApplied);

    await applyStepDelay(page, step.delayBeforeMs);
    const target = resolveLocator(page, step.selector);
    await humanMoveToLocator(page, target, state, config.motion, cursorStart, rng);
    await applyStepDelay(page, step.delayAfterMs);
    return delayApplied;
  }

  if (step.action === "type") {
    const delayApplied = await applyStartDelayIfNeeded(page, config.timing, startDelayApplied);

    await applyStepDelay(page, step.delayBeforeMs);
    const target = resolveLocator(page, step.selector);
    await humanClick(page, target, state, config.motion, cursorStart, rng);
    if (step.clear) {
      await target.fill("");
    }
    await humanType(page, step.text, config.typing, step.delayMs, rng);
    await applyStepDelay(page, step.delayAfterMs);
    return delayApplied;
  }

  if (step.action === "press") {
    const delayApplied = await applyStartDelayIfNeeded(page, config.timing, startDelayApplied);

    await applyStepDelay(page, step.delayBeforeMs);
    const target = resolveLocator(page, step.selector);
    await prepareLocator(target);
    await target.focus();
    await page.keyboard.press(step.key);
    await applyStepDelay(page, step.delayAfterMs);
    return delayApplied;
  }

  if (step.action === "scroll") {
    const delayApplied = await applyStartDelayIfNeeded(page, config.timing, startDelayApplied);

    await applyStepDelay(page, step.delayBeforeMs);
    const target = resolveLocator(page, step.selector);
    await humanMoveToLocator(page, target, state, config.motion, cursorStart, rng);
    await humanScroll(page, step.x, step.y, config.motion);
    await applyStepDelay(page, step.delayAfterMs);
    return delayApplied;
  }

  if (step.action === "select") {
    const delayApplied = await applyStartDelayIfNeeded(page, config.timing, startDelayApplied);

    await applyStepDelay(page, step.delayBeforeMs);
    const target = resolveLocator(page, step.selector);
    await prepareLocator(target);
    // Drive the cursor to the select and click it before applying the value, so
    // the interaction reads as a deliberate user action instead of the value
    // teleporting in. A native <select>'s option list is an OS popup outside the
    // DOM, so the value itself is still committed via selectOption.
    await humanClick(page, target, state, config.motion, cursorStart, rng);
    await target.selectOption(step.value);
    await applyStepDelay(page, step.delayAfterMs);
    return delayApplied;
  }

  if (step.action === "check") {
    const delayApplied = await applyStartDelayIfNeeded(page, config.timing, startDelayApplied);

    await applyStepDelay(page, step.delayBeforeMs);
    const target = resolveLocator(page, step.selector);
    await prepareLocator(target);
    await target.setChecked(step.checked);
    await applyStepDelay(page, step.delayAfterMs);
    return delayApplied;
  }

  if (step.action === "upload") {
    const delayApplied = await applyStartDelayIfNeeded(page, config.timing, startDelayApplied);

    await applyStepDelay(page, step.delayBeforeMs);
    const target = resolveLocator(page, step.selector);
    // File inputs are conventionally hidden behind a styled dropzone, so don't
    // require visibility — setInputFiles works on hidden inputs. Just ensure the
    // element is attached to the DOM.
    await target.waitFor({ state: "attached" });
    await target.setInputFiles(step.filePath);
    await applyStepDelay(page, step.delayAfterMs);
    return delayApplied;
  }

  if (step.action === "drag") {
    const delayApplied = await applyStartDelayIfNeeded(page, config.timing, startDelayApplied);

    await applyStepDelay(page, step.delayBeforeMs);
    const source = resolveLocator(page, step.source);
    const target = resolveLocator(page, step.target);

    await humanMoveToLocator(page, source, state, config.motion, cursorStart, rng);
    await page.waitForTimeout(config.motion.clickDelayMs);
    await page.mouse.down();

    const sourceElement = await source.elementHandle();
    const targetElement = await target.elementHandle();
    if (sourceElement) {
      await page.evaluate((src) => {
        src.dispatchEvent(
          new DragEvent("dragstart", {
            dataTransfer: new DataTransfer(),
            bubbles: true,
            cancelable: true,
          }),
        );
      }, sourceElement);
    }

    const targetPoint = await getLocatorCenter(target);
    await moveMouseBezier(page, state, targetPoint.x, targetPoint.y, config.motion, rng);
    await page.waitForTimeout(config.motion.clickDelayMs);

    if (targetElement) {
      await page.evaluate((tgt) => {
        tgt.dispatchEvent(
          new DragEvent("drop", {
            dataTransfer: new DataTransfer(),
            bubbles: true,
            cancelable: true,
          }),
        );
      }, targetElement);
    }

    await page.mouse.up();

    if (sourceElement) {
      await page.evaluate((src) => {
        src.dispatchEvent(
          new DragEvent("dragend", {
            dataTransfer: new DataTransfer(),
            bubbles: true,
            cancelable: true,
          }),
        );
      }, sourceElement);
    }

    await applyStepDelay(page, step.delayAfterMs);
    return delayApplied;
  }

  if (
    step.action === "assertText" ||
    step.action === "assertVisible" ||
    step.action === "assertUrl" ||
    step.action === "assertCount"
  ) {
    await applyStepDelay(page, step.delayBeforeMs);
    await runAssertion(page, step);
    await applyStepDelay(page, step.delayAfterMs);
    return startDelayApplied;
  }

  return startDelayApplied;
};
