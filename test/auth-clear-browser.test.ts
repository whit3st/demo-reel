import { describe, it, expect, vi } from "vitest";
import type { BrowserContext, Page } from "playwright";

import { clearBrowserSession } from "../src/auth.js";

describe("clearBrowserSession", () => {
  // The bug this exists for: deleting the session FILE left the browser holding
  // the identity provider's cookie. The login steps then completed silently via
  // SSO and timed out waiting for a login field that never rendered.
  it("clears the context's cookies", async () => {
    const clearCookies = vi.fn().mockResolvedValue(undefined);
    await clearBrowserSession({ clearCookies } as unknown as BrowserContext);

    expect(clearCookies).toHaveBeenCalledTimes(1);
  });

  it("also clears page storage when a page is available", async () => {
    const clearCookies = vi.fn().mockResolvedValue(undefined);
    const evaluate = vi.fn().mockResolvedValue(undefined);

    await clearBrowserSession(
      { clearCookies } as unknown as BrowserContext,
      {
        evaluate,
      } as unknown as Page,
    );

    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  // Storage is origin-scoped and can be blocked; cookies are the part that
  // actually breaks SSO, so a storage failure must not abort the clear.
  it("still succeeds when page storage is unreachable", async () => {
    const clearCookies = vi.fn().mockResolvedValue(undefined);
    const evaluate = vi.fn().mockRejectedValue(new Error("storage blocked"));

    await expect(
      clearBrowserSession(
        { clearCookies } as unknown as BrowserContext,
        {
          evaluate,
        } as unknown as Page,
      ),
    ).resolves.toBeUndefined();
    expect(clearCookies).toHaveBeenCalledTimes(1);
  });
});
