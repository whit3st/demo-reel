import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { CameraController } from "../src/runner/camera.js";
import type { ZoomSettings } from "../src/schemas.js";

/**
 * The controller's side is where timing, chaining state and CDP round-trips
 * meet the page-side script. These tests drive the real controller against a
 * real browser: engagement must land the target centred at the requested
 * zoom, following must respect the dead zone, and disengagement must put the
 * page back exactly where the demo found it.
 */
describe("camera controller in a real browser", () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  const VIEWPORT = { width: 800, height: 600 };

  const settings = (overrides: Partial<ZoomSettings> = {}): ZoomSettings => ({
    mode: "manual",
    percent: 150,
    deadZone: 0.3,
    leadMs: 120,
    settleMs: 100,
    ...overrides,
  });

  const FIXTURE = `
    <button id="near" style="position:absolute;top:280px;left:360px;width:80px;height:40px;">near</button>
    <button id="far" style="position:absolute;top:1800px;left:1100px;width:120px;height:60px;">far</button>
    <div id="spacer" style="position:absolute;top:2600px;left:0;width:10px;height:10px;"></div>
    <div style="position:absolute;top:100px;left:2600px;width:80px;height:80px;"></div>
  `;

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
    await page.goto("http://camera.test/engine");
  });

  afterEach(async () => {
    await context?.close();
  });

  const activeZoom = () => page.evaluate(() => Number(document.documentElement.style.zoom || 1));

  describe("engagement", () => {
    it("zooms in and centres the target element", async () => {
      const camera = CameraController.forPage(page, settings());
      await camera.install();

      const engaged = await camera.maybeEngage(page.locator("#far"));

      expect(engaged).toBe(true);
      await expect.poll(activeZoom).toBeCloseTo(1.5, 5);

      const offset = await page.evaluate(() => {
        const rect = document.getElementById("far")!.getBoundingClientRect();
        return {
          dx: rect.left + rect.width / 2 - window.innerWidth / 2,
          dy: rect.top + rect.height / 2 - window.innerHeight / 2,
        };
      });
      expect(Math.abs(offset.dx)).toBeLessThanOrEqual(2);
      expect(Math.abs(offset.dy)).toBeLessThanOrEqual(2);
    });

    it("reports no engagement when the camera is off", async () => {
      const camera = CameraController.forPage(page, settings({ mode: "off" }));
      await camera.install();

      const engaged = await camera.maybeEngage(page.locator("#far"));

      expect(engaged).toBe(false);
      expect(await activeZoom()).toBe(1);
    });
  });

  describe("following", () => {
    it("pans when the pointer leaves the dead zone and rests inside it", async () => {
      const camera = CameraController.forPage(page, settings());
      await camera.install();
      await camera.maybeEngage(page.locator("#near"));
      const scrollBefore = await page.evaluate(() => window.scrollY);

      // Deep into the bottom-right corner — well outside a 30% box.
      camera.follow({ x: 780, y: 580 });
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(scrollBefore);

      const afterPan = await page.evaluate(() => window.scrollY);

      // Back near centre: the frame must rest, not drift.
      for (let i = 0; i < 5; i++) {
        camera.follow({ x: 410, y: 310 });
      }
      const afterRest = await page.evaluate(() => window.scrollY);
      expect(afterRest).toBe(afterPan);
    });
  });

  describe("disengagement", () => {
    it("returns to full view and restores the pre-engagement scroll", async () => {
      const camera = CameraController.forPage(page, settings());
      await camera.install();

      // Park the page somewhere non-trivial first.
      await page.evaluate(() => window.scrollTo(300, 900));
      const originalScroll = await page.evaluate(() => ({
        x: window.scrollX,
        y: window.scrollY,
      }));

      await camera.maybeEngage(page.locator("#far"));
      await expect.poll(activeZoom).toBeGreaterThan(1.4);

      await camera.settle(false);

      await expect.poll(activeZoom).toBe(1);
      const restored = await page.evaluate(() => ({
        x: window.scrollX,
        y: window.scrollY,
      }));
      expect(restored.x).toBe(originalScroll.x);
      expect(restored.y).toBe(originalScroll.y);
    });

    it("holds the shot across chained engagements", async () => {
      const camera = CameraController.forPage(page, settings());
      await camera.install();

      await camera.maybeEngage(page.locator("#far"));
      const midChainZoom = await activeZoom();
      await camera.maybeEngage(page.locator("#far"));
      const stillZoomed = await activeZoom();

      expect(midChainZoom).toBeCloseTo(stillZoomed, 5);

      await camera.disengage();
      await expect.poll(activeZoom).toBe(1);
    });
  });

  describe("manual zoom steps", () => {
    it("applies an explicit percent without a target, keeping the view centre", async () => {
      const camera = CameraController.forPage(page, settings());
      await camera.install();
      await page.evaluate(() => window.scrollTo(200, 400));
      const centreContentBefore = await page.evaluate(() => ({
        x: window.scrollX,
        y: window.scrollY,
      }));

      await camera.applyZoomStep({ percent: 200 });
      await expect.poll(activeZoom).toBeCloseTo(2, 5);

      // Centre stability: scrolled distance from origin scales with zoom.
      const after = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
      expect(after.x).toBeGreaterThan(centreContentBefore.x);
      expect(after.y).toBeGreaterThan(centreContentBefore.y);

      await camera.applyZoomStep({ direction: "out" });
      await expect.poll(activeZoom).toBe(1);
    });

    it("treats percent <= 100 as out when no target is given", async () => {
      const camera = CameraController.forPage(page, settings());
      await camera.install();
      await camera.applyZoomStep({ percent: 180 });
      await expect.poll(activeZoom).toBeCloseTo(1.8, 5);

      await camera.applyZoomStep({ percent: 80 });
      await expect.poll(activeZoom).toBe(1);
    });

    it("engages on a target selector", async () => {
      const camera = CameraController.forPage(page, settings());
      await camera.install();

      await camera.applyZoomStep({
        percent: 160,
        target: { strategy: "id", value: "far" },
      });

      await expect.poll(activeZoom).toBeCloseTo(1.6, 5);
      const offset = await page.evaluate(() => {
        const rect = document.getElementById("far")!.getBoundingClientRect();
        return Math.hypot(
          rect.left + rect.width / 2 - window.innerWidth / 2,
          rect.top + rect.height / 2 - window.innerHeight / 2,
        );
      });
      expect(offset).toBeLessThanOrEqual(3);

      await camera.applyZoomStep({ direction: "out" });
    });
  });

  describe("settings sync", () => {
    it("propagates new dead-zone behaviour to the running camera", async () => {
      const camera = CameraController.forPage(page, settings());
      await camera.install();
      await camera.maybeEngage(page.locator("#near"));

      camera.updateSettings(settings({ mode: "auto", deadZone: 0.9 }));
      await page.waitForTimeout(50);

      const followed = await page.evaluate(
        (pt) => {
          const before = window.scrollY;
          (window as any).__dshCamera.follow(pt);
          return window.scrollY - before;
        },
        { x: 500, y: 320 },
      ); // within old 30% box? no — but within 90% box

      expect(followed).toBe(0);
    });
  });
});
