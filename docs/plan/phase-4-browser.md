# Phase 4: Extract Browser Module

## Objective

Extract browser lifecycle management from `src/video-handler.ts` (758 lines) into `src/browser/` (3 files).

`video-handler.ts` currently mixes 6 concerns:

- Browser launch (`startBrowser`, `startRecording`, `stopRecording`)
- Signal handling (`setOnBrowserCreated`)
- Authentication (`handleAuth`)
- Video processing (`processVideoWithAudio`, `mergeAudioVideo`)
- Subtitle generation (`buildSubtitleCues`, `generateSRT`, `generateVTT`)
- Metadata generation (`generateMetadata`)

Phase 4 only extracts browser lifecycle. Auth, video processing, and subtitles stay in `video-handler.ts` (they'll move to stages in Phase 5).

## Files to Create

### `src/browser/types.ts` (~15 lines)

```ts
import type { Browser, BrowserContext, Page } from "playwright";

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  isRecording: boolean;
}
```

### `src/browser/launcher.ts` (~120 lines)

```ts
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { join } from "path";
import type { DemoReelConfig } from "../schemas.js";
import type { BrowserSession } from "./types.js";

const DEFAULT_TIMEOUT_MS = 5000;

export async function launchBrowser(
  config: DemoReelConfig,
  headed: boolean = false,
): Promise<BrowserSession> {
  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext({
    viewport: config.video.resolution,
  });
  context.setDefaultTimeout(DEFAULT_TIMEOUT_MS);
  const page = await context.newPage();
  return { browser, context, page, isRecording: false };
}

export async function launchRecordingBrowser(
  config: DemoReelConfig,
  headed: boolean = false,
): Promise<BrowserSession> {
  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext({
    viewport: config.video.resolution,
    recordVideo: {
      dir: join(process.cwd(), ".demo-reel-temp"),
      size: config.video.resolution,
    },
  });
  context.setDefaultTimeout(DEFAULT_TIMEOUT_MS);
  const page = await context.newPage();
  return { browser, context, page, isRecording: true };
}

export async function closeSession(
  session: BrowserSession,
  saveSessionFn?: () => Promise<void>,
): Promise<string | null> {
  const { page, context, browser, isRecording } = session;

  await page.close();

  let tempVideoPath: string | null = null;
  if (isRecording) {
    const video = page.video();
    if (video) {
      tempVideoPath = await video.path();
    }
  }

  if (saveSessionFn) {
    await saveSessionFn();
  }

  await context.close();
  await browser.close();

  if (isRecording && !tempVideoPath) {
    throw new Error("No video was recorded");
  }

  return tempVideoPath;
}
```

### `src/browser/pool.ts` (~100 lines)

```ts
import type { DemoReelConfig } from "../schemas.js";
import type { BrowserSession } from "./types.js";
import { launchBrowser, launchRecordingBrowser, closeSession } from "./launcher.js";

export class BrowserPool {
  private sessions: BrowserSession[] = [];

  acquire(config: DemoReelConfig, options: AcquireOptions = {}): Promise<BrowserSession> {
    const session = options.recording
      ? launchRecordingBrowser(config, options.headed)
      : launchBrowser(config, options.headed);
    this.sessions.push(session);
    return session;
  }

  async release(
    session: BrowserSession,
    saveSessionFn?: () => Promise<void>,
  ): Promise<string | null> {
    const idx = this.sessions.indexOf(session);
    if (idx >= 0) this.sessions.splice(idx, 1);
    return closeSession(session, saveSessionFn);
  }

  async releaseAll(): Promise<void> {
    for (const session of this.sessions) {
      try {
        await closeSession(session);
      } catch {}
    }
    this.sessions = [];
  }

  get active(): number {
    return this.sessions.length;
  }
}

export interface AcquireOptions {
  recording?: boolean;
  headed?: boolean;
}
```

## Files to Modify

### `src/video-handler.ts`

Replace browser launch/stop functions with re-exports (or remove and delegate to pool):

```ts
// REMOVE: startBrowser(), startRecording(), stopRecording(), VideoResult
// REMOVE: setOnBrowserCreated(), onBrowserCreated
// REMOVE: DEFAULT_BEHAVIOR (moves to auth or stages in Phase 5)

// ADD at top:
import { BrowserPool } from "./browser/pool.js";
import { launchBrowser, launchRecordingBrowser, closeSession } from "./browser/launcher.js";
export type { BrowserSession } from "./browser/types.js";

// KEEP for backward compat:
export { launchBrowser as startBrowser, launchRecordingBrowser as startRecording };
export { closeSession as stopRecording };
```

Actually, to keep backward compatibility simpler, just re-export:

```ts
// Keep the existing exports working for now
export {
  launchBrowser as startBrowser,
  launchRecordingBrowser as startRecording,
} from "./browser/launcher.js";
export { closeSession as stopRecording } from "./browser/launcher.js";
export type { BrowserSession as VideoResult } from "./browser/types.js";
```

`VideoResult` has `{ page, context, browser, tempVideoPath }` while `BrowserSession` has `{ browser, context, page, isRecording }`. The difference is `tempVideoPath` (string) vs `isRecording` (boolean). Old code sets `tempVideoPath: ""` initially and fills it later.

To keep backward compatibility without a type mismatch:

- Keep `VideoResult` type in `video-handler.ts` for now (or type alias)
- Or: adapt `launchBrowser`/`launchRecordingBrowser` to return `VideoResult` with `tempVideoPath: ""`
- Better approach: just keep the original functions in `video-handler.ts` for this phase, but make them thin wrappers:

```ts
// video-handler.ts — keep function signatures but delegate to browser/
import { launchBrowser as _launchBrowser } from "./browser/launcher.js";
import type { BrowserSession } from "./browser/types.js";

// Keep existing VideoResult type for backward compat
export interface VideoResult {
  page: Page;
  context: BrowserContext;
  browser: Browser;
  tempVideoPath: string;
}

// Thin wrappers
export async function startBrowser(config: DemoReelConfig, headed?: boolean): Promise<VideoResult> {
  const session = await _launchBrowser(config, headed);
  return { ...session, tempVideoPath: "" };
}

export async function startRecording(
  config: DemoReelConfig,
  headed?: boolean,
): Promise<VideoResult> {
  const session = await launchRecordingBrowser(config, headed);
  return { ...session, tempVideoPath: "" };
}

// stopRecording stays mostly as-is but uses closeSession internally
```

This is the most backward-compatible approach. The wrapper functions just delegate to `browser/` internals.

### `src/cli.ts`

Currently uses `setOnBrowserCreated()` to register signal handlers. In the new architecture, `BrowserPool` handles cleanup. For this phase, keep the existing signal handler but make it use pool:

```ts
import { BrowserPool } from "./browser/pool.js";

const pool = new BrowserPool();

// Register signal handlers that call pool.releaseAll()
// ... instead of the current cleanupBrowser()
```

Or keep the current `setOnBrowserCreated` callback working. Simplest approach for Phase 4: don't change `cli.ts` at all — keep the current signal handler. Only change the internal implementation in `video-handler.ts`.

Actually, let's keep this phase minimal. Don't touch `cli.ts`. Just extract `startBrowser`/`startRecording`/`stopRecording` into `browser/` with thin wrappers in `video-handler.ts`.

### `src/index.ts`

Verify re-exports still work:

```ts
// No changes needed — doesn't directly re-export browser functions
```

## Verification

```bash
pnpm lint
pnpm test test/video-handler.test.ts test/video-handler-deps.test.ts
pnpm build
```

## Dependencies

- Phase 2 (runner re-exports — video-handler imports from runner)

## Backward Compatibility

- `import { startBrowser, startRecording, stopRecording, VideoResult } from "./video-handler.js"` → unchanged
- `import { setOnBrowserCreated } from "./video-handler.js"` → unchanged (kept in video-handler.ts)
- `import { handleAuth, runVideoScenario, processVideoWithAudio } from "./video-handler.js"` → unchanged
