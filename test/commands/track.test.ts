import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { TrackCommand, type TrackCommandContext } from "../../src/commands/track.js";
import type { GlobalOptions } from "../../src/commands/types.js";
import type { Browser, BrowserContext, Page, Frame } from "playwright";

vi.mock("../../src/auth.js", () => ({
  loadSession: vi.fn(),
  saveSession: vi.fn(),
  captureCookies: vi.fn(),
  captureLocalStorage: vi.fn(),
  restoreCookies: vi.fn(),
  restoreLocalStorage: vi.fn(),
}));

import {
  loadSession,
  saveSession,
  captureCookies,
  captureLocalStorage,
  restoreCookies,
  restoreLocalStorage,
} from "../../src/auth.js";

function createMockPage(): Page {
  const frame = {
    url: vi.fn().mockReturnValue("https://example.com/page"),
  } as unknown as Frame;

  let exposedHandler: ((event: Record<string, unknown>) => void) | undefined;

  const page = {
    url: vi.fn().mockReturnValue("https://example.com/page"),
    goto: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(undefined),
    exposeFunction: vi.fn().mockImplementation((_name: string, handler: (event: Record<string, unknown>) => void) => {
      exposedHandler = handler;
    }),
    getExposedHandler: () => exposedHandler,
    on: vi.fn(),
    mainFrame: vi.fn().mockReturnValue(frame),
  } as unknown as Page & { getExposedHandler: () => ((event: Record<string, unknown>) => void) | undefined };

  return page;
}

function createMockBrowser(page: Page): { browser: Browser; context: BrowserContext; page: Page } {
  const context = {
    newPage: vi.fn().mockResolvedValue(page),
    addInitScript: vi.fn().mockResolvedValue(undefined),
    pages: vi.fn().mockReturnValue([page]),
    on: vi.fn(),
  } as unknown as BrowserContext;

  const browser = {
    close: vi.fn().mockResolvedValue(undefined),
    newContext: vi.fn().mockResolvedValue(context),
  } as unknown as Browser;

  return { browser, context, page };
}

function createMockContext(
  overrides: Partial<TrackCommandContext> = {},
): TrackCommandContext {
  const page = createMockPage();
  const { browser, context } = createMockBrowser(page);

  return {
    fs: {
      writeFile: vi.fn().mockResolvedValue(undefined),
    },
    cwd: vi.fn().mockReturnValue("/workspace/project"),
    console: {
      log: vi.fn(),
      error: vi.fn(),
    },
    launchBrowser: vi.fn().mockResolvedValue({ browser, context, page }),
    ...overrides,
  };
}

function createGlobalOptions(
  overrides: Partial<GlobalOptions & { trackName?: string; trackSession?: string }> = {},
): GlobalOptions & { trackName?: string; trackSession?: string } {
  return {
    verbose: false,
    dryRun: false,
    scriptUrl: undefined,
    trackName: undefined,
    trackSession: undefined,
    ...overrides,
  };
}

describe("TrackCommand", () => {
  let stdinMocks: {
    isTTY: boolean;
    setRawMode: ReturnType<typeof vi.fn>;
    resume: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    setEncoding: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    removeAllListeners?: ReturnType<typeof vi.fn>;
  };
  let dataHandlers: Array<(key: string) => void> = [];
  let originalStdin: typeof process.stdin;

  beforeEach(() => {
    vi.clearAllMocks();
    dataHandlers = [];

    stdinMocks = {
      isTTY: true,
      setRawMode: vi.fn(),
      resume: vi.fn(),
      pause: vi.fn(),
      setEncoding: vi.fn(),
      on: vi.fn().mockImplementation((event: string, handler: (key: string) => void) => {
        if (event === "data") {
          dataHandlers.push(handler);
        }
      }),
      removeAllListeners: vi.fn(),
    };

    originalStdin = process.stdin;
    Object.assign(process.stdin, stdinMocks);
  });

  afterEach(() => {
    Object.assign(process.stdin, originalStdin);
    vi.restoreAllMocks();
  });

  function triggerKey(key: string) {
    for (const handler of dataHandlers) {
      handler(key);
    }
  }

  describe("validation", () => {
    it("always validates", () => {
      const cmd = new TrackCommand();
      expect(cmd.validate([], createGlobalOptions())).toBe(true);
      expect(cmd.validate(["anything"], createGlobalOptions())).toBe(true);
    });
  });

  describe("execution", () => {
    it("returns error when trackName is missing", async () => {
      const cmd = new TrackCommand();
      const ctx = createMockContext();
      const options = createGlobalOptions();

      const exitCode = await cmd.execute([], options, ctx);

      expect(exitCode).toBe(1);
      expect(ctx.console.error).toHaveBeenCalledWith(
        "Error: --name is required for track command",
      );
    });

    it("opens browser and starts recording when name is provided", async () => {
      const cmd = new TrackCommand();
      const ctx = createMockContext();
      const options = createGlobalOptions({ trackName: "test-track" });

      const promise = cmd.execute([], options, ctx);
      await new Promise((resolve) => setTimeout(resolve, 10));
      triggerKey("q");
      const exitCode = await promise;

      expect(exitCode).toBe(0);
      expect(ctx.launchBrowser).toHaveBeenCalled();
      expect(ctx.fs.writeFile).toHaveBeenCalledWith(
        "test-track.track.json",
        expect.stringContaining("\"name\": \"test-track\""),
        "utf-8",
      );
    });

    it("navigates to URL when provided", async () => {
      const cmd = new TrackCommand();
      const page = createMockPage();
      page.url = vi.fn().mockReturnValue("https://app.example.com/templates");
      const { browser, context } = createMockBrowser(page);
      const ctx = createMockContext({
        launchBrowser: vi.fn().mockResolvedValue({ browser, context, page }),
      });
      const options = createGlobalOptions({
        trackName: "test-track",
        scriptUrl: "app.example.com/templates",
      });

      const promise = cmd.execute([], options, ctx);
      await new Promise((resolve) => setTimeout(resolve, 10));
      triggerKey("q");
      await promise;

      expect(page.goto).toHaveBeenCalledWith("https://app.example.com/templates");
      const writeCall = vi.mocked(ctx.fs.writeFile).mock.calls[0];
      const written = JSON.parse(writeCall![1] as string);
      expect(written.meta.openedUrl).toBe("https://app.example.com/templates");
    });

    it("prepends https:// when URL has no scheme", async () => {
      const cmd = new TrackCommand();
      const page = createMockPage();
      const { browser, context } = createMockBrowser(page);
      const ctx = createMockContext({
        launchBrowser: vi.fn().mockResolvedValue({ browser, context, page }),
      });
      const options = createGlobalOptions({
        trackName: "test-track",
        scriptUrl: "example.com",
      });

      const promise = cmd.execute([], options, ctx);
      await new Promise((resolve) => setTimeout(resolve, 10));
      triggerKey("q");
      await promise;

      expect(page.goto).toHaveBeenCalledWith("https://example.com");
    });

    it("returns error when not running in a TTY", async () => {
      const cmd = new TrackCommand();
      const ctx = createMockContext();
      const options = createGlobalOptions({ trackName: "test-track" });

      stdinMocks.isTTY = false;
      Object.assign(process.stdin, { ...stdinMocks, isTTY: false });

      const exitCode = await cmd.execute([], options, ctx);

      expect(exitCode).toBe(1);
      expect(ctx.console.error).toHaveBeenCalledWith(
        "Error: track command requires an interactive terminal",
      );
    });

    it("sets up stdin in raw mode", async () => {
      const cmd = new TrackCommand();
      const ctx = createMockContext();
      const options = createGlobalOptions({ trackName: "test-track" });

      const promise = cmd.execute([], options, ctx);
      await new Promise((resolve) => setTimeout(resolve, 10));
      triggerKey("q");
      await promise;

      expect(stdinMocks.setRawMode).toHaveBeenCalledWith(true);
      expect(stdinMocks.resume).toHaveBeenCalled();
      expect(stdinMocks.setEncoding).toHaveBeenCalledWith("utf8");
    });

    it("writes track.json with correct structure", async () => {
      const cmd = new TrackCommand();
      const ctx = createMockContext();
      const options = createGlobalOptions({ trackName: "my-flow" });

      const promise = cmd.execute([], options, ctx);
      await new Promise((resolve) => setTimeout(resolve, 10));
      triggerKey("q");
      await promise;

      const writeCall = vi.mocked(ctx.fs.writeFile).mock.calls[0];
      const data = JSON.parse(writeCall![1] as string);

      expect(data.version).toBe(1);
      expect(data.source).toBe("demo-reel track");
      expect(data.name).toBe("my-flow");
      expect(data.browser).toBe("chromium");
      expect(data.startedAt).toBeTruthy();
      expect(data.endedAt).toBeTruthy();
      expect(data.meta.startedPaused).toBe(false);
      expect(data.meta.sessionLoaded).toBe(false);
      expect(data.eventCount).toBe(0);
      expect(data.events).toEqual([]);
    });

    it("handles Ctrl+C (\\u0003) to stop", async () => {
      const cmd = new TrackCommand();
      const ctx = createMockContext();
      const options = createGlobalOptions({ trackName: "test-track" });

      const promise = cmd.execute([], options, ctx);
      await new Promise((resolve) => setTimeout(resolve, 10));
      triggerKey("\u0003");
      const exitCode = await promise;

      expect(exitCode).toBe(0);
      expect(ctx.fs.writeFile).toHaveBeenCalled();
    });
  });

  describe("event recording", () => {
    it("records navigation events from framenavigated", async () => {
      const cmd = new TrackCommand();
      const page = createMockPage();
      const framenavigatedHandlers: Array<(frame: Frame) => void> = [];
      page.on = vi.fn().mockImplementation((event: string, handler: (frame: Frame) => void) => {
        if (event === "framenavigated") {
          framenavigatedHandlers.push(handler);
        }
      });
      const { browser, context } = createMockBrowser(page);
      const ctx = createMockContext({
        launchBrowser: vi.fn().mockResolvedValue({ browser, context, page }),
      });
      const options = createGlobalOptions({ trackName: "test-track" });

      const promise = cmd.execute([], options, ctx);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Simulate framenavigated on main frame
      const frame = {
        url: vi.fn().mockReturnValue("https://example.com/new-page"),
      } as unknown as Frame;
      page.mainFrame = vi.fn().mockReturnValue(frame);

      for (const handler of framenavigatedHandlers) {
        handler(frame);
      }

      triggerKey("q");
      await promise;

      const writeCall = vi.mocked(ctx.fs.writeFile).mock.calls[0];
      const data = JSON.parse(writeCall![1] as string);
      expect(data.events).toHaveLength(1);
      expect(data.events[0].type).toBe("navigation");
      expect(data.events[0].url).toBe("https://example.com/new-page");
    });

    it("records events sent via exposed function", async () => {
      const cmd = new TrackCommand();
      const page = createMockPage();
      const { browser, context } = createMockBrowser(page);
      const ctx = createMockContext({
        launchBrowser: vi.fn().mockResolvedValue({ browser, context, page }),
      });
      const options = createGlobalOptions({ trackName: "test-track" });

      const promise = cmd.execute([], options, ctx);
      await new Promise((resolve) => setTimeout(resolve, 10));

      (page as unknown as { getExposedHandler: () => (event: Record<string, unknown>) => void }).getExposedHandler()({
        type: "click",
        url: "https://example.com",
        button: "left",
        x: 100,
        y: 200,
        target: { element: { tag: "button", text: "Submit", role: null, attributes: { id: "submit" } } },
      });

      triggerKey("q");
      await promise;

      const writeCall = vi.mocked(ctx.fs.writeFile).mock.calls[0];
      const data = JSON.parse(writeCall![1] as string);
      expect(data.events).toHaveLength(1);
      expect(data.events[0].type).toBe("click");
      expect(data.events[0].button).toBe("left");
      expect(data.events[0].x).toBe(100);
      expect(data.events[0].y).toBe(200);
      expect(data.events[0].pageId).toBe("page-1");
    });

    it("assigns incremental pageIds to new pages", async () => {
      const cmd = new TrackCommand();
      const page1 = createMockPage();
      const page2 = createMockPage();
      const newPageHandlers: Array<(page: Page) => void> = [];
      const { browser, context } = createMockBrowser(page1);
      context.on = vi.fn().mockImplementation((event: string, handler: (page: Page) => void) => {
        if (event === "page") {
          newPageHandlers.push(handler);
        }
      });
      context.newPage = vi.fn().mockResolvedValue(page1);

      const ctx = createMockContext({
        launchBrowser: vi.fn().mockResolvedValue({ browser, context, page: page1 }),
      });
      const options = createGlobalOptions({ trackName: "test-track" });

      const promise = cmd.execute([], options, ctx);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Simulate new page creation
      for (const handler of newPageHandlers) {
        handler(page2);
      }

      (page1 as unknown as { getExposedHandler: () => (event: Record<string, unknown>) => void }).getExposedHandler()({
        type: "click", url: "https://example.com", button: "left", x: 1, y: 1, target: { element: { tag: "a" } },
      });
      (page2 as unknown as { getExposedHandler: () => (event: Record<string, unknown>) => void }).getExposedHandler()({
        type: "click", url: "https://example.com/p2", button: "left", x: 2, y: 2, target: { element: { tag: "a" } },
      });

      triggerKey("q");
      await promise;

      const writeCall = vi.mocked(ctx.fs.writeFile).mock.calls[0];
      const data = JSON.parse(writeCall![1] as string);
      expect(data.events).toHaveLength(2);
      expect(data.events[0].pageId).toBe("page-1");
      expect(data.events[1].pageId).toBe("page-2");
    });

    it("does not record events when paused", async () => {
      const cmd = new TrackCommand();
      const page = createMockPage();
      const { browser, context } = createMockBrowser(page);
      const ctx = createMockContext({
        launchBrowser: vi.fn().mockResolvedValue({ browser, context, page }),
      });
      const options = createGlobalOptions({ trackName: "test-track" });

      const promise = cmd.execute([], options, ctx);
      await new Promise((resolve) => setTimeout(resolve, 10));

      triggerKey("p");

      (page as unknown as { getExposedHandler: () => (event: Record<string, unknown>) => void }).getExposedHandler()({
        type: "click",
        url: "https://example.com",
        button: "left",
        x: 100,
        y: 200,
        target: { element: { tag: "button" } },
      });

      triggerKey("q");
      await promise;

      const writeCall = vi.mocked(ctx.fs.writeFile).mock.calls[0];
      const data = JSON.parse(writeCall![1] as string);
      expect(data.events).toHaveLength(0);
    });

    it("does not record events from framenavigated when paused", async () => {
      const cmd = new TrackCommand();
      const page = createMockPage();
      const framenavigatedHandlers: Array<(frame: Frame) => void> = [];
      page.on = vi.fn().mockImplementation((event: string, handler: (frame: Frame) => void) => {
        if (event === "framenavigated") {
          framenavigatedHandlers.push(handler);
        }
      });
      const { browser, context } = createMockBrowser(page);
      const ctx = createMockContext({
        launchBrowser: vi.fn().mockResolvedValue({ browser, context, page }),
      });
      const options = createGlobalOptions({ trackName: "test-track" });

      const promise = cmd.execute([], options, ctx);
      await new Promise((resolve) => setTimeout(resolve, 10));
      triggerKey("p");

      const frame = {
        url: vi.fn().mockReturnValue("https://example.com/new-page"),
      } as unknown as Frame;
      page.mainFrame = vi.fn().mockReturnValue(frame);

      for (const handler of framenavigatedHandlers) {
        handler(frame);
      }

      triggerKey("q");
      await promise;

      const writeCall = vi.mocked(ctx.fs.writeFile).mock.calls[0];
      const data = JSON.parse(writeCall![1] as string);
      expect(data.events).toHaveLength(0);
    });
  });

  describe("terminal controls", () => {
    it("pauses recording on 'p'", async () => {
      const cmd = new TrackCommand();
      const ctx = createMockContext();
      const options = createGlobalOptions({ trackName: "test-track" });

      const promise = cmd.execute([], options, ctx);
      await new Promise((resolve) => setTimeout(resolve, 10));
      triggerKey("p");
      triggerKey("q");
      await promise;

      expect(ctx.console.log).toHaveBeenCalledWith("Paused recording");
    });

    it("resumes recording on 'r'", async () => {
      const cmd = new TrackCommand();
      const ctx = createMockContext();
      const options = createGlobalOptions({ trackName: "test-track" });

      const promise = cmd.execute([], options, ctx);
      await new Promise((resolve) => setTimeout(resolve, 10));
      triggerKey("p");
      triggerKey("r");
      triggerKey("q");
      await promise;

      expect(ctx.console.log).toHaveBeenCalledWith("Resumed recording");
    });

    it("ignores subsequent 'r' presses when already recording", async () => {
      const cmd = new TrackCommand();
      const ctx = createMockContext();
      const options = createGlobalOptions({ trackName: "test-track" });

      const promise = cmd.execute([], options, ctx);
      await new Promise((resolve) => setTimeout(resolve, 10));
      triggerKey("r");
      triggerKey("q");
      await promise;

      // Should only log once (from initial setup doesn't log resume when already recording)
      const resumeLogs = vi.mocked(ctx.console.log).mock.calls.filter(
        (call) => call[0] === "Resumed recording",
      );
      expect(resumeLogs).toHaveLength(1);
    });

    it("does not process keys after stopping", async () => {
      const cmd = new TrackCommand();
      const ctx = createMockContext();
      const options = createGlobalOptions({ trackName: "test-track" });

      const promise = cmd.execute([], options, ctx);
      await new Promise((resolve) => setTimeout(resolve, 10));
      triggerKey("q");
      triggerKey("p");
      await promise;

      const pauseLogs = vi.mocked(ctx.console.log).mock.calls.filter(
        (call) => call[0] === "Paused recording",
      );
      expect(pauseLogs).toHaveLength(0);
    });
  });

  describe("session handling", () => {
    it("loads and restores session when --session is provided", async () => {
      vi.mocked(loadSession).mockResolvedValue({
        name: "my-app",
        timestamp: Date.now(),
        cookies: [{ name: "session", value: "abc", domain: ".example.com", path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "Lax" }],
        localStorage: { "example.com": { key1: "value1" } },
      });

      const cmd = new TrackCommand();
      const page = createMockPage();
      const { browser, context } = createMockBrowser(page);
      const ctx = createMockContext({
        launchBrowser: vi.fn().mockResolvedValue({ browser, context, page }),
      });
      const options = createGlobalOptions({ trackName: "test-track", trackSession: "my-app" });

      const promise = cmd.execute([], options, ctx);
      await new Promise((resolve) => setTimeout(resolve, 10));
      triggerKey("q");
      await promise;

      expect(loadSession).toHaveBeenCalledWith("my-app", "/workspace/project");
      expect(restoreCookies).toHaveBeenCalled();
      expect(restoreLocalStorage).toHaveBeenCalled();
      expect(ctx.console.log).toHaveBeenCalledWith("Session loaded: my-app");

      const writeCall = vi.mocked(ctx.fs.writeFile).mock.calls[0];
      const data = JSON.parse(writeCall![1] as string);
      expect(data.meta.startedPaused).toBe(true);
      expect(data.meta.sessionLoaded).toBe(true);
    });

    it("starts paused when session is provided but not found", async () => {
      vi.mocked(loadSession).mockResolvedValue(null);

      const cmd = new TrackCommand();
      const ctx = createMockContext();
      const options = createGlobalOptions({ trackName: "test-track", trackSession: "missing" });

      const promise = cmd.execute([], options, ctx);
      await new Promise((resolve) => setTimeout(resolve, 10));
      triggerKey("q");
      await promise;

      expect(ctx.console.log).toHaveBeenCalledWith("No existing session found for: missing");

      const writeCall = vi.mocked(ctx.fs.writeFile).mock.calls[0];
      const data = JSON.parse(writeCall![1] as string);
      expect(data.meta.startedPaused).toBe(true);
      expect(data.meta.sessionLoaded).toBe(false);
    });

    it("sets isRecording to true when resuming from a session start", async () => {
      vi.mocked(loadSession).mockResolvedValue(null);

      const cmd = new TrackCommand();
      const page = createMockPage();
      const { browser, context } = createMockBrowser(page);
      const ctx = createMockContext({
        launchBrowser: vi.fn().mockResolvedValue({ browser, context, page }),
      });
      const options = createGlobalOptions({ trackName: "test-track", trackSession: "my-app" });

      const promise = cmd.execute([], options, ctx);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should start paused with isRecording=false
      triggerKey("r");

      (page as unknown as { getExposedHandler: () => (event: Record<string, unknown>) => void }).getExposedHandler()({
        type: "click", url: "https://example.com", button: "left", x: 1, y: 1, target: { element: { tag: "a" } },
      });

      triggerKey("q");
      await promise;

      expect(ctx.console.log).toHaveBeenCalledWith("Resumed recording");

      const writeCall = vi.mocked(ctx.fs.writeFile).mock.calls[0];
      const data = JSON.parse(writeCall![1] as string);
      expect(data.events).toHaveLength(1);
    });

    it("saves session on 's' when --session is provided", async () => {
      vi.mocked(loadSession).mockResolvedValue(null);
      vi.mocked(captureCookies).mockResolvedValue([]);
      vi.mocked(captureLocalStorage).mockResolvedValue(undefined);

      const cmd = new TrackCommand();
      const ctx = createMockContext();
      const options = createGlobalOptions({ trackName: "test-track", trackSession: "my-app" });

      const promise = cmd.execute([], options, ctx);
      await new Promise((resolve) => setTimeout(resolve, 10));
      triggerKey("s");
      triggerKey("q");
      await promise;

      expect(captureCookies).toHaveBeenCalled();
      expect(captureLocalStorage).toHaveBeenCalled();
      expect(saveSession).toHaveBeenCalledWith(
        expect.objectContaining({ name: "my-app" }),
        "/workspace/project",
      );
      expect(ctx.console.log).toHaveBeenCalledWith("Session saved: my-app");
    });

    it("logs message when 's' is pressed without --session", async () => {
      const cmd = new TrackCommand();
      const ctx = createMockContext();
      const options = createGlobalOptions({ trackName: "test-track" });

      const promise = cmd.execute([], options, ctx);
      await new Promise((resolve) => setTimeout(resolve, 10));
      triggerKey("s");
      triggerKey("q");
      await promise;

      expect(ctx.console.log).toHaveBeenCalledWith(
        "Session saving only available when --session is provided",
      );
      expect(saveSession).not.toHaveBeenCalled();
    });
  });

  describe("browser lifecycle", () => {
    it("closes browser after stopping", async () => {
      const cmd = new TrackCommand();
      const page = createMockPage();
      const { browser, context } = createMockBrowser(page);
      const ctx = createMockContext({
        launchBrowser: vi.fn().mockResolvedValue({ browser, context, page }),
      });
      const options = createGlobalOptions({ trackName: "test-track" });

      const promise = cmd.execute([], options, ctx);
      await new Promise((resolve) => setTimeout(resolve, 10));
      triggerKey("q");
      await promise;

      expect(browser.close).toHaveBeenCalled();
    });

    it("sets up exposeFunction and evaluate on initial page", async () => {
      const cmd = new TrackCommand();
      const page = createMockPage();
      const { browser, context } = createMockBrowser(page);
      const ctx = createMockContext({
        launchBrowser: vi.fn().mockResolvedValue({ browser, context, page }),
      });
      const options = createGlobalOptions({ trackName: "test-track" });

      const promise = cmd.execute([], options, ctx);
      await new Promise((resolve) => setTimeout(resolve, 10));
      triggerKey("q");
      await promise;

      expect(page.exposeFunction).toHaveBeenCalledWith("__demoReelTrackEvent", expect.any(Function));
      expect(page.evaluate).toHaveBeenCalled();
      expect(context.addInitScript).toHaveBeenCalled();
    });

    it("registers framenavigated listener on initial page", async () => {
      const cmd = new TrackCommand();
      const page = createMockPage();
      const { browser, context } = createMockBrowser(page);
      const ctx = createMockContext({
        launchBrowser: vi.fn().mockResolvedValue({ browser, context, page }),
      });
      const options = createGlobalOptions({ trackName: "test-track" });

      const promise = cmd.execute([], options, ctx);
      await new Promise((resolve) => setTimeout(resolve, 10));
      triggerKey("q");
      await promise;

      expect(page.on).toHaveBeenCalledWith("framenavigated", expect.any(Function));
    });

    it("registers page listener on context for new pages", async () => {
      const cmd = new TrackCommand();
      const page = createMockPage();
      const { browser, context } = createMockBrowser(page);
      const ctx = createMockContext({
        launchBrowser: vi.fn().mockResolvedValue({ browser, context, page }),
      });
      const options = createGlobalOptions({ trackName: "test-track" });

      const promise = cmd.execute([], options, ctx);
      await new Promise((resolve) => setTimeout(resolve, 10));
      triggerKey("q");
      await promise;

      expect(context.on).toHaveBeenCalledWith("page", expect.any(Function));
    });
  });

  describe("event timing", () => {
    it("assigns increasing timeOffsetMs to events", async () => {
      const cmd = new TrackCommand();
      const page = createMockPage();
      const { browser, context } = createMockBrowser(page);
      const ctx = createMockContext({
        launchBrowser: vi.fn().mockResolvedValue({ browser, context, page }),
      });
      const options = createGlobalOptions({ trackName: "test-track" });

      const promise = cmd.execute([], options, ctx);
      await new Promise((resolve) => setTimeout(resolve, 10));

      const handler = (page as unknown as { getExposedHandler: () => (event: Record<string, unknown>) => void }).getExposedHandler();
      handler({ type: "click", url: "https://example.com", button: "left", x: 1, y: 1, target: { element: { tag: "a" } } });
      await new Promise((resolve) => setTimeout(resolve, 20));
      handler({ type: "click", url: "https://example.com", button: "left", x: 2, y: 2, target: { element: { tag: "a" } } });

      triggerKey("q");
      await promise;

      const writeCall = vi.mocked(ctx.fs.writeFile).mock.calls[0];
      const data = JSON.parse(writeCall![1] as string);
      expect(data.events).toHaveLength(2);
      expect(data.events[0].timeOffsetMs).toBeLessThanOrEqual(data.events[1].timeOffsetMs);
    });
  });
});
