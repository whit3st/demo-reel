import type { Page } from "playwright";
import type { Step } from "../schemas.js";
import { resolveLocator, resolveLocatorAll } from "./selectors.js";
import { buildTimeoutOption } from "./utils.js";

const DEFAULT_ASSERTION_TIMEOUT_MS = 5000;

const matchText = (actual: string, expected: string | RegExp, exact: boolean): boolean => {
  if (expected instanceof RegExp) return expected.test(actual);
  return exact ? actual === expected : actual.includes(expected);
};

const formatExpected = (expected: string | RegExp, modeExact?: boolean): string => {
  if (expected instanceof RegExp) return `match ${expected.toString()}`;
  return modeExact ? `equal ${JSON.stringify(expected)}` : `contain ${JSON.stringify(expected)}`;
};

type AssertionStep = Extract<
  Step,
  { action: "assertText" | "assertVisible" | "assertUrl" | "assertCount" }
>;

export const runAssertion = async (page: Page, step: AssertionStep): Promise<void> => {
  if (step.action === "assertText") {
    const target = resolveLocator(page, step.selector);
    await target.waitFor({
      state: "visible",
      ...buildTimeoutOption(step.timeoutMs ?? DEFAULT_ASSERTION_TIMEOUT_MS),
    });
    const actual = ((await target.textContent()) ?? "").trim();
    if (!matchText(actual, step.text, step.exact ?? false)) {
      throw new Error(
        `assertText failed: selector=${JSON.stringify(step.selector)} expected to ${formatExpected(step.text, step.exact)}, got ${JSON.stringify(actual)}`,
      );
    }
    return;
  }

  if (step.action === "assertVisible") {
    const target = resolveLocator(page, step.selector);
    const expectVisible = step.visible ?? true;
    const state = expectVisible ? "visible" : "hidden";
    try {
      await target.waitFor({
        state,
        ...buildTimeoutOption(step.timeoutMs ?? DEFAULT_ASSERTION_TIMEOUT_MS),
      });
    } catch (error) {
      throw new Error(
        `assertVisible failed: selector=${JSON.stringify(step.selector)} expected ${expectVisible ? "visible" : "hidden"} — ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return;
  }

  if (step.action === "assertUrl") {
    const timeoutMs = step.timeoutMs ?? DEFAULT_ASSERTION_TIMEOUT_MS;
    const exact = step.exact ?? true;
    const deadline = Date.now() + timeoutMs;
    let lastUrl = page.url();
    while (Date.now() < deadline) {
      lastUrl = page.url();
      if (step.url instanceof RegExp) {
        if (step.url.test(lastUrl)) return;
      } else if (exact ? lastUrl === step.url : lastUrl.includes(step.url)) {
        return;
      }
      await page.waitForTimeout(100);
    }
    throw new Error(
      `assertUrl failed: expected URL to ${formatExpected(step.url, exact)}, got ${JSON.stringify(lastUrl)}`,
    );
  }

  if (step.action === "assertCount") {
    const timeoutMs = step.timeoutMs ?? DEFAULT_ASSERTION_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;
    let lastCount = 0;
    while (Date.now() < deadline) {
      lastCount = await resolveLocatorAll(page, step.selector).count();
      if (lastCount === step.count) return;
      await page.waitForTimeout(100);
    }
    throw new Error(
      `assertCount failed: selector=${JSON.stringify(step.selector)} expected ${step.count}, got ${lastCount}`,
    );
  }
};
