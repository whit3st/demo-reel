import { beforeEach, describe, expect, it, vi } from "vitest";

const { launchBrowserMock, launchRecordingBrowserMock, closeSessionMock } = vi.hoisted(() => ({
  launchBrowserMock: vi.fn(),
  launchRecordingBrowserMock: vi.fn(),
  closeSessionMock: vi.fn(),
}));

vi.mock("../src/browser/launcher.js", () => ({
  launchBrowser: launchBrowserMock,
  launchRecordingBrowser: launchRecordingBrowserMock,
  closeSession: closeSessionMock,
}));

import { BrowserPool } from "../src/browser/pool.js";
import type { DemoReelConfig } from "../src/schemas.js";

const config = {} as DemoReelConfig;

const makeSession = (id: string) => ({ id, page: {}, context: {}, browser: {} }) as any;

describe("BrowserPool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    launchBrowserMock.mockImplementation(async () => makeSession("plain"));
    launchRecordingBrowserMock.mockImplementation(async () => makeSession("recording"));
    closeSessionMock.mockResolvedValue(null);
  });

  describe("acquire", () => {
    it("uses the plain launcher by default and tracks the session", async () => {
      const pool = new BrowserPool();

      const session = await pool.acquire(config);

      expect(launchBrowserMock).toHaveBeenCalledWith(config, undefined);
      expect(launchRecordingBrowserMock).not.toHaveBeenCalled();
      expect(session.id).toBe("plain");
      expect(pool.active).toBe(1);
    });

    it("uses the recording launcher when recording is requested", async () => {
      const pool = new BrowserPool();

      const session = await pool.acquire(config, { recording: true });

      expect(launchRecordingBrowserMock).toHaveBeenCalledWith(config, undefined);
      expect(launchBrowserMock).not.toHaveBeenCalled();
      expect(session.id).toBe("recording");
    });

    it.each([
      [false, true],
      [true, true],
      [false, false],
      [true, false],
    ])("forwards headed=%s with recording=%s", async (headed, recording) => {
      const pool = new BrowserPool();

      await pool.acquire(config, { recording, headed });

      const launcher = recording ? launchRecordingBrowserMock : launchBrowserMock;
      expect(launcher).toHaveBeenCalledWith(config, headed);
    });

    // The session is only tracked after the await resolves, so a failed launch
    // must not inflate the count — releaseAll() would then try to close a
    // browser that never existed.
    it("does not track a session when the launch fails", async () => {
      launchBrowserMock.mockRejectedValue(new Error("no browser binary"));
      const pool = new BrowserPool();

      await expect(pool.acquire(config)).rejects.toThrow("no browser binary");
      expect(pool.active).toBe(0);
    });

    it("tracks each concurrently acquired session", async () => {
      const pool = new BrowserPool();

      await Promise.all([pool.acquire(config), pool.acquire(config), pool.acquire(config)]);

      expect(pool.active).toBe(3);
    });
  });

  describe("release", () => {
    it("closes the session, drops it from the pool and returns the video path", async () => {
      closeSessionMock.mockResolvedValue("/tmp/video.webm");
      const pool = new BrowserPool();
      const session = await pool.acquire(config, { recording: true });

      const videoPath = await pool.release(session);

      expect(closeSessionMock).toHaveBeenCalledWith(session, undefined);
      expect(videoPath).toBe("/tmp/video.webm");
      expect(pool.active).toBe(0);
    });

    it("forwards the saveSession callback to closeSession", async () => {
      const pool = new BrowserPool();
      const session = await pool.acquire(config);
      const saveSession = vi.fn();

      await pool.release(session, saveSession);

      expect(closeSessionMock).toHaveBeenCalledWith(session, saveSession);
    });

    it("releases only the requested session", async () => {
      const pool = new BrowserPool();
      const first = await pool.acquire(config);
      await pool.acquire(config);

      await pool.release(first);

      expect(pool.active).toBe(1);
    });

    // closeSession throws for real: launcher.ts raises "No video was recorded"
    // when a recording session produced no file. The session used to be spliced
    // out *before* that call, so the browser was left running AND untracked —
    // releaseAll() could no longer reach it and the process never exited.
    it("still cleans up the browser when closeSession throws", async () => {
      closeSessionMock.mockRejectedValueOnce(new Error("No video was recorded"));
      const pool = new BrowserPool();
      const session = await pool.acquire(config, { recording: true });

      await expect(pool.release(session)).rejects.toThrow("No video was recorded");

      // Either the pool dropped it having genuinely closed it, or it kept it so
      // releaseAll can retry — what it must not do is drop an open browser.
      closeSessionMock.mockResolvedValue(null);
      await pool.releaseAll();

      expect(closeSessionMock).toHaveBeenCalledTimes(2);
      expect(pool.active).toBe(0);
    });

    it("still closes a session the pool never tracked", async () => {
      const pool = new BrowserPool();
      const stranger = makeSession("stranger");

      await pool.release(stranger);

      expect(closeSessionMock).toHaveBeenCalledWith(stranger, undefined);
      expect(pool.active).toBe(0);
    });
  });

  describe("releaseAll", () => {
    it("closes every tracked session and resets the count", async () => {
      const pool = new BrowserPool();
      await pool.acquire(config);
      await pool.acquire(config);

      await pool.releaseAll();

      expect(closeSessionMock).toHaveBeenCalledTimes(2);
      expect(pool.active).toBe(0);
    });

    // releaseAll runs in generate()'s finally block, so one stuck browser must
    // not strand the others.
    it("closes the remaining sessions when one close throws", async () => {
      closeSessionMock
        .mockRejectedValueOnce(new Error("hung"))
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      const pool = new BrowserPool();
      await pool.acquire(config);
      await pool.acquire(config);
      await pool.acquire(config);

      await expect(pool.releaseAll()).resolves.toBeUndefined();

      expect(closeSessionMock).toHaveBeenCalledTimes(3);
      expect(pool.active).toBe(0);
    });

    it("is a no-op on an empty pool", async () => {
      const pool = new BrowserPool();

      await pool.releaseAll();

      expect(closeSessionMock).not.toHaveBeenCalled();
      expect(pool.active).toBe(0);
    });
  });
});
