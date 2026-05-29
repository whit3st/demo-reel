# Browser Module

## Purpose

Manages Playwright browser lifecycle: launching, configuration, session management, video recording. Extracted from `video-handler.ts` (758 lines → ~3 focused files).

## Location

`src/browser/`

## Files

### `types.ts` — BrowserSession

```ts
export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  isRecording: boolean;
}
```

A session bundles the three Playwright handles (browser, context, page) plus a flag indicating whether video recording is active.

### `pool.ts` — BrowserPool

Manages browser lifecycle: launch, reuse sessions, cleanup.

```ts
export class BrowserPool {
  acquire(config: DemoReelConfig, options: AcquireOptions): Promise<BrowserSession>;
  release(session: BrowserSession): Promise<string | null>;
  releaseAll(): Promise<void>;
}

export interface AcquireOptions {
  recording?: boolean; // Start video recording for this session
  headed?: boolean; // Launch with visible browser window
  skipAuth?: boolean; // Don't restore auth session
}
```

**Key behaviors:**

- **`acquire()`** — Launches a Chromium browser, creates a context with the configured viewport, opens a new page. If `recording: true`, configures `recordVideo` with a temp directory. Sets default timeout to 5000ms. Registers the browser/context with the signal handler for cleanup on SIGINT/SIGTERM.

- **`release(session)`** — Closes the page (triggers video finalization), optionally saves auth session, closes context, closes browser. Returns the temp video path if recording was active, or `null`.

- **`releaseAll()`** — Cleanup all tracked sessions (used in signal handlers).

**Why BrowserPool?** The current `video-handler.ts` creates up to 3 separate browsers (auth setup, recording, post-steps). BrowserPool centralizes lifecycle, ensures cleanup, and provides a single point for signal-handling integration (currently scattered across `cli.ts`).

### `launcher.ts` — Low-Level Launch

```ts
export async function launchBrowser(
  config: DemoReelConfig,
  headed: boolean,
): Promise<BrowserSession>;
export async function launchRecordingBrowser(
  config: DemoReelConfig,
  headed: boolean,
): Promise<BrowserSession>;
export async function closeSession(session: BrowserSession): Promise<string | null>;
```

These correspond to the current `startBrowser()`, `startRecording()`, and `stopRecording()` functions in `video-handler.ts`, but with:

- Simplified signatures (no `onBrowserCreated` callback — that's `BrowserPool`'s concern)
- No `tempVideoPath` in the result type (replaced by `isRecording` flag)
- Consistent return types

## Current → New Mapping

| Current (`video-handler.ts`) | New (`browser/`)                                      |
| ---------------------------- | ----------------------------------------------------- |
| `startBrowser()`             | `launcher.ts :: launchBrowser()`                      |
| `startRecording()`           | `launcher.ts :: launchRecordingBrowser()`             |
| `stopRecording()`            | `launcher.ts :: closeSession()`                       |
| `VideoResult`                | `types.ts :: BrowserSession`                          |
| `setOnBrowserCreated()`      | `pool.ts :: BrowserPool.onSessionCreated`             |
| Signal handlers in `cli.ts`  | `pool.ts :: BrowserPool` (handles cleanup internally) |

## Browser Configuration

```ts
const DEFAULT_TIMEOUT_MS = 5000; // Fail fast on broken selectors

const contextOptions = {
  viewport: config.video.resolution,
  ...(recording
    ? {
        recordVideo: {
          dir: join(process.cwd(), ".demo-reel-temp"),
          size: config.video.resolution,
        },
      }
    : {}),
};
```

Always `chromium.launch()` with `headless: !headed` to support both CI and development.

## Session Management Integration

`BrowserPool` integrates with `auth.ts` for session save/restore:

- On **acquire**: if auth is configured, restore cookies/localStorage from session file
- On **release**: if auth is configured, capture current cookies/localStorage and save

This moves session management out of `video-handler.ts` into the pool, making `handleAuth()` thinner.
