import type { DemoReelConfig } from "../schemas.js";
import type { BrowserSession } from "./types.js";
import { launchBrowser, launchRecordingBrowser, closeSession } from "./launcher.js";
import { registerSessionCleanup } from "./cleanup.js";
import { isShuttingDown } from "../process-cleanup.js";

export interface AcquireOptions {
  recording?: boolean;
  headed?: boolean;
}

export class BrowserPool {
  private sessions: BrowserSession[] = [];
  private unregisterCleanup = new WeakMap<BrowserSession, () => void>();

  async acquire(config: DemoReelConfig, options: AcquireOptions = {}): Promise<BrowserSession> {
    const session = await (options.recording
      ? launchRecordingBrowser(config, options.headed)
      : launchBrowser(config, options.headed));
    if (isShuttingDown()) {
      // A signal arrived while the launch was in flight. Closing here (rather
      // than registering a target after the drain already decided its set)
      // keeps the browser from outliving the interrupt.
      await closeSession(session).catch(() => {});
      throw new Error("Browser acquisition aborted: process is shutting down");
    }
    this.sessions.push(session);
    // A SIGINT during recording used to leave this browser running: cleanup
    // was wired only into the legacy launcher hook, which the pipeline never
    // calls.
    this.unregisterCleanup.set(session, registerSessionCleanup(session));
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
    this.forget(session);
    return videoPath;
  }

  async releaseAll(): Promise<void> {
    const sessions = [...this.sessions];
    for (const session of sessions) {
      try {
        await closeSession(session);
      } catch {}
    }
    for (const session of sessions) {
      this.forget(session);
    }
    this.sessions = [];
  }

  private forget(session: BrowserSession): void {
    this.unregisterCleanup.get(session)?.();
    this.unregisterCleanup.delete(session);
    const idx = this.sessions.indexOf(session);
    if (idx >= 0) this.sessions.splice(idx, 1);
  }

  get active(): number {
    return this.sessions.length;
  }
}
