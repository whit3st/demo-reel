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
