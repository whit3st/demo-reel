import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import { restoreLocalStorage } from "../src/auth.js";

/**
 * restoreLocalStorage ran `page.evaluate` against whatever page it was handed.
 * In `handleAuth` that page is a freshly created one — still on `about:blank`,
 * because restoring precedes the navigation that `validateSession` performs. So
 * the lookup was `storageData[new URL("about:blank").hostname]`, i.e.
 * `storageData[""]`, which is never a key any capture writes. The restore did
 * nothing, returned successfully, and did so on every run for every consumer
 * who configured `types: ["localStorage"]`.
 *
 * The property that actually matters cannot be observed with a mocked page:
 * the values have to be in place before the FIRST script of the target origin
 * runs, or an app that reads storage during bootstrap — which is the entire
 * reason to restore it — still sees nothing.
 */
describe("restoreLocalStorage in a real context", () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  const PAGE_HTML = `<!DOCTYPE html><html><head><script>
    window.__atParse = {
      token: localStorage.getItem("token"),
      other: localStorage.getItem("other"),
    };
  </script></head><body>ok</body></html>`;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser?.close();
  });

  beforeEach(async () => {
    context = await browser.newContext();
    // Both hosts are served from the interceptor: the suite must not touch the
    // network, and the point under test is the hostname the page reports.
    await context.route("**/*", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: PAGE_HTML }),
    );
    page = await context.newPage();
  });

  afterEach(async () => {
    await context?.close();
  });

  const atParse = () => page.evaluate(() => (window as never as Record<string, unknown>).__atParse);

  it("makes restored values readable by the first script the page runs", async () => {
    await restoreLocalStorage(context, { "example.com": { token: "restored-token" } });

    await page.goto("http://example.com/");

    expect(await atParse()).toEqual({ token: "restored-token", other: null });
  });

  // The regression itself: a context whose page has not navigated yet is the
  // only state restoreSession is ever called in.
  it("works when the page is still on about:blank at restore time", async () => {
    expect(page.url()).toBe("about:blank");

    await restoreLocalStorage(context, { "example.com": { token: "from-blank" } });
    await page.goto("http://example.com/");

    expect(await atParse()).toEqual({ token: "from-blank", other: null });
  });

  it("writes nothing on an origin the session has no entry for", async () => {
    await restoreLocalStorage(context, { "example.com": { token: "restored-token" } });

    await page.goto("http://unrelated.test/");

    expect(await atParse()).toEqual({ token: null, other: null });
  });

  it("restores every key for the matching origin", async () => {
    await restoreLocalStorage(context, {
      "example.com": { token: "a", other: "b" },
      "unrelated.test": { token: "wrong" },
    });

    await page.goto("http://example.com/");

    expect(await atParse()).toEqual({ token: "a", other: "b" });
  });

  /**
   * An init script runs on every document, so the naive version would re-apply
   * the captured snapshot after each navigation — overwriting whatever the app
   * had written in the meantime. A token refreshed during the run would be
   * reverted to the stale one on the next page load, which is worse than not
   * restoring at all.
   */
  it("does not overwrite values the app updated after the restore", async () => {
    await restoreLocalStorage(context, { "example.com": { token: "restored-token" } });

    await page.goto("http://example.com/");
    await page.evaluate(() => localStorage.setItem("token", "updated-by-app"));
    await page.goto("http://example.com/");

    expect(await atParse()).toEqual({ token: "updated-by-app", other: null });
  });

  it("survives an origin where storage access throws", async () => {
    // data: URLs have an opaque origin; touching localStorage there throws.
    await restoreLocalStorage(context, { "example.com": { token: "restored-token" } });

    await page.goto("data:text/html,<p>opaque</p>");

    // The document rendered, so the init script swallowed the SecurityError
    // rather than taking the navigation down with it.
    expect(await page.textContent("p")).toBe("opaque");
  });
});

describe("restoreLocalStorage wiring", () => {
  it("registers the restore as an init script rather than evaluating it once", async () => {
    const addInitScript = vi.fn().mockResolvedValue(undefined);
    const pages = () => [];

    await restoreLocalStorage({ addInitScript, pages } as unknown as BrowserContext, {
      "example.com": { token: "t" },
    });

    expect(addInitScript).toHaveBeenCalledTimes(1);
  });

  it("does not register anything when the session carries no storage", async () => {
    const addInitScript = vi.fn().mockResolvedValue(undefined);
    const pages = () => [];

    await restoreLocalStorage({ addInitScript, pages } as unknown as BrowserContext, {});

    expect(addInitScript).not.toHaveBeenCalled();
  });
});

describe("restoreLocalStorage on a page that already navigated", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser?.close();
  });

  // The init script alone would not reach a document that is already open, and
  // callers who restore after navigating are entitled to see it take effect.
  it("applies to an open page without waiting for the next navigation", async () => {
    const context = await browser.newContext();
    await context.route("**/*", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<p>hi</p>" }),
    );
    const page = await context.newPage();
    await page.goto("http://example.com/");

    await restoreLocalStorage(context, { "example.com": { token: "immediate" } });

    expect(await page.evaluate(() => localStorage.getItem("token"))).toBe("immediate");
    await context.close();
  });
});
