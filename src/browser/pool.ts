import type { DemoReelConfig } from "../schemas.js";
import type { BrowserSession } from "./types.js";
import { launchBrowser, launchRecordingBrowser, closeSession } from "./launcher.js";

export interface AcquireOptions {
  recording?: boolean;
  headed?: boolean;
}

export class BrowserPool {
  private sessions: BrowserSession[] = [];

  async acquire(config: DemoReelConfig, options: AcquireOptions = {}): Promise<BrowserSession> {
    const session = await (options.recording
      ? launchRecordingBrowser(config, options.headed)
      : launchBrowser(config, options.headed));
    this.sessions.push(session);
    return session;
  }

  async release(
    session: BrowserSession,
    saveSessionFn?: () => Promise<void>,
  ): Promise<string | null> {
    // Only stop tracking the session once it has actually closed. Dropping it
    // first meant a closeSession failure (launcher throws "No video was
    // recorded") left the browser running and invisible to releaseAll.
    const videoPath = await closeSession(session, saveSessionFn);
    const idx = this.sessions.indexOf(session);
    if (idx >= 0) this.sessions.splice(idx, 1);
    return videoPath;
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
