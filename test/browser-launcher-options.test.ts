import { afterEach, describe, expect, it, vi } from "vitest";
import { closeSession, chromiumLaunchOptions } from "../src/browser/launcher.js";
import type { BrowserSession } from "../src/browser/types.js";

const ENV_KEY = "DEMO_REEL_EXECUTABLE_PATH";
const original = process.env[ENV_KEY];

afterEach(() => {
  if (original === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = original;
});

describe("chromiumLaunchOptions", () => {
  it("uses the bundled browser when the env var is unset", () => {
    delete process.env[ENV_KEY];

    const opts = chromiumLaunchOptions(false);

    // Absent, not undefined — Playwright treats an explicit undefined the same,
    // but omitting it keeps the default path unambiguous.
    expect("executablePath" in opts).toBe(false);
    expect(opts.headless).toBe(true);
  });

  it("points at a host browser when the env var is set", () => {
    process.env[ENV_KEY] = "/usr/bin/brave";

    expect(chromiumLaunchOptions(false).executablePath).toBe("/usr/bin/brave");
  });

  it("ignores an empty env var rather than launching a browser at ''", () => {
    process.env[ENV_KEY] = "";

    expect("executablePath" in chromiumLaunchOptions(false)).toBe(false);
  });

  it("honours headed mode independently of the executable path", () => {
    delete process.env[ENV_KEY];
    expect(chromiumLaunchOptions(true).headless).toBe(false);

    process.env[ENV_KEY] = "/usr/bin/brave";
    expect(chromiumLaunchOptions(true).headless).toBe(false);
  });
});

function fakeSession(overrides: { isRecording?: boolean } = {}): BrowserSession {
  const session = {
    page: {
      close: vi.fn().mockResolvedValue(undefined),
      video: vi.fn().mockReturnValue({ path: vi.fn().mockResolvedValue("/tmp/video.webm") }),
    },
    context: { close: vi.fn().mockResolvedValue(undefined) },
    browser: { close: vi.fn().mockResolvedValue(undefined) },
    isRecording: overrides.isRecording ?? true,
  } as unknown as BrowserSession;
  return session;
}

describe("closeSession", () => {
  it("closes a racing session exactly once and resolves every caller", async () => {
    const session = fakeSession();

    const [first, second] = await Promise.all([closeSession(session), closeSession(session)]);

    expect(first).toBe("/tmp/video.webm");
    expect(second).toBe("/tmp/video.webm");
    expect(session.page.close).toHaveBeenCalledTimes(1);
    expect(session.context.close).toHaveBeenCalledTimes(1);
    expect(session.browser.close).toHaveBeenCalledTimes(1);
    expect(session.recordingEndedAt).toBeTypeOf("number");
  });

  it("allows a retry after a failed close", async () => {
    const session = fakeSession();
    vi.mocked(session.page.close).mockRejectedValueOnce(new Error("page hung"));

    await expect(closeSession(session)).rejects.toThrow("page hung");

    await expect(closeSession(session)).resolves.toBe("/tmp/video.webm");
    expect(session.page.close).toHaveBeenCalledTimes(2);
  });
});
