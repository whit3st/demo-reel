import type { Locator, Page } from 'playwright';
import type {
  CursorConfig,
  DemoReelConfig,
  MotionConfig,
  Step,
  SelectorConfig,
  TimingConfig,
  TypingConfig,
} from './schemas.js';

type Point = {
  x: number;
  y: number;
};

type MouseState = {
  initialized: boolean;
  position: Point;
};

const clamp = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, value));
};

const applyStepDelay = async (page: Page, delayMs?: number) => {
  if (typeof delayMs === 'number' && delayMs > 0) {
    await page.waitForTimeout(delayMs);
  }
};

const assertRawSelector = (selector: SelectorConfig) => {
  if (
    (selector.strategy === 'id' || selector.strategy === 'class') &&
    (selector.value.startsWith('#') || selector.value.startsWith('.'))
  ) {
    throw new Error(
      'Selector values must be raw names without "#" or "." when using id or class strategy.'
    );
  }
};

const resolveLocator = (page: Page, selector: SelectorConfig): Locator => {
  assertRawSelector(selector);

  if (selector.strategy === 'testId') {
    return page.getByTestId(selector.value);
  }

  if (selector.strategy === 'id') {
    return page.locator(`#${selector.value}`);
  }

  if (selector.strategy === 'class') {
    return page.locator(`.${selector.value}`);
  }

  if (selector.strategy === 'href') {
    return page.locator(`a[href="${selector.value}"]`).first();
  }

  const exhaustiveCheck: never = selector.strategy;
  throw new Error(`Unsupported selector strategy: ${exhaustiveCheck}`);
};

const punctuationCharacters = new Set(['.', ',', '!', '?', ':', ';', '-']);

const getTypingDelay = (character: string, typing: TypingConfig, baseDelay: number) => {
  if (character === '\n') {
    return baseDelay + typing.enterDelayMs;
  }

  if (character === ' ') {
    return baseDelay + typing.spaceDelayMs;
  }

  if (punctuationCharacters.has(character)) {
    return baseDelay + typing.punctuationDelayMs;
  }

  return baseDelay;
};

const resolveCursorStart = (page: Page, start: Point): Point => {
  const viewport = page.viewportSize();
  if (!viewport) {
    return start;
  }

  const maxX = Math.max(0, viewport.width - 1);
  const maxY = Math.max(0, viewport.height - 1);

  return {
    x: clamp(start.x, 0, maxX),
    y: clamp(start.y, 0, maxY),
  };
};

// Cursor script that runs in browser context - uses Playwright's addInitScript
const cursorScript = (cursor: CursorConfig) => {
  const cursorId = '__pw_cursor';
  const styleId = '__pw_cursor_style';
  const storageKey = cursor.persistPosition
    ? cursor.storageKey || 'demo-reel.cursor-position'
    : null;

  const readStoredPosition = () => {
    if (!storageKey) {
      return null;
    }

    try {
      const stored = window.localStorage.getItem(storageKey);
      if (!stored) {
        return null;
      }

      const parsed = JSON.parse(stored) as { x?: number; y?: number };
      if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') {
        return null;
      }

      return { x: parsed.x, y: parsed.y };
    } catch {
      return null;
    }
  };

  const writeStoredPosition = (x: number, y: number) => {
    if (!storageKey) {
      return;
    }

    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ x, y }));
    } catch {
      return;
    }
  };

  const addCursor = () => {
    if (document.getElementById(cursorId)) {
      return;
    }

    const style = document.createElement('style');
    style.id = styleId;

    const baseStyle = `
#__pw_cursor {
  position: fixed;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 2147483647;
  transform: translate(-100px, -100px);
}
`;

    if (cursor.type === 'svg') {
      style.textContent = baseStyle + `
#__pw_cursor {
  width: ` + cursor.svg.width + `px;
  height: ` + cursor.svg.height + `px;
}
#__pw_cursor svg {
  width: 100%;
  height: 100%;
  display: block;
}
`;
    } else {
      style.textContent = baseStyle + `
#__pw_cursor {
  width: ` + cursor.size + `px;
  height: ` + cursor.size + `px;
  border: ` + cursor.borderWidth + `px solid ` + cursor.borderColor + `;
  border-radius: 999px;
  box-shadow: 0 0 0 1px ` + cursor.shadowColor + `;
}
`;
    }

    (document.head || document.documentElement).appendChild(style);

    const cursorEl = document.createElement('div');
    cursorEl.id = cursorId;
    if (cursor.type === 'svg') {
      cursorEl.innerHTML = cursor.svg.markup;
    }
    (document.body || document.documentElement).appendChild(cursorEl);

    const offset =
      cursor.type === 'svg'
        ? { x: cursor.svg.hotspot.x, y: cursor.svg.hotspot.y }
        : { x: cursor.size / 2, y: cursor.size / 2 };

    const clamp = (value: number, min: number, max: number) => {
      return Math.min(max, Math.max(min, value));
    };

    const clampToViewport = (x: number, y: number) => {
      const maxX = Math.max(0, window.innerWidth - 1);
      const maxY = Math.max(0, window.innerHeight - 1);
      return {
        x: clamp(x, 0, maxX),
        y: clamp(y, 0, maxY),
      };
    };

    const update = (x: number, y: number) => {
      const clamped = clampToViewport(x, y);
      cursorEl.style.transform = 'translate(' + (clamped.x - offset.x) + 'px, ' + (clamped.y - offset.y) + 'px)';
      writeStoredPosition(clamped.x, clamped.y);
    };

    const stored = readStoredPosition();
    if (stored) {
      update(stored.x, stored.y);
    } else {
      update(cursor.start.x, cursor.start.y);
    }

    document.addEventListener('mousemove', (event: MouseEvent) => {
      update(event.clientX, event.clientY);
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addCursor, { once: true });
  } else {
    addCursor();
  }
};

const installCursorOverlay = async (page: Page, cursor: CursorConfig) => {
  const resolvedStart = resolveCursorStart(page, cursor.start);
  const resolvedCursor = { ...cursor, start: resolvedStart };
  await page.addInitScript(cursorScript, resolvedCursor);
  await page.evaluate(cursorScript, resolvedCursor);
  return resolvedCursor;
};

const ensureCursorOverlay = async (page: Page, resolvedCursor: CursorConfig & { start: Point }) => {
  try {
    const cursorExists = await page.evaluate(() => {
      return document.getElementById('__pw_cursor') !== null;
    });
    if (!cursorExists) {
      await page.evaluate(cursorScript, resolvedCursor);
    }
  } catch {
    // Page navigated during evaluation, will be recreated on next step
  }
};

const ensureMouseStart = async (
  page: Page,
  state: MouseState,
  start: Point
) => {
  if (state.initialized) {
    return;
  }

  const resolvedStart = resolveCursorStart(page, start);
  await page.mouse.move(resolvedStart.x, resolvedStart.y);
  state.position = resolvedStart;
  state.initialized = true;
};

const prepareLocator = async (locator: Locator) => {
  await locator.waitFor({ state: 'visible' });
  await locator.scrollIntoViewIfNeeded();
};

const getLocatorCenter = async (locator: Locator) => {
  await prepareLocator(locator);

  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('Unable to determine bounding box for target element.');
  }

  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
};

const cubicBezierPoint = (
  t: number,
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point
): Point => {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;

  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  };
};

const easeInOutCubic = (t: number) => {
  if (t < 0.5) {
    return 4 * t * t * t;
  }

  return 1 - Math.pow(-2 * t + 2, 3) / 2;
};

const easingLookup = {
  easeInOutCubic,
} as const;

const getBezierControlPoints = (
  start: Point,
  end: Point,
  motion: MotionConfig
) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.hypot(dx, dy);

  if (distance === 0) {
    return { control1: start, control2: end };
  }

  const dominantAxis = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
  const curveDirection = dominantAxis >= 0 ? 1 : -1;
  const perpendicular = { x: -dy / distance, y: dx / distance };
  const offset =
    clamp(distance * motion.curve.offsetRatio, motion.curve.offsetMin, motion.curve.offsetMax) *
    curveDirection;

  return {
    control1: {
      x: start.x + dx * 0.25 + perpendicular.x * offset,
      y: start.y + dy * 0.25 + perpendicular.y * offset,
    },
    control2: {
      x: start.x + dx * 0.75 + perpendicular.x * offset,
      y: start.y + dy * 0.75 + perpendicular.y * offset,
    },
  };
};

const moveMouseBezier = async (
  page: Page,
  state: MouseState,
  targetX: number,
  targetY: number,
  motion: MotionConfig
) => {
  const start = state.position;
  const end = { x: targetX, y: targetY };
  const distance = Math.hypot(end.x - start.x, end.y - start.y);

  if (distance === 0) {
    return;
  }

  const stepsByDistance = Math.max(3, Math.round(distance / motion.stepsPerPx));
  const steps = Math.max(motion.moveStepsMin, stepsByDistance);
  const stepDelay = Math.max(1, Math.floor(motion.moveDurationMs / steps));
  const { control1, control2 } = getBezierControlPoints(start, end, motion);
  const easing = easingLookup[motion.curve.easing];

  for (let i = 1; i <= steps; i += 1) {
    const progress = i / steps;
    const eased = easing(progress);
    const point = cubicBezierPoint(eased, start, control1, control2, end);
    await page.mouse.move(point.x, point.y);
    await page.waitForTimeout(stepDelay);
  }

  state.position = end;
};

const humanClick = async (
  page: Page,
  locator: Locator,
  state: MouseState,
  motion: MotionConfig,
  start: Point
) => {
  const target = await getLocatorCenter(locator);

  await ensureMouseStart(page, state, start);
  await moveMouseBezier(page, state, target.x, target.y, motion);
  await page.waitForTimeout(motion.clickDelayMs);
  await page.mouse.down();
  await page.waitForTimeout(motion.clickDelayMs);
  await page.mouse.up();
};

const humanType = async (
  page: Page,
  text: string,
  typing: TypingConfig,
  baseDelayOverride?: number
) => {
  const baseDelay = typeof baseDelayOverride === 'number' ? baseDelayOverride : typing.baseDelayMs;

  for (const character of Array.from(text)) {
    if (character === '\n') {
      await page.keyboard.press('Enter');
    } else {
      await page.keyboard.type(character);
    }

    const delay = getTypingDelay(character, typing, baseDelay);
    if (delay > 0) {
      await page.waitForTimeout(delay);
    }
  }
};

const humanMoveToLocator = async (
  page: Page,
  locator: Locator,
  state: MouseState,
  motion: MotionConfig,
  start: Point
) => {
  const target = await getLocatorCenter(locator);

  await ensureMouseStart(page, state, start);
  await moveMouseBezier(page, state, target.x, target.y, motion);
  return target;
};

const applyStartDelayIfNeeded = async (
  page: Page,
  timing: TimingConfig,
  startDelayApplied: boolean
) => {
  if (startDelayApplied) {
    return true;
  }

  if (timing.afterGotoDelayMs > 0) {
    await page.waitForTimeout(timing.afterGotoDelayMs);
  }

  return true;
};

const buildTimeoutOption = (timeoutMs?: number) => {
  if (typeof timeoutMs === 'number') {
    return { timeout: timeoutMs };
  }

  return {};
};

export const runStepSimple = async (
  page: Page,
  step: Step
): Promise<void> => {
  if (step.action === 'goto') {
    await page.goto(step.url, step.waitUntil ? { waitUntil: step.waitUntil } : undefined);
    return;
  }

  if (step.action === 'wait') {
    await page.waitForTimeout(step.ms);
    return;
  }

  if (step.action === 'waitFor') {
    if (step.kind === 'selector') {
      const target = resolveLocator(page, step.selector);
      await target.waitFor({
        state: step.state,
        ...buildTimeoutOption(step.timeoutMs),
      });
      return;
    }

    if (step.kind === 'url') {
      await page.waitForURL(step.url, {
        waitUntil: step.waitUntil,
        ...buildTimeoutOption(step.timeoutMs),
      });
      return;
    }

    if (step.kind === 'loadState') {
      await page.waitForLoadState(step.state, buildTimeoutOption(step.timeoutMs));
      return;
    }

    if (step.kind === 'request') {
      await page.waitForRequest(step.url, buildTimeoutOption(step.timeoutMs));
      return;
    }

    if (step.kind === 'response') {
      await page.waitForResponse(step.url, buildTimeoutOption(step.timeoutMs));
      return;
    }

    if (step.kind === 'function') {
      await page.waitForFunction(step.expression, step.arg, {
        polling: step.polling,
        ...buildTimeoutOption(step.timeoutMs),
      });
      return;
    }
  }

  if (step.action === 'click') {
    const target = resolveLocator(page, step.selector);
    await target.click();
    return;
  }

  if (step.action === 'hover') {
    const target = resolveLocator(page, step.selector);
    await target.hover();
    return;
  }

  if (step.action === 'type') {
    const target = resolveLocator(page, step.selector);
    await target.fill(step.text);
    return;
  }

  if (step.action === 'press') {
    const target = resolveLocator(page, step.selector);
    await target.press(step.key);
    return;
  }

  if (step.action === 'scroll') {
    const target = resolveLocator(page, step.selector);
    await target.evaluate((el: HTMLElement | SVGElement, args: { x: number; y: number }) => {
      el.scrollBy(args.x, args.y);
    }, { x: step.x, y: step.y });
    return;
  }

  if (step.action === 'select') {
    const target = resolveLocator(page, step.selector);
    await target.selectOption(step.value);
    return;
  }

  if (step.action === 'check') {
    const target = resolveLocator(page, step.selector);
    await target.setChecked(step.checked);
    return;
  }

  if (step.action === 'upload') {
    const target = resolveLocator(page, step.selector);
    await target.setInputFiles(step.filePath);
    return;
  }

  if (step.action === 'drag') {
    const source = resolveLocator(page, step.source);
    const target = resolveLocator(page, step.target);
    await source.dragTo(target);
    return;
  }
};

const runStep = async (
  page: Page,
  step: Step,
  config: DemoReelConfig,
  state: MouseState,
  cursorStart: Point,
  resolvedCursor: CursorConfig & { start: Point },
  startDelayApplied: boolean
): Promise<boolean> => {
  if (step.action === 'goto') {
    await page.goto(step.url, step.waitUntil ? { waitUntil: step.waitUntil } : undefined);
    await ensureCursorOverlay(page, resolvedCursor);
    return applyStartDelayIfNeeded(page, config.timing, startDelayApplied);
  }

  if (step.action === 'wait') {
    await page.waitForTimeout(step.ms);
    return startDelayApplied;
  }

  if (step.action === 'waitFor') {
    if (step.kind === 'selector') {
      const target = resolveLocator(page, step.selector);
      await target.waitFor({
        state: step.state,
        ...buildTimeoutOption(step.timeoutMs),
      });
      return startDelayApplied;
    }

    if (step.kind === 'url') {
      await page.waitForURL(step.url, {
        waitUntil: step.waitUntil,
        ...buildTimeoutOption(step.timeoutMs),
      });
      return startDelayApplied;
    }

    if (step.kind === 'loadState') {
      await page.waitForLoadState(step.state, buildTimeoutOption(step.timeoutMs));
      await ensureCursorOverlay(page, resolvedCursor);
      return startDelayApplied;
    }

    if (step.kind === 'request') {
      await page.waitForRequest(step.url, buildTimeoutOption(step.timeoutMs));
      return startDelayApplied;
    }

    if (step.kind === 'response') {
      await page.waitForResponse(step.url, buildTimeoutOption(step.timeoutMs));
      return startDelayApplied;
    }

    if (step.kind === 'function') {
      await page.waitForFunction(step.expression, step.arg, {
        polling: step.polling,
        ...buildTimeoutOption(step.timeoutMs),
      });
      return startDelayApplied;
    }
  }

  if (step.action === 'click') {
    const delayApplied = await applyStartDelayIfNeeded(
      page,
      config.timing,
      startDelayApplied
    );

    await applyStepDelay(page, step.delayBeforeMs);
    const target = resolveLocator(page, step.selector);
    await humanClick(page, target, state, config.motion, cursorStart);
    await applyStepDelay(page, step.delayAfterMs);
    return delayApplied;
  }

  if (step.action === 'hover') {
    const delayApplied = await applyStartDelayIfNeeded(
      page,
      config.timing,
      startDelayApplied
    );

    await applyStepDelay(page, step.delayBeforeMs);
    const target = resolveLocator(page, step.selector);
    await humanMoveToLocator(page, target, state, config.motion, cursorStart);
    await applyStepDelay(page, step.delayAfterMs);
    return delayApplied;
  }

  if (step.action === 'type') {
    const delayApplied = await applyStartDelayIfNeeded(
      page,
      config.timing,
      startDelayApplied
    );

    await applyStepDelay(page, step.delayBeforeMs);
    const target = resolveLocator(page, step.selector);
    await humanClick(page, target, state, config.motion, cursorStart);
    await humanType(page, step.text, config.typing, step.delayMs);
    await applyStepDelay(page, step.delayAfterMs);
    return delayApplied;
  }

  if (step.action === 'press') {
    const delayApplied = await applyStartDelayIfNeeded(
      page,
      config.timing,
      startDelayApplied
    );

    await applyStepDelay(page, step.delayBeforeMs);
    const target = resolveLocator(page, step.selector);
    await prepareLocator(target);
    await target.focus();
    await page.keyboard.press(step.key);
    await applyStepDelay(page, step.delayAfterMs);
    return delayApplied;
  }

  if (step.action === 'scroll') {
    const delayApplied = await applyStartDelayIfNeeded(
      page,
      config.timing,
      startDelayApplied
    );

    await applyStepDelay(page, step.delayBeforeMs);
    const target = resolveLocator(page, step.selector);
    await humanMoveToLocator(page, target, state, config.motion, cursorStart);
    await page.mouse.wheel(step.x, step.y);
    await applyStepDelay(page, step.delayAfterMs);
    return delayApplied;
  }

  if (step.action === 'select') {
    const delayApplied = await applyStartDelayIfNeeded(
      page,
      config.timing,
      startDelayApplied
    );

    await applyStepDelay(page, step.delayBeforeMs);
    const target = resolveLocator(page, step.selector);
    await prepareLocator(target);
    await target.selectOption(step.value);
    await applyStepDelay(page, step.delayAfterMs);
    return delayApplied;
  }

  if (step.action === 'check') {
    const delayApplied = await applyStartDelayIfNeeded(
      page,
      config.timing,
      startDelayApplied
    );

    await applyStepDelay(page, step.delayBeforeMs);
    const target = resolveLocator(page, step.selector);
    await prepareLocator(target);
    await target.setChecked(step.checked);
    await applyStepDelay(page, step.delayAfterMs);
    return delayApplied;
  }

  if (step.action === 'upload') {
    const delayApplied = await applyStartDelayIfNeeded(
      page,
      config.timing,
      startDelayApplied
    );

    await applyStepDelay(page, step.delayBeforeMs);
    const target = resolveLocator(page, step.selector);
    await prepareLocator(target);
    await target.setInputFiles(step.filePath);
    await applyStepDelay(page, step.delayAfterMs);
    return delayApplied;
  }

  if (step.action === 'drag') {
    const delayApplied = await applyStartDelayIfNeeded(
      page,
      config.timing,
      startDelayApplied
    );

    await applyStepDelay(page, step.delayBeforeMs);
    const source = resolveLocator(page, step.source);
    const target = resolveLocator(page, step.target);
    await humanMoveToLocator(page, source, state, config.motion, cursorStart);
    await page.waitForTimeout(config.motion.clickDelayMs);
    await page.mouse.down();

    const targetPoint = await getLocatorCenter(target);
    await moveMouseBezier(page, state, targetPoint.x, targetPoint.y, config.motion);
    await page.waitForTimeout(config.motion.clickDelayMs);
    await page.mouse.up();
    await applyStepDelay(page, step.delayAfterMs);
    return delayApplied;
  }

  return startDelayApplied;
};

export const runPreSteps = async (page: Page, preSteps: Step[]) => {
  for (const step of preSteps) {
    await runStepSimple(page, step);
  }
};

export const runDemo = async (page: Page, config: DemoReelConfig) => {
  const resolvedCursor = await installCursorOverlay(page, config.cursor);
  const mouseState: MouseState = {
    initialized: false,
    position: { x: 0, y: 0 },
  };
  let startDelayApplied = false;

  for (const step of config.steps) {
    startDelayApplied = await runStep(
      page,
      step,
      config,
      mouseState,
      resolvedCursor.start,
      resolvedCursor,
      startDelayApplied
    );
  }

  if (config.timing.endDelayMs > 0) {
    await page.waitForTimeout(config.timing.endDelayMs);
  }
};
