# Playwright E2E (Config-Driven)

This repo contains a single Playwright test that records a video of a
config-driven flow (goto + click), with a visible cursor overlay and
human-like mouse movement.

## Quick Start

- Install deps: `pnpm install`
- Run the test: `pnpm test:e2e`

Videos are written to `test-results/`.

## Configure the Run

Edit `tests/e2e.config.ts`. It defines a Zod schema and the config that
drives the Playwright adapter.

```
export const e2eConfig = e2eConfigSchema.parse({
  viewport: { width: 1920, height: 1080 },
  video: { enabled: true, size: { width: 1920, height: 1080 } },
  cursor: {
    start: { x: 160, y: 160 },
    type: 'svg',
    svg: {
      markup: '<svg ...>...</svg>',
      width: 18,
      height: 23,
      hotspot: { x: 0, y: 0 }
    }
  },
  motion: {
    moveDurationMs: 600,
    moveStepsMin: 25,
    stepsPerPx: 12,
    clickDelayMs: 60,
    curve: {
      offsetRatio: 0.1,
      offsetMin: 4,
      offsetMax: 80,
      easing: 'easeInOutCubic'
    }
  },
  typing: {
    baseDelayMs: 70,
    spaceDelayMs: 120,
    punctuationDelayMs: 180,
    enterDelayMs: 200
  },
  timing: {
    afterGotoDelayMs: 2000,
    endDelayMs: 2000
  },
  steps: [
    { action: 'goto', url: 'https://example.com' },
    {
      action: 'click',
      selector: { strategy: 'testId', value: 'replace-with-button-testid' }
    }
  ]
});
```

- Each selector includes a `strategy` of `testId`, `id`, `class`, or `href`.
- Use raw selector names for `id`/`class` (no leading `#` or `.`).
- Add more steps and they will run in order.

## Step Actions

Supported actions (selector targets are raw names):

- `goto`: `{ action: 'goto', url, waitUntil? }`
- `click`: `{ action: 'click', selector: { strategy, value }, delayBeforeMs?, delayAfterMs? }`
- `hover`: `{ action: 'hover', selector: { strategy, value }, delayBeforeMs?, delayAfterMs? }`
- `type`: `{ action: 'type', selector: { strategy, value }, text, delayMs?, delayBeforeMs?, delayAfterMs? }`
- `press`: `{ action: 'press', selector: { strategy, value }, key, delayBeforeMs?, delayAfterMs? }`
- `scroll`: `{ action: 'scroll', selector: { strategy, value }, x, y, delayBeforeMs?, delayAfterMs? }`
- `select`: `{ action: 'select', selector: { strategy, value }, value, delayBeforeMs?, delayAfterMs? }`
- `check`: `{ action: 'check', selector: { strategy, value }, checked, delayBeforeMs?, delayAfterMs? }`
- `upload`: `{ action: 'upload', selector: { strategy, value }, filePath, delayBeforeMs?, delayAfterMs? }`
- `drag`: `{ action: 'drag', source: { strategy, value }, target: { strategy, value }, delayBeforeMs?, delayAfterMs? }`
- `wait`: `{ action: 'wait', ms }`
- `waitFor`: `{ action: 'waitFor', kind: 'selector', selector: { strategy, value }, state?, timeoutMs? }`
- `waitFor`: `{ action: 'waitFor', kind: 'url', url, waitUntil?, timeoutMs? }`
- `waitFor`: `{ action: 'waitFor', kind: 'loadState', state?, timeoutMs? }`
- `waitFor`: `{ action: 'waitFor', kind: 'request', url, timeoutMs? }`
- `waitFor`: `{ action: 'waitFor', kind: 'response', url, timeoutMs? }`
- `waitFor`: `{ action: 'waitFor', kind: 'function', expression, arg?, polling?, timeoutMs? }`

## Video Settings

Video recording and viewport are read from `tests/e2e.config.ts` and
applied in `playwright.config.ts`.

## Cursor Overlay + Humanized Mouse

The cursor overlay and mouse motion are driven by the `cursor` and
`motion` blocks in `tests/e2e.config.ts`. Motion uses a deterministic
cubic-bezier path with ease-in/out timing.

Set `cursor.type` to `dot` if you prefer the original circle cursor; it
uses `size`, `borderWidth`, `borderColor`, and `shadowColor`.

Typing is driven by the `typing` block. Each character gets a
deterministic delay based on whether it is a space, punctuation, or
newline.

## Built-In Delays

The test waits for `timing.afterGotoDelayMs` after the first `goto` and
for `timing.endDelayMs` at the end to keep the video open.
