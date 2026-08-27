import type { Page } from "playwright";
import type {
  CursorConfig,
  DemoReelConfig,
  SelectorConfig,
  Step,
  TimingConfig,
} from "../schemas.js";
import type { RandomSource } from "../random.js";
import type { Point, MouseState } from "./types.js";
import { resolveLocator } from "./selectors.js";
import { ensureCursorOverlay } from "./cursor.js";
import { CameraController, ensureCameraOverlay } from "./camera.js";
import { humanType } from "./typing.js";
import { humanClick, humanMoveToLocator, humanScroll, moveMouseBezier } from "./motion.js";
import { runAssertion } from "./assertions.js";
import { prepareLocator, getLocatorCenter } from "./utils.js";
import { handleDialogForConfirmStep, getWaitFor, getWaitForSelector } from "./step-simple.js";

/**
 * Auto-camera plumbing threaded through the complex runner. `nextStep` is
 * what makes engagements chain-aware: back-to-back actions on the same target
 * hold one continuous shot instead of bouncing in and out per step.
 */
export interface CameraRunContext {
  camera: CameraController;
  nextStep?: Step;
}

const AUTO_TARGET_ACTIONS = new Set(["click", "hover", "type", "fill", "press", "select", "check"]);

const sameSelector = (a?: SelectorConfig, b?: SelectorConfig) =>
  Boolean(a && b && JSON.stringify(a) === JSON.stringify(b));

export const chainsToNextTarget = (
  cameraCtx: CameraRunContext | undefined,
  selector: SelectorConfig | undefined,
): boolean => {
  const next = cameraCtx?.nextStep;
  if (!next || !AUTO_TARGET_ACTIONS.has(next.action)) {
    return false;
  }
  return sameSelector(selector, (next as { selector?: SelectorConfig }).selector);
};

/**
 * Wraps a pointer-motion segment so the camera stands down while it runs:
 * gesture endpoints were computed from element positions before the motion
 * began, and panning mid-flight would move content out from under those
 * coordinates. With an anchor engaged the page side tracks the anchor
 * instead, which holds the endpoint valid by definition.
 */
const runPointerGesture = <T>(
  camera: CameraController | undefined,
  run: () => Promise<T>,
): Promise<T> => (camera ? camera.runGesture(run) : run());

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
  cameraCtx?: CameraRunContext,
): Promise<boolean> => {
  const [, updatedStartDelayApplied] = await Promise.all([
    handleDialogForConfirmStep(page, confirmStep),
    runStep(
      page,
      step,
      config,
      state,
      cursorStart,
      resolvedCursor,
      startDelayApplied,
      rng,
      cameraCtx,
    ),
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
  cameraCtx?: CameraRunContext,
): Promise<boolean> => {
  if (step.action === "goto") {
    await page.goto(step.url, step.waitUntil ? { waitUntil: step.waitUntil } : undefined);
    await ensureCursorOverlay(page, resolvedCursor);
    // A navigation gives the page a fresh document: the init script re-registers
    // the camera with stale settings, so re-sync the live ones immediately.
    if (cameraCtx) {
      await cameraCtx.camera.ensureInstalled();
    }
    return applyStartDelayIfNeeded(page, config.timing, startDelayApplied);
  }

  if (step.action === "zoom") {
    // Explicit zoom steps are author instructions and run under every mode —
    // `video.zoom.mode` gates the AUTO camera, not manual camera work.
    const camera = cameraCtx?.camera ?? (await ensureCameraOverlay(page, config.video.zoom));
    await applyStepDelay(page, step.delayBeforeMs);
    await camera.applyZoomStep(step);
    await applyStepDelay(page, step.delayAfterMs);
    return startDelayApplied;
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
      if (cameraCtx) {
        await cameraCtx.camera.ensureInstalled();
      }
      return startDelayApplied;
    }

    if (step.kind === "loadState") {
      await page.waitForLoadState(
        step.state,
        typeof step.timeoutMs === "number" ? { timeout: step.timeoutMs } : undefined,
      );
      await ensureCursorOverlay(page, resolvedCursor);
      if (cameraCtx) {
        await cameraCtx.camera.ensureInstalled();
      }
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
    const camera = cameraCtx?.camera;

    await applyStepDelay(page, step.delayBeforeMs);
    const target = resolveLocator(page, step.selector);
    const engaged = camera?.auto ? await camera.maybeEngage(target) : false;
    await runPointerGesture(camera, () =>
      humanClick(page, target, state, config.motion, cursorStart, rng),
    );
    if (engaged && camera) {
      await camera.settle(chainsToNextTarget(cameraCtx, step.selector));
    }
    await applyStepDelay(page, step.delayAfterMs);
    return delayApplied;
  }

  if (step.action === "hover") {
    const delayApplied = await applyStartDelayIfNeeded(page, config.timing, startDelayApplied);
    const camera = cameraCtx?.camera;

    await applyStepDelay(page, step.delayBeforeMs);
    const target = resolveLocator(page, step.selector);
    const engaged = camera?.auto ? await camera.maybeEngage(target) : false;
    await runPointerGesture(camera, () =>
      humanMoveToLocator(page, target, state, config.motion, cursorStart, rng),
    );
    if (engaged && camera) {
      await camera.settle(chainsToNextTarget(cameraCtx, step.selector));
    }
    await applyStepDelay(page, step.delayAfterMs);
    return delayApplied;
  }

  if (step.action === "type") {
    const delayApplied = await applyStartDelayIfNeeded(page, config.timing, startDelayApplied);
    const camera = cameraCtx?.camera;

    await applyStepDelay(page, step.delayBeforeMs);
    const target = resolveLocator(page, step.selector);
    const engaged = camera?.auto ? await camera.maybeEngage(target) : false;
    await runPointerGesture(camera, () =>
      humanClick(page, target, state, config.motion, cursorStart, rng),
    );
    if (step.clear) {
      await target.fill("");
    }
    await humanType(page, step.text, config.typing, step.delayMs, rng);
    if (engaged && camera) {
      await camera.settle(chainsToNextTarget(cameraCtx, step.selector));
    }
    await applyStepDelay(page, step.delayAfterMs);
    return delayApplied;
  }

  if (step.action === "fill") {
    const delayApplied = await applyStartDelayIfNeeded(page, config.timing, startDelayApplied);
    const camera = cameraCtx?.camera;

    await applyStepDelay(page, step.delayBeforeMs);
    const target = resolveLocator(page, step.selector);
    // Cursor still travels to the field so the interaction reads naturally, but
    // the value is committed with fill() rather than keystrokes. Native date,
    // time and colour inputs are segmented: a click lands on whichever segment
    // is under the pointer and typed digits fill that one, so keystroke entry
    // cannot reliably set them at all.
    const engaged = camera?.auto ? await camera.maybeEngage(target) : false;
    await runPointerGesture(camera, () =>
      humanMoveToLocator(page, target, state, config.motion, cursorStart, rng),
    );
    await target.fill(step.value);
    if (engaged && camera) {
      await camera.settle(chainsToNextTarget(cameraCtx, step.selector));
    }
    await applyStepDelay(page, step.delayAfterMs);
    return delayApplied;
  }

  if (step.action === "press") {
    const delayApplied = await applyStartDelayIfNeeded(page, config.timing, startDelayApplied);
    const camera = cameraCtx?.camera;

    await applyStepDelay(page, step.delayBeforeMs);
    const target = resolveLocator(page, step.selector);
    const engaged = camera?.auto ? await camera.maybeEngage(target) : false;
    await prepareLocator(target);
    await target.focus();
    await page.keyboard.press(step.key);
    if (engaged && camera) {
      await camera.settle(chainsToNextTarget(cameraCtx, step.selector));
    }
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
    const camera = cameraCtx?.camera;

    await applyStepDelay(page, step.delayBeforeMs);
    const target = resolveLocator(page, step.selector);
    // Drive the cursor to the select and click it before applying the value, so
    // the interaction reads as a deliberate user action instead of the value
    // teleporting in. A native <select>'s option list is an OS popup outside the
    // DOM, so the value itself is still committed via selectOption.
    const engaged = camera?.auto ? await camera.maybeEngage(target) : false;
    await runPointerGesture(camera, () =>
      humanClick(page, target, state, config.motion, cursorStart, rng),
    );
    await target.selectOption(step.value);
    if (engaged && camera) {
      await camera.settle(chainsToNextTarget(cameraCtx, step.selector));
    }
    await applyStepDelay(page, step.delayAfterMs);
    return delayApplied;
  }

  if (step.action === "check") {
    const delayApplied = await applyStartDelayIfNeeded(page, config.timing, startDelayApplied);
    const camera = cameraCtx?.camera;

    await applyStepDelay(page, step.delayBeforeMs);
    const target = resolveLocator(page, step.selector);
    const engaged = camera?.auto ? await camera.maybeEngage(target) : false;
    await prepareLocator(target);
    await target.setChecked(step.checked);
    if (engaged && camera) {
      await camera.settle(chainsToNextTarget(cameraCtx, step.selector));
    }
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
    const camera = cameraCtx?.camera;

    await applyStepDelay(page, step.delayBeforeMs);
    const source = resolveLocator(page, step.source);
    const target = resolveLocator(page, step.target);

    // A drag frames its whole gesture on the source; the drop point arrives as
    // the pointer travels there, so no separate engagement for the target.
    const engaged = camera?.auto ? await camera.maybeEngage(source) : false;
    await runPointerGesture(camera, () =>
      humanMoveToLocator(page, source, state, config.motion, cursorStart, rng),
    );
    await page.waitForTimeout(config.motion.clickDelayMs);

    // Resolve both handles before touching the mouse. Skipping the drag events
    // when a handle is null used to leave mouse.down() pressed with nothing
    // dragged, so the demo carried on "successfully" — and diverged from
    // runStepSimple, which throws for the same condition.
    const sourceElement = await source.elementHandle();
    const targetElement = await target.elementHandle();
    if (!sourceElement || !targetElement) {
      throw new Error("Drag source or target element not found");
    }

    await page.mouse.down();

    await page.evaluate((src) => {
      src.dispatchEvent(
        new DragEvent("dragstart", {
          dataTransfer: new DataTransfer(),
          bubbles: true,
          cancelable: true,
        }),
      );
    }, sourceElement);

    const targetPoint = await getLocatorCenter(target);
    await runPointerGesture(camera, () =>
      moveMouseBezier(page, state, targetPoint.x, targetPoint.y, config.motion, rng),
    );
    await page.waitForTimeout(config.motion.clickDelayMs);

    await page.evaluate((tgt) => {
      tgt.dispatchEvent(
        new DragEvent("drop", {
          dataTransfer: new DataTransfer(),
          bubbles: true,
          cancelable: true,
        }),
      );
    }, targetElement);

    await page.mouse.up();

    await page.evaluate((src) => {
      src.dispatchEvent(
        new DragEvent("dragend", {
          dataTransfer: new DataTransfer(),
          bubbles: true,
          cancelable: true,
        }),
      );
    }, sourceElement);

    if (engaged && camera) {
      await camera.settle(false);
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
