import { vi } from "vitest";
import type { Page, Locator } from "playwright";

export interface FakeLocator {
  first: ReturnType<typeof vi.fn>;
  nth: ReturnType<typeof vi.fn>;
  waitFor: ReturnType<typeof vi.fn>;
  scrollIntoViewIfNeeded: ReturnType<typeof vi.fn>;
  boundingBox: ReturnType<typeof vi.fn>;
  elementHandle: ReturnType<typeof vi.fn>;
  click: ReturnType<typeof vi.fn>;
  hover: ReturnType<typeof vi.fn>;
  fill: ReturnType<typeof vi.fn>;
  type: ReturnType<typeof vi.fn>;
  press: ReturnType<typeof vi.fn>;
  evaluate: ReturnType<typeof vi.fn>;
  selectOption: ReturnType<typeof vi.fn>;
  setChecked: ReturnType<typeof vi.fn>;
  setInputFiles: ReturnType<typeof vi.fn>;
  dragTo: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  textContent: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  inputValue: ReturnType<typeof vi.fn>;
  isVisible: ReturnType<typeof vi.fn>;
}

/**
 * A Playwright Locator double. Chainable methods return the same object, so
 * `page.locator(x).first().nth(0)` keeps working without extra wiring.
 *
 * Defaults are the boring success case; pass overrides for the branch you are
 * actually exercising (e.g. `{ elementHandle: vi.fn().mockResolvedValue(null) }`
 * for the detached-element paths).
 */
export function createFakeLocator(overrides: Partial<FakeLocator> = {}): FakeLocator {
  const locator: FakeLocator = {
    first: vi.fn(() => locator),
    nth: vi.fn(() => locator),
    waitFor: vi.fn().mockResolvedValue(undefined),
    scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
    boundingBox: vi.fn().mockResolvedValue({ x: 100, y: 200, width: 50, height: 30 }),
    elementHandle: vi.fn().mockResolvedValue({ __handle: true }),
    click: vi.fn().mockResolvedValue(undefined),
    hover: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    type: vi.fn().mockResolvedValue(undefined),
    press: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(undefined),
    selectOption: vi.fn().mockResolvedValue(undefined),
    setChecked: vi.fn().mockResolvedValue(undefined),
    setInputFiles: vi.fn().mockResolvedValue(undefined),
    dragTo: vi.fn().mockResolvedValue(undefined),
    focus: vi.fn().mockResolvedValue(undefined),
    textContent: vi.fn().mockResolvedValue(""),
    count: vi.fn().mockResolvedValue(0),
    inputValue: vi.fn().mockResolvedValue(""),
    isVisible: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
  return locator;
}

export interface FakePageOptions {
  locator?: FakeLocator;
  viewport?: { width: number; height: number } | null;
  url?: string;
}

/**
 * A Playwright Page double wired to a single shared locator. Returned as a
 * loose object (not cast to Page) so tests can assert on the vi.fn()s directly;
 * use `asPage()` at the call site.
 */
export function createFakePage(options: FakePageOptions = {}) {
  const locator = options.locator ?? createFakeLocator();
  const viewport =
    options.viewport === undefined ? { width: 1920, height: 1080 } : options.viewport;

  const page = {
    __locator: locator,
    getByTestId: vi.fn(() => locator),
    getByRole: vi.fn(() => locator),
    getByText: vi.fn(() => locator),
    locator: vi.fn(() => locator),
    goto: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    waitForEvent: vi.fn().mockResolvedValue({
      accept: vi.fn().mockResolvedValue(undefined),
      dismiss: vi.fn().mockResolvedValue(undefined),
    }),
    waitForURL: vi.fn().mockResolvedValue(undefined),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    waitForRequest: vi.fn().mockResolvedValue({ url: () => "http://example.com" }),
    waitForResponse: vi.fn().mockResolvedValue({ url: () => "http://example.com" }),
    waitForFunction: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    keyboard: {
      type: vi.fn().mockResolvedValue(undefined),
      press: vi.fn().mockResolvedValue(undefined),
      down: vi.fn().mockResolvedValue(undefined),
      up: vi.fn().mockResolvedValue(undefined),
    },
    mouse: {
      move: vi.fn().mockResolvedValue(undefined),
      wheel: vi.fn().mockResolvedValue(undefined),
      down: vi.fn().mockResolvedValue(undefined),
      up: vi.fn().mockResolvedValue(undefined),
      click: vi.fn().mockResolvedValue(undefined),
    },
    viewportSize: vi.fn().mockReturnValue(viewport),
    url: vi.fn(() => options.url ?? "http://example.com/"),
    title: vi.fn().mockResolvedValue("Test"),
    addInitScript: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(Buffer.from("")),
    setContent: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };

  return page;
}

export type FakePage = ReturnType<typeof createFakePage>;

export const asPage = (page: FakePage): Page => page as unknown as Page;
export const asLocator = (locator: FakeLocator): Locator => locator as unknown as Locator;
