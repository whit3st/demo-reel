import { describe, it, expect, vi } from "vitest";
import type { Page } from "playwright";

import { validateSession } from "../src/auth.js";
import type { AuthValidateConfig } from "../src/schemas.js";

/**
 * Minimal fake Page — validateSession only needs goto/url/waitForTimeout and a
 * locator that reports itself visible.
 */
function fakePage(goto = vi.fn().mockResolvedValue(undefined)) {
  const locator = {
    nth: () => locator,
    first: () => locator,
    count: async () => 1,
    waitFor: async () => undefined,
  };
  const page = {
    goto,
    url: () => "https://app.example/dashboard",
    waitForTimeout: async () => undefined,
    getByTestId: () => locator,
    locator: () => locator,
  } as unknown as Page;
  return { page, goto };
}

const config: AuthValidateConfig = {
  protectedUrl: "https://app.example/dashboard",
  successIndicator: { strategy: "testId", value: "page-title" },
} as AuthValidateConfig;

describe("validateSession navigation", () => {
  // An app that polls (long-poll, websocket heartbeat, periodic refresh) never
  // reaches networkidle, so waiting for it timed out and reported a valid
  // session as "Login failed". The success indicator is awaited explicitly
  // further down, so a settled network was never the real signal.
  it("waits for domcontentloaded, not networkidle", async () => {
    const { page, goto } = fakePage();

    await validateSession(page, config, false);

    expect(goto).toHaveBeenCalledWith(config.protectedUrl, {
      waitUntil: "domcontentloaded",
    });
  });

  it("still reports a valid session when the indicator is visible", async () => {
    const { page } = fakePage();

    await expect(validateSession(page, config, false)).resolves.toBe(true);
  });
});
