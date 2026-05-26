import type { Page } from "playwright";
import type { Step, SelectorConfig } from "../schemas.js";
import { resolveLocator } from "./selectors.js";
import { runAssertion } from "./assertions.js";
import { buildTimeoutOption } from "./utils.js";

export const handleDialogForConfirmStep = async (
  page: Page,
  step: Extract<Step, { action: "confirm" }>,
) => {
  const dialog = await page.waitForEvent("dialog", buildTimeoutOption(step.timeoutMs));
  if (step.accept) {
    await dialog.accept();
  } else {
    await dialog.dismiss();
  }
};

export const runWithConfirmSimple = async (
  page: Page,
  step: Step,
  confirmStep: Extract<Step, { action: "confirm" }>,
): Promise<void> => {
  await Promise.all([handleDialogForConfirmStep(page, confirmStep), runStepSimple(page, step)]);
};

export function getWaitFor(step: Step): boolean {
  return (step as any).waitFor === true;
}

export function getWaitForSelector(step: Step): SelectorConfig {
  return (step as any).selector ?? (step as any).source;
}

export const runStepSimple = async (page: Page, step: Step): Promise<void> => {
  if (step.action === "goto") {
    await page.goto(step.url, step.waitUntil ? { waitUntil: step.waitUntil } : undefined);
    return;
  }

  if (step.action === "wait") {
    await page.waitForTimeout(step.ms);
    return;
  }

  if (step.action === "confirm") {
    await handleDialogForConfirmStep(page, step);
    return;
  }

  if (step.action === "waitFor") {
    if (step.kind === "selector") {
      const target = resolveLocator(page, step.selector);
      await target.waitFor({
        state: step.state,
        ...buildTimeoutOption(step.timeoutMs),
      });
      return;
    }

    if (step.kind === "url") {
      await page.waitForURL(step.url, {
        waitUntil: step.waitUntil,
        ...buildTimeoutOption(step.timeoutMs),
      });
      return;
    }

    if (step.kind === "loadState") {
      await page.waitForLoadState(step.state, buildTimeoutOption(step.timeoutMs));
      return;
    }

    if (step.kind === "request") {
      await page.waitForRequest(step.url, buildTimeoutOption(step.timeoutMs));
      return;
    }

    if (step.kind === "response") {
      await page.waitForResponse(step.url, buildTimeoutOption(step.timeoutMs));
      return;
    }

    if (step.kind === "function") {
      await page.waitForFunction(step.expression, step.arg, {
        polling: step.polling,
        ...buildTimeoutOption(step.timeoutMs),
      });
      return;
    }
  }

  if (getWaitFor(step)) {
    const locator = resolveLocator(page, getWaitForSelector(step));
    await locator.waitFor({ state: "visible", timeout: 5000 });
  }

  if (step.action === "click") {
    const target = resolveLocator(page, step.selector);
    await target.click();
    return;
  }

  if (step.action === "hover") {
    const target = resolveLocator(page, step.selector);
    await target.hover();
    return;
  }

  if (step.action === "type") {
    const target = resolveLocator(page, step.selector);
    if (step.clear) {
      await target.fill(step.text);
    } else {
      await target.type(step.text);
    }
    return;
  }

  if (step.action === "press") {
    const target = resolveLocator(page, step.selector);
    await target.press(step.key);
    return;
  }

  if (step.action === "scroll") {
    const target = resolveLocator(page, step.selector);
    await target.evaluate(
      (el: HTMLElement | SVGElement, args: { x: number; y: number }) => {
        el.scrollBy({ left: args.x, top: args.y, behavior: "smooth" });
      },
      { x: step.x, y: step.y },
    );
    return;
  }

  if (step.action === "select") {
    const target = resolveLocator(page, step.selector);
    await target.selectOption(step.value);
    return;
  }

  if (step.action === "check") {
    const target = resolveLocator(page, step.selector);
    await target.setChecked(step.checked);
    return;
  }

  if (step.action === "upload") {
    const target = resolveLocator(page, step.selector);
    await target.setInputFiles(step.filePath);
    return;
  }

  if (step.action === "drag") {
    const source = resolveLocator(page, step.source);
    const target = resolveLocator(page, step.target);

    const sourceElement = await source.elementHandle();
    const targetElement = await target.elementHandle();
    if (!sourceElement || !targetElement) {
      throw new Error("Drag source or target element not found");
    }

    await page.evaluate(
      ([src, tgt]) => {
        const dataTransfer = new DataTransfer();

        src.dispatchEvent(
          new DragEvent("dragstart", { dataTransfer, bubbles: true, cancelable: true }),
        );

        tgt.dispatchEvent(
          new DragEvent("dragover", { dataTransfer, bubbles: true, cancelable: true }),
        );

        tgt.dispatchEvent(new DragEvent("drop", { dataTransfer, bubbles: true, cancelable: true }));

        src.dispatchEvent(
          new DragEvent("dragend", { dataTransfer, bubbles: true, cancelable: true }),
        );
      },
      [sourceElement, targetElement],
    );
    return;
  }

  if (
    step.action === "assertText" ||
    step.action === "assertVisible" ||
    step.action === "assertUrl" ||
    step.action === "assertCount"
  ) {
    await runAssertion(page, step);
    return;
  }
};
