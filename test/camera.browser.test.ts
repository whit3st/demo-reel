import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { installCursorOverlay } from "../src/runner/cursor.js";
import type { CursorConfig } from "../src/schemas.js";

/**
 * The camera zooms the page with CSS `zoom` while Playwright drives input
 * through CDP. Everything about that pairing — whether clicks land where the
 * locator says, how scroll units relate to visual pixels once the root is
 * zoomed, where the cursor overlay has to draw — is observable behaviour of a
 * real browser, not of any function in this repo. These tests pin that
 * behaviour. If they pass, the camera's self-calibrating design stands on
 * measured ground; if a Chromium update shifts the ground, these are the tests
 * that say so.
 */
describe("camera ground truth in a real browser", () => {
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

  /**
   * A tall fixture with targets pinned at the corners and centre of the
   * unzoomed layout, plus a probe whose only job is to report where the
   * browser says it is. Every button records its own id when clicked so the
   * tests can assert WHICH element a Playwright click landed on.
   */
  const FIXTURE = `
    <button id="tl" style="position:absolute;top:10px;left:10px;width:80px;height:40px;">tl</button>
    <button id="tr" style="position:absolute;top:10px;left:700px;width:90px;height:40px;">tr</button>
    <button id="bl" style="position:absolute;top:550px;left:10px;width:80px;height:40px;">bl</button>
    <button id="br" style="position:absolute;top:550px;left:700px;width:90px;height:40px;">br</button>
    <button id="mid" style="position:absolute;top:290px;left:360px;width:80px;height:40px;">mid</button>
    <input id="field" style="position:absolute;top:120px;left:300px;width:200px;height:32px;" />
    <div id="probe" style="position:absolute;top:400px;left:400px;width:5px;height:5px;"></div>
    <div id="far" style="position:absolute;top:2000px;left:600px;width:120px;height:60px;background:#345;">far</div>
    <div id="floor" style="position:absolute;top:2400px;left:600px;width:120px;height:60px;background:#435;">floor</div>
    <div id="wide" style="position:absolute;top:1500px;left:2600px;width:80px;height:80px;background:#543;">wide</div>
    <script>
      window.__clicked = [];
      for (const id of ["tl","tr","bl","br","mid"]) {
        document.getElementById(id).addEventListener("click", () => window.__clicked.push(id));
      }
      document.getElementById("field").addEventListener("input", (e) => {
        window.__typed = e.target.value;
      });
    </script>
  `;

  const loadFixture = () => page.goto(`http://camera.test/spike`);

  const clicked = () => page.evaluate(() => (window as any).__clicked ?? []);
  const setZoom = (z: number) =>
    page.evaluate((zoom) => {
      document.documentElement.style.zoom = String(zoom);
    }, z);
  const clearZoom = () =>
    page.evaluate(() => {
      document.documentElement.style.zoom = "";
    });

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  }, 30000);

  afterAll(async () => {
    await browser?.close();
  });

  beforeEach(async () => {
    context = await browser.newContext({ viewport: VIEWPORT });
    await context.route("http://camera.test/**", (route) => {
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<html><body style="margin:0">${FIXTURE}</body></html>`,
      });
    });
    page = await context.newPage();
  });

  afterEach(async () => {
    await context?.close();
  });

  describe("CDP input under root zoom", () => {
    it("clicks land on the intended element at every corner while zoomed 2x", async () => {
      await loadFixture();
      await setZoom(2);

      for (const id of ["tl", "tr", "bl", "br", "mid"]) {
        await page.locator(`#${id}`).click();
      }

      expect(await clicked()).toEqual(["tl", "tr", "bl", "br", "mid"]);
    });

    it("clicks land correctly while zoomed 1.5x", async () => {
      await loadFixture();
      await setZoom(1.5);

      for (const id of ["tl", "tr", "bl", "br", "mid"]) {
        await page.locator(`#${id}`).click();
      }

      expect(await clicked()).toEqual(["tl", "tr", "bl", "br", "mid"]);
    });

    it("typing reaches the focused input while zoomed", async () => {
      await loadFixture();
      await setZoom(2);

      await page.locator("#field").click();
      await page.keyboard.type("zoomed typing");

      expect(await page.evaluate(() => (window as any).__typed)).toBe("zoomed typing");
    });
  });

  describe("scroll/zoom coordinate coupling", () => {
    /**
     * Measures how many visual pixels one unit of window.scrollBy moves a
     * probe, with the root at a given zoom. The camera never assumes this
     * value — it measures it at runtime — but the measurement itself must be
     * stable and invertible, or no amount of runtime calibration helps.
     */
    const measureScrollGain = async (): Promise<{ kx: number; ky: number }> =>
      page.evaluate(() => {
        const probe = document.getElementById("probe")!;
        window.scrollTo(0, 0);
        const base = probe.getBoundingClientRect();
        window.scrollBy(0, 100);
        const steppedY = probe.getBoundingClientRect();
        const ky = (base.top - steppedY.top) / 100;
        window.scrollTo(0, 0);
        window.scrollBy(100, 0);
        const steppedX = probe.getBoundingClientRect();
        const kx = (base.left - steppedX.left) / 100;
        window.scrollTo(0, 0);
        return { kx, ky };
      });

    it("measures a stable, positive scroll gain at zoom 1", async () => {
      await loadFixture();
      const { kx, ky } = await measureScrollGain();

      expect(ky).toBeCloseTo(1, 5);
      expect(kx).toBeCloseTo(1, 5);
    });

    it("measures a stable, positive scroll gain at zoom 2", async () => {
      await loadFixture();
      await setZoom(2);

      const first = await measureScrollGain();
      const second = await measureScrollGain();

      expect(first.ky).toBeGreaterThan(0);
      expect(first.kx).toBeGreaterThan(0);
      expect(first.ky).toBeCloseTo(second.ky, 5);
      expect(first.kx).toBeCloseTo(second.kx, 5);
    });

    /**
     * The actual pan primitive: given the measured gain, compute the scroll
     * needed to bring an element's visual centre to the viewport centre, apply
     * it, and require the result to be pixel-accurate. This is exactly what
     * the camera does on engage — the test proves the arithmetic closes.
     */
    it("centers an off-screen element using the measured gain", async () => {
      await loadFixture();
      await setZoom(2);

      const centeredError = await page.evaluate(() => {
        const probe = document.getElementById("probe")!;
        window.scrollTo(0, 0);
        const base = probe.getBoundingClientRect();
        window.scrollBy(0, 100);
        const ky = (base.top - probe.getBoundingClientRect().top) / 100;
        window.scrollTo(0, 0);
        window.scrollBy(100, 0);
        const kx = (base.left - probe.getBoundingClientRect().left) / 100;
        window.scrollTo(0, 0);

        const far = document.getElementById("far")!;
        const target = far.getBoundingClientRect();
        const dx = target.left + target.width / 2 - window.innerWidth / 2;
        const dy = target.top + target.height / 2 - window.innerHeight / 2;
        window.scrollBy(kx > 0 ? dx / kx : 0, ky > 0 ? dy / ky : 0);

        const after = far.getBoundingClientRect();
        return {
          ex: after.left + after.width / 2 - window.innerWidth / 2,
          ey: after.top + after.height / 2 - window.innerHeight / 2,
        };
      });

      expect(Math.abs(centeredError.ex)).toBeLessThanOrEqual(2);
      expect(Math.abs(centeredError.ey)).toBeLessThanOrEqual(2);
    });

    /**
     * A target inside the last viewport-height of the document cannot be
     * perfectly centred — no document overscrolls its own bottom edge. The
     * browser clamps the pan at max scroll; what matters for the engine is
     * that the result is stable (further scrolls change nothing) and honest
     * (the target stays below centre rather than being yanked past it).
     */
    it("lands at max scroll for a target in the final viewport of the page", async () => {
      await loadFixture();
      await setZoom(2);

      const result = await page.evaluate(() => {
        const rectOf = () => {
          const r = document.getElementById("floor")!.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom };
        };
        const before = rectOf();
        window.scrollBy(0, 100000);
        const afterOverScroll = rectOf();
        const secondOverScroll = (window.scrollBy(0, 100000), rectOf());
        return { before, afterOverScroll, secondOverScroll, innerHeight: window.innerHeight };
      });

      expect(result.afterOverScroll.top).toBeLessThan(result.innerHeight);
      expect(result.afterOverScroll.top).toBeCloseTo(result.secondOverScroll.top, 5);
      expect(result.afterOverScroll.bottom).toBeCloseTo(result.secondOverScroll.bottom, 5);
      void result.before;
    });
  });

  describe("cursor overlay alignment under zoom", () => {
    /**
     * The overlay draws inside the zoomed root, so its translate() values are
     * interpreted in zoomed space while event clientX/Y arrive in visual
     * space. It has to compensate by the active zoom factor or the drawn
     * cursor drifts away from the real pointer as soon as zoom engages.
     */
    it("draws the cursor under the real pointer while zoomed 2x", async () => {
      await loadFixture();
      await installCursorOverlay(page, dot());
      await setZoom(2);

      await page.mouse.move(500, 380);

      const error = await page.evaluate(() => {
        const el = document.getElementById("__pw_cursor")!;
        const match = el.style.transform.match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/)!;
        const size = 20;
        const offset = size / 2;
        const zoomFactor = Number(document.documentElement.style.zoom || 1);
        const drawnX = Number(match[1]) * zoomFactor + offset * zoomFactor;
        const drawnY = Number(match[2]) * zoomFactor + offset * zoomFactor;
        return { dx: drawnX - 500, dy: drawnY - 380 };
      });

      expect(Math.abs(error.dx)).toBeLessThanOrEqual(2);
      expect(Math.abs(error.dy)).toBeLessThanOrEqual(2);
    });
  });

  describe("restoring the unzoomed world", () => {
    it("clearing zoom restores original geometry exactly", async () => {
      await loadFixture();
      const before = await page.evaluate(() => {
        const el = document.getElementById("mid")!;
        return el.getBoundingClientRect().toJSON();
      });

      await setZoom(2);
      await page.evaluate(() => window.scrollTo(0, 500));
      await clearZoom();
      await page.evaluate(() => window.scrollTo(0, 0));

      const after = await page.evaluate(() =>
        document.getElementById("mid")!.getBoundingClientRect().toJSON(),
      );

      expect(after.x).toBeCloseTo(before.x, 5);
      expect(after.y).toBeCloseTo(before.y, 5);
      expect(after.width).toBeCloseTo(before.width, 5);
    });
  });
});
