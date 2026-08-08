import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { installCursorOverlay, ensureCursorOverlay } from "../src/runner/cursor.js";
import type { CursorConfig } from "../src/schemas.js";

/**
 * cursorScript is serialised and executed inside the page, so none of it can be
 * exercised with a mocked Page — page.evaluate mocks never run the callback.
 * It is nonetheless real logic: hotspot offsets, viewport clamping, localStorage
 * persistence and corrupt-state recovery all decide where the cursor is drawn.
 */
describe("cursor overlay in a real page", () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  const VIEWPORT = { width: 800, height: 600 };

  const dot = (overrides: Partial<CursorConfig> = {}): CursorConfig =>
    ({
      type: "dot",
      size: 20,
      borderWidth: 2,
      borderColor: "#ffffff",
      shadowColor: "#000000",
      start: { x: 0, y: 0 },
      persistPosition: false,
      ...overrides,
    }) as CursorConfig;

  const arrow = (overrides: Record<string, unknown> = {}): CursorConfig =>
    ({
      type: "svg",
      start: { x: 0, y: 0 },
      persistPosition: false,
      svg: {
        markup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 3l7 17 2.5-7.4L20 10z"/></svg>`,
        width: 24,
        height: 24,
        hotspot: { x: 0, y: 0 },
      },
      ...overrides,
    }) as CursorConfig;

  /** The translate() the overlay currently has, as numbers. */
  const cursorTranslate = () =>
    page.evaluate(() => {
      const el = document.getElementById("__pw_cursor");
      const match = el?.style.transform.match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/);
      return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
    });

  const cursorCount = () => page.locator("#__pw_cursor").count();

  /**
   * Serve the fixture from a real http origin rather than about:blank or a
   * data: URL — both give an opaque origin where localStorage throws, and the
   * persistence behaviour is precisely what needs testing. The route handler
   * means no request ever leaves the machine.
   */
  const loadFixture = (body = "") => page.goto(`http://cursor.test/?${encodeURIComponent(body)}`);

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  }, 30000);

  afterAll(async () => {
    await browser?.close();
  });

  // A fresh context and page per test. installCursorOverlay uses addInitScript,
  // which is additive for the lifetime of a page — reusing one would let an
  // earlier test's cursor config win on the next navigation (the script guards
  // on the element id, so whichever runs first creates the cursor). A shared
  // context would likewise carry localStorage between the persistence tests.
  beforeEach(async () => {
    context = await browser.newContext({ viewport: VIEWPORT });
    await context.route("http://cursor.test/**", (route) => {
      const body = decodeURIComponent(new URL(route.request().url()).search.slice(1));
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<html><body>${body}</body></html>`,
      });
    });
    page = await context.newPage();
  });

  afterEach(async () => {
    await context?.close();
  });

  describe("installation", () => {
    it("injects the cursor element into the page", async () => {
      await loadFixture();

      await installCursorOverlay(page, dot());

      await expect(cursorCount()).resolves.toBe(1);
    });

    it("resolves and returns the clamped start position", async () => {
      await loadFixture();

      const resolved = await installCursorOverlay(page, dot({ start: { x: 5000, y: 5000 } }));

      expect(resolved.start).toEqual({ x: 799, y: 599 });
    });

    // The element is guarded by id, so re-running the script after a client-side
    // navigation must not stack duplicate cursors.
    it("does not create a second cursor when installed twice", async () => {
      await loadFixture();

      await installCursorOverlay(page, dot());
      await installCursorOverlay(page, dot());

      await expect(cursorCount()).resolves.toBe(1);
    });

    it("hides the native cursor", async () => {
      await loadFixture("<button>Hi</button>");
      await installCursorOverlay(page, dot());

      const cursorStyle = await page.evaluate(
        () => getComputedStyle(document.querySelector("button")!).cursor,
      );

      expect(cursorStyle).toBe("none");
    });
  });

  describe("hotspot offset", () => {
    // The element is positioned by its top-left corner, so a round dot must be
    // shifted by half its size for its CENTRE to land on the pointer. Get this
    // wrong and the visible cursor is consistently offset from what it clicks.
    it("centres a dot cursor on the requested point", async () => {
      await loadFixture();

      await installCursorOverlay(page, dot({ size: 20, start: { x: 100, y: 100 } }));

      await expect(cursorTranslate()).resolves.toEqual({ x: 90, y: 90 });
    });

    it("scales the offset with the dot size", async () => {
      await loadFixture();

      await installCursorOverlay(page, dot({ size: 40, start: { x: 100, y: 100 } }));

      await expect(cursorTranslate()).resolves.toEqual({ x: 80, y: 80 });
    });

    // An arrow's tip is its hotspot, not its centre — a top-left hotspot means
    // no offset at all.
    it("uses the SVG hotspot rather than the centre", async () => {
      await loadFixture();

      await installCursorOverlay(page, arrow({ start: { x: 100, y: 100 } }));

      await expect(cursorTranslate()).resolves.toEqual({ x: 100, y: 100 });
    });

    it("honours a non-zero SVG hotspot", async () => {
      await loadFixture();

      await installCursorOverlay(
        page,
        arrow({
          start: { x: 100, y: 100 },
          svg: {
            markup: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'></svg>",
            width: 24,
            height: 24,
            hotspot: { x: 12, y: 6 },
          },
        }),
      );

      await expect(cursorTranslate()).resolves.toEqual({ x: 88, y: 94 });
    });
  });

  describe("viewport clamping", () => {
    it("clamps to the last addressable pixel", async () => {
      await loadFixture();

      await installCursorOverlay(page, dot({ size: 20, start: { x: 5000, y: 5000 } }));

      // Clamped to (799, 599), then offset by half the 20px dot.
      await expect(cursorTranslate()).resolves.toEqual({ x: 789, y: 589 });
    });

    it("clamps negative coordinates to the origin", async () => {
      await loadFixture();
      await installCursorOverlay(page, dot({ size: 20, start: { x: 0, y: 0 } }));

      await page.mouse.move(-50, -50);

      await expect(cursorTranslate()).resolves.toEqual({ x: -10, y: -10 });
    });
  });

  describe("mouse tracking", () => {
    it("follows the pointer", async () => {
      await loadFixture();
      await installCursorOverlay(page, dot({ size: 20 }));

      await page.mouse.move(300, 250);

      await expect(cursorTranslate()).resolves.toEqual({ x: 290, y: 240 });
    });
  });

  describe("position persistence", () => {
    const KEY = "demo-reel.cursor-position";

    it("does not touch localStorage when persistence is off", async () => {
      await loadFixture();
      await installCursorOverlay(page, dot({ persistPosition: false }));

      await page.mouse.move(120, 130);

      await expect(page.evaluate((k) => window.localStorage.getItem(k), KEY)).resolves.toBeNull();
    });

    it("stores the position under the default key", async () => {
      await loadFixture();
      await installCursorOverlay(page, dot({ persistPosition: true }));

      await page.mouse.move(120, 130);

      await expect(page.evaluate((k) => window.localStorage.getItem(k), KEY)).resolves.toBe(
        JSON.stringify({ x: 120, y: 130 }),
      );
    });

    it("honours a custom storage key", async () => {
      await loadFixture();
      await installCursorOverlay(
        page,
        dot({ persistPosition: true, storageKey: "my.cursor" } as Partial<CursorConfig>),
      );

      await page.mouse.move(60, 70);

      await expect(
        page.evaluate(() => window.localStorage.getItem("my.cursor")),
      ).resolves.toContain('"x":60');
    });

    // The stored position is what keeps the cursor from teleporting back to the
    // corner on every navigation.
    it("restores a stored position in preference to the configured start", async () => {
      await loadFixture();
      await page.evaluate(
        (k) => window.localStorage.setItem(k, JSON.stringify({ x: 200, y: 150 })),
        KEY,
      );

      await installCursorOverlay(
        page,
        dot({ size: 20, persistPosition: true, start: { x: 0, y: 0 } }),
      );

      await expect(cursorTranslate()).resolves.toEqual({ x: 190, y: 140 });
    });

    it("falls back to the configured start when nothing is stored", async () => {
      await loadFixture();

      await installCursorOverlay(
        page,
        dot({ size: 20, persistPosition: true, start: { x: 400, y: 300 } }),
      );

      await expect(cursorTranslate()).resolves.toEqual({ x: 390, y: 290 });
    });

    describe("corrupt stored state", () => {
      it.each([
        ["malformed JSON", "{not json"],
        ["a non-object", '"just a string"'],
        ["missing coordinates", "{}"],
        ["non-numeric coordinates", '{"x":"12","y":"30"}'],
        ["a null coordinate", '{"x":null,"y":10}'],
      ])("recovers from %s by using the configured start", async (_name, stored) => {
        await loadFixture();
        await page.evaluate(([k, v]) => window.localStorage.setItem(k, v), [KEY, stored] as [
          string,
          string,
        ]);

        await installCursorOverlay(
          page,
          dot({ size: 20, persistPosition: true, start: { x: 400, y: 300 } }),
        );

        await expect(cursorTranslate()).resolves.toEqual({ x: 390, y: 290 });
      });
    });
  });

  describe("ensureCursorOverlay", () => {
    // SPA re-renders can wipe the overlay out of the DOM; the demo would then
    // record with no visible cursor at all and nothing would report it.
    it("reinstates the cursor after it is removed from the DOM", async () => {
      await loadFixture();
      const resolved = await installCursorOverlay(page, dot());
      await page.evaluate(() => document.getElementById("__pw_cursor")?.remove());

      await ensureCursorOverlay(page, resolved);

      await expect(cursorCount()).resolves.toBe(1);
    });

    it("leaves an existing cursor untouched", async () => {
      await loadFixture();
      const resolved = await installCursorOverlay(page, dot({ start: { x: 50, y: 50 } }));

      await ensureCursorOverlay(page, resolved);

      await expect(cursorCount()).resolves.toBe(1);
      await expect(cursorTranslate()).resolves.toEqual({ x: 40, y: 40 });
    });
  });

  describe("rendering", () => {
    it("renders the SVG markup for an svg cursor", async () => {
      await loadFixture();

      await installCursorOverlay(page, arrow());

      await expect(page.locator("#__pw_cursor svg").count()).resolves.toBe(1);
    });

    it("sizes an svg cursor from its declared dimensions", async () => {
      await loadFixture();

      await installCursorOverlay(page, arrow());

      const box = await page.evaluate(() => {
        const style = getComputedStyle(document.getElementById("__pw_cursor")!);
        return { width: style.width, height: style.height };
      });
      expect(box).toEqual({ width: "24px", height: "24px" });
    });

    it("gives a dot cursor its border and rounded shape", async () => {
      await loadFixture();

      await installCursorOverlay(page, dot({ size: 20, borderWidth: 3, borderColor: "#ff0000" }));

      const style = await page.evaluate(() => {
        const computed = getComputedStyle(document.getElementById("__pw_cursor")!);
        return {
          borderRadius: computed.borderRadius,
          borderWidth: computed.borderTopWidth,
          borderColor: computed.borderTopColor,
        };
      });
      expect(style).toEqual({
        borderRadius: "999px",
        borderWidth: "3px",
        borderColor: "rgb(255, 0, 0)",
      });
    });

    it("does not render an svg element for a dot cursor", async () => {
      await loadFixture();

      await installCursorOverlay(page, dot());

      await expect(page.locator("#__pw_cursor svg").count()).resolves.toBe(0);
    });
  });
});
