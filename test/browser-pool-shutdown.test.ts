import { beforeEach, describe, expect, it, vi } from "vitest";

const { launchBrowserMock, closeSessionMock } = vi.hoisted(() => ({
  launchBrowserMock: vi.fn(),
  closeSessionMock: vi.fn(),
}));

vi.mock("../src/browser/launcher.js", () => ({
  launchBrowser: launchBrowserMock,
  launchRecordingBrowser: vi.fn(),
  closeSession: closeSessionMock,
}));

vi.mock("../src/process-cleanup.js", () => ({
  isShuttingDown: () => true,
  registerCleanupTarget: vi.fn(() => () => {}),
}));

import { BrowserPool } from "../src/browser/pool.js";
import type { DemoReelConfig } from "../src/schemas.js";

describe("BrowserPool during shutdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    closeSessionMock.mockResolvedValue(null);
  });

  it("closes and refuses a browser whose launch resolves after shutdown began", async () => {
    const session = { id: "late", page: {}, context: {}, browser: {} };
    launchBrowserMock.mockResolvedValue(session);
    const pool = new BrowserPool();

    await expect(pool.acquire({} as DemoReelConfig)).rejects.toThrow(/shutting down/);

    expect(closeSessionMock).toHaveBeenCalledWith(session);
    expect(pool.active).toBe(0);
  });
});
