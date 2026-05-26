import type { Locator, Page } from "playwright";
import type { SelectorConfig } from "../schemas.js";

export const assertRawSelector = (selector: SelectorConfig) => {
  if (
    (selector.strategy === "id" || selector.strategy === "class") &&
    (selector.value.startsWith("#") || selector.value.startsWith("."))
  ) {
    throw new Error(
      'Selector values must be raw names without "#" or "." when using id or class strategy.',
    );
  }
};

export const resolveLocatorAll = (page: Page, selector: SelectorConfig): Locator => {
  assertRawSelector(selector);

  if (selector.strategy === "testId") {
    return page.getByTestId(selector.value);
  }
  if (selector.strategy === "id") {
    return page.locator(`#${selector.value}`);
  }
  if (selector.strategy === "class") {
    return page.locator(`.${selector.value}`);
  }
  if (selector.strategy === "href") {
    return page.locator(`a[href="${selector.value}"]`);
  }
  if (selector.strategy === "data-node-id") {
    return page.locator(`[data-node-id=${selector.value}]`);
  }
  if (selector.strategy === "custom") {
    return page.locator(selector.value);
  }

  const exhaustiveCheck: never = selector.strategy;
  throw new Error(`Unsupported selector strategy: ${exhaustiveCheck}`);
};

export const resolveLocator = (page: Page, selector: SelectorConfig): Locator => {
  const locator = resolveLocatorAll(page, selector);
  return selector.index !== undefined ? locator.nth(selector.index) : locator.first();
};
