import type { Page } from "playwright";
import { resolveLocator, resolveLocatorAll } from "../runner.js";
import type { E2EAssertion, E2ECheckpoint } from "../schemas.js";

export interface AssertionFailureDetails {
  assertion: E2EAssertion;
  target: string;
  expected: string;
  actual: string;
}

export class AssertionFailure extends Error {
  details: AssertionFailureDetails;

  constructor(details: AssertionFailureDetails) {
    super(formatAssertionFailure(details));
    this.name = "AssertionFailure";
    this.details = details;
  }
}

export const formatAssertionFailure = (details: AssertionFailureDetails): string => {
  return [
    `Assertion failed: ${details.assertion.type}`,
    `target: ${details.target}`,
    `expected: ${details.expected}`,
    `actual: ${details.actual}`,
  ].join(" | ");
};

const selectorToTarget = (assertion: E2EAssertion): string => {
  if (assertion.type === "expectUrl") {
    return "page.url";
  }
  return `${assertion.selector.strategy}:${assertion.selector.value}${assertion.selector.index !== undefined ? `[${assertion.selector.index}]` : ""}`;
};

export const evaluateAssertion = async (
  page: Page,
  assertion: E2EAssertion,
): Promise<void> => {
  if (assertion.type === "expectVisible") {
    const locator = resolveLocator(page, assertion.selector);
    const visible = await locator.isVisible();
    if (!visible) {
      throw new AssertionFailure({
        assertion,
        target: selectorToTarget(assertion),
        expected: "visible",
        actual: "hidden",
      });
    }
    return;
  }

  if (assertion.type === "expectHidden") {
    const locator = resolveLocator(page, assertion.selector);
    const hidden = await locator.isHidden();
    if (!hidden) {
      throw new AssertionFailure({
        assertion,
        target: selectorToTarget(assertion),
        expected: "hidden",
        actual: "visible",
      });
    }
    return;
  }

  if (assertion.type === "expectText") {
    const locator = resolveLocator(page, assertion.selector);
    const rawText = await locator.textContent();
    const actual = rawText ?? "";
    const contains = assertion.contains ?? true;
    const pass = contains ? actual.includes(assertion.text) : actual === assertion.text;
    if (!pass) {
      throw new AssertionFailure({
        assertion,
        target: selectorToTarget(assertion),
        expected: contains ? `text containing \"${assertion.text}\"` : `text equal to \"${assertion.text}\"`,
        actual: `text \"${actual}\"`,
      });
    }
    return;
  }

  if (assertion.type === "expectUrl") {
    const actualUrl = page.url();
    if (typeof assertion.url === "string") {
      if (actualUrl !== assertion.url) {
        throw new AssertionFailure({
          assertion,
          target: selectorToTarget(assertion),
          expected: `url \"${assertion.url}\"`,
          actual: `url \"${actualUrl}\"`,
        });
      }
      return;
    }

    if (!assertion.url.test(actualUrl)) {
      throw new AssertionFailure({
        assertion,
        target: selectorToTarget(assertion),
        expected: `url matching ${assertion.url.toString()}`,
        actual: `url \"${actualUrl}\"`,
      });
    }
    return;
  }

  if (assertion.type === "expectCount") {
    const locator = resolveLocatorAll(page, assertion.selector);
    const actualCount = await locator.count();
    if (actualCount !== assertion.count) {
      throw new AssertionFailure({
        assertion,
        target: selectorToTarget(assertion),
        expected: `count ${assertion.count}`,
        actual: `count ${actualCount}`,
      });
    }
    return;
  }
};

export const runCheckpointAssertions = async (
  page: Page,
  checkpoint: E2ECheckpoint,
): Promise<void> => {
  for (const assertion of checkpoint.expect) {
    await evaluateAssertion(page, assertion);
  }
};

const normalizeLabel = (value: string): string => value.trim();

export const selectCheckpointsForStep = (
  checkpoints: E2ECheckpoint[] | undefined,
  stepIndex: number,
): E2ECheckpoint[] => {
  if (!checkpoints || checkpoints.length === 0) {
    return [];
  }

  return checkpoints.filter((checkpoint) => checkpoint.atStep === stepIndex);
};

export const selectCheckpointsForLabel = (
  checkpoints: E2ECheckpoint[] | undefined,
  label: string,
): E2ECheckpoint[] => {
  if (!checkpoints || checkpoints.length === 0) {
    return [];
  }

  const normalized = normalizeLabel(label);
  return checkpoints.filter((checkpoint) => checkpoint.label && normalizeLabel(checkpoint.label) === normalized);
};
