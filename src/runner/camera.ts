import type { ElementHandle, Locator, Page } from "playwright";
import type { ZoomSettings } from "../schemas.js";
import type { Point } from "./types.js";
import {
  capPan,
  deadZoneOverflow,
  easeInOutCubicAt,
  interpolate,
  MAX_PAN_PX_PER_FRAME,
} from "./camera-math.js";
import { resolveLocator } from "./selectors.js";
import type { SelectorConfig } from "../schemas.js";

/**
 * The virtual camera lives half in Node and half in the page. Everything
 * that decides motion is pure and unit-tested (camera-math.ts, embedded into
 * the page by source below); the page side only executes what those
 * functions decide, against live measurements taken from the browser rather
 * than assumptions about how CSS zoom maps to scroll units — that mapping is
 * browser behaviour and is pinned by test/camera.browser.test.ts instead.
 */

interface EngagePayload {
  percent: number;
  leadMs: number;
  // Serialized across CDP the handle arrives as a plain page-side Element,
  // not a Playwright wrapper — kept loose here because the wire format is
  // whatever Playwright transfers, and the page side casts on arrival.
  handle?: unknown;
}

type CameraApi = {
  version: number;
  sync: (settings: ZoomSettings) => void;
  engage: (payload: EngagePayload) => Promise<void>;
  follow: (point: Point) => void;
  leave: () => Promise<void>;
};

const cameraPageScript = (
  settings: ZoomSettings,
  fns: {
    deadZoneOverflow: typeof deadZoneOverflow;
    capPan: typeof capPan;
    interpolate: typeof interpolate;
    easeInOutCubicAt: typeof easeInOutCubicAt;
  },
  constants: { maxPanPx: number },
) => {
  const state = {
    settings,
    engaged: false,
    anchor: null as Element | null,
    originalScroll: { x: 0, y: 0 },
  };

  const activeZoom = () => Number(document.documentElement.style.zoom || 1) || 1;

  const setZoom = (z: number) => {
    document.documentElement.style.zoom = z === 1 ? "" : String(z);
  };

  /**
   * Keeps the current view centre visually stable across one zoom step. With
   * root-level CSS zoom, layout scales linearly about the canvas origin and
   * scroll units stay visual pixels (both pinned by camera.browser.test), so
   * the scroll that pins the centre is s' = (s + c)/z0 × z1 − c. Small origin
   * offsets such as default body margins shift the result by single digits of
   * pixels and are invisible at demo zoom levels; disengage restores the
   * exact pre-zoom scroll regardless.
   */
  const pinCentreBetween = (fromZ: number, toZ: number) => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    window.scrollTo(
      ((window.scrollX + cx) / fromZ) * toZ - cx,
      ((window.scrollY + cy) / fromZ) * toZ - cy,
    );
  };

  const tweenZoom = (
    fromZ: number,
    toZ: number,
    durationMs: number,
    onFrame?: (z: number, previousZ: number) => void,
  ): Promise<void> =>
    new Promise((resolve) => {
      if (durationMs <= 0 || fromZ === toZ) {
        setZoom(toZ);
        onFrame?.(toZ, fromZ);
        resolve();
        return;
      }
      const startedAt = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - startedAt) / durationMs);
        const eased = fns.easeInOutCubicAt(t);
        const previousZ = activeZoom();
        const z = fns.interpolate(fromZ, toZ, eased);
        setZoom(z);
        onFrame?.(z, previousZ);
        if (t >= 1) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

  /** Recentres the anchored element while zoom animates underneath it. */
  const trackAnchor = () => {
    if (!state.anchor || !state.anchor.isConnected) {
      return;
    }
    const rect = state.anchor.getBoundingClientRect();
    const dx = rect.left + rect.width / 2 - window.innerWidth / 2;
    const dy = rect.top + rect.height / 2 - window.innerHeight / 2;
    window.scrollBy(dx, dy);
  };

  const api: CameraApi = {
    version: 1,

    sync(next: ZoomSettings) {
      state.settings = next;
    },

    async engage({ percent, leadMs, handle }: EngagePayload) {
      const targetZoom = Math.max(1, percent / 100);
      const fromZ = activeZoom();

      // A chained engagement keeps the framing it already has; only the first
      // engagement records where "back out" means to return to.
      if (!state.engaged) {
        state.originalScroll = { x: window.scrollX, y: window.scrollY };
      }
      state.anchor = handle ? (handle as Element) : null;
      state.engaged = true;

      await tweenZoom(fromZ, targetZoom, leadMs, (_z, previousZ) => {
        if (state.anchor) {
          trackAnchor();
        } else {
          pinCentreBetween(previousZ, _z);
        }
      });
    },

    follow(point) {
      if (!state.engaged) {
        return;
      }
      const overflow = fns.deadZoneOverflow(
        point,
        { width: window.innerWidth, height: window.innerHeight },
        state.settings.deadZone,
      );
      const step = fns.capPan(overflow, constants.maxPanPx);
      if (step.x !== 0 || step.y !== 0) {
        window.scrollBy(step.x, step.y);
      }
    },

    async leave() {
      if (!state.engaged && activeZoom() === 1) {
        return;
      }
      const fromZ = activeZoom();
      const outMs = state.settings.leadMs > 0 ? state.settings.leadMs : 200;
      await tweenZoom(fromZ, 1, outMs, (_z, previousZ) => {
        pinCentreBetween(previousZ, _z);
      });
      setZoom(1);
      window.scrollTo(state.originalScroll.x, state.originalScroll.y);
      state.engaged = false;
      state.anchor = null;
    },
  };

  (window as unknown as { __dshCamera: CameraApi }).__dshCamera = api;
};

const CAMERA_FNS_SOURCE = `{
    deadZoneOverflow: ${deadZoneOverflow},
    capPan: ${capPan},
    interpolate: ${interpolate},
    easeInOutCubicAt: ${easeInOutCubicAt},
  }`;

export const buildCameraScript = (settings: ZoomSettings): string =>
  `(${cameraPageScript})(${JSON.stringify(settings)}, ${CAMERA_FNS_SOURCE}, ${JSON.stringify({
    maxPanPx: MAX_PAN_PX_PER_FRAME,
  })});`;

const controllers = new WeakMap<Page, CameraController>();

export class CameraController {
  private constructor(
    private readonly page: Page,
    private settings: ZoomSettings,
  ) {}

  /** One controller per page: settings updates flow through the live copy. */
  static forPage(page: Page, settings: ZoomSettings): CameraController {
    const existing = controllers.get(page);
    if (existing) {
      existing.updateSettings(settings);
      return existing;
    }
    const controller = new CameraController(page, settings);
    controllers.set(page, controller);
    return controller;
  }

  get enabled(): boolean {
    return this.settings.mode !== "off";
  }

  get auto(): boolean {
    return this.settings.mode === "auto";
  }

  updateSettings(settings: ZoomSettings): void {
    this.settings = settings;
    void this.page
      .evaluate((next) => {
        (
          window as unknown as { __dshCamera?: { sync: (s: ZoomSettings) => void } }
        ).__dshCamera?.sync(next);
      }, settings)
      .catch(() => {});
  }

  async install(): Promise<void> {
    await this.page.addInitScript(buildCameraScript(this.settings));
    await this.page.evaluate(buildCameraScript(this.settings));
  }

  async ensureInstalled(): Promise<void> {
    try {
      const present = await this.page.evaluate(() =>
        Boolean((window as unknown as { __dshCamera?: unknown }).__dshCamera),
      );
      if (!present) {
        await this.page.evaluate(buildCameraScript(this.settings));
      }
    } catch {
      await this.page.evaluate(buildCameraScript(this.settings)).catch(() => {});
    }
  }

  /**
   * Eases the camera onto an element before an interaction. Returns whether
   * the engagement actually happened, so callers know to settle afterwards.
   */
  async maybeEngage(locator: Locator, percentOverride?: number): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }
    let handle: ElementHandle | undefined;
    try {
      await locator.waitFor({ state: "visible", timeout: 5000 });
      handle = (await locator.elementHandle()) ?? undefined;
      const percent = percentOverride ?? this.settings.percent;
      await this.page.evaluate(
        // The wire payload keeps the handle loosely typed: Playwright transfers
        // it as a plain page-side element, and annotating stricter DOM types
        // here fights the structural check without changing what crosses.
        (payload: { percent: number; leadMs: number; handle?: unknown }) =>
          (window as unknown as { __dshCamera: CameraApi }).__dshCamera.engage(payload),
        { percent, leadMs: this.settings.leadMs, handle },
      );
      return true;
    } catch {
      return false;
    }
  }

  follow(point: Point): void {
    if (!this.enabled) {
      return;
    }
    void this.page
      .evaluate((pt) => {
        (window as unknown as { __dshCamera?: CameraApi }).__dshCamera?.follow?.(pt);
      }, point)
      .catch(() => {});
  }

  /** Holds the framing after an action, then eases back out unless chained. */
  async settle(chained: boolean): Promise<void> {
    if (chained) {
      return;
    }
    await this.page.waitForTimeout(this.settings.settleMs);
    await this.disengage();
  }

  async disengage(): Promise<void> {
    await this.page
      .evaluate(() => {
        (window as unknown as { __dshCamera?: CameraApi }).__dshCamera?.leave?.();
      })
      .catch(() => {});
  }

  /**
   * Executes a manual `{ action: "zoom" }` step. Direction resolves like the
   * docs say: explicit direction wins; otherwise percent ≤ 100 reads as out;
   * otherwise in, at the step's percent or the configured default.
   */
  async applyZoomStep(step: {
    percent?: number;
    direction?: "in" | "out";
    target?: SelectorConfig;
  }): Promise<void> {
    const wantsOut =
      step.direction === "out" ||
      (step.percent !== undefined && step.percent <= 100 && !step.target);

    if (wantsOut) {
      await this.ensureInstalled();
      await this.disengage();
      return;
    }

    if (step.target) {
      await this.maybeEngage(resolveLocator(this.page, step.target), step.percent);
      return;
    }

    const percent = Math.min(400, Math.max(100, step.percent ?? this.settings.percent));
    await this.ensureInstalled();
    await this.page.evaluate(
      (payload) => (window as unknown as { __dshCamera: CameraApi }).__dshCamera.engage(payload),
      { percent, leadMs: this.settings.leadMs },
    );
  }
}

/**
 * Installs (or reuses) the camera for a page and returns its controller.
 * Mirrors ensureCursorOverlay: safe to call repeatedly, tolerates pages mid-
 * navigation, and is what lets a zoom step work in runners that never went
 * through runDemo's installation path.
 */
export const ensureCameraOverlay = async (page: Page, settings: ZoomSettings) => {
  const controller = CameraController.forPage(page, settings);
  await controller.ensureInstalled();
  return controller;
};
