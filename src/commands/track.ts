import type { Browser, BrowserContext, Page } from "playwright";
import type { Command, CommandContext, GlobalOptions } from "./types.js";
import {
  loadSession,
  saveSession,
  captureCookies,
  captureLocalStorage,
  restoreCookies,
  restoreLocalStorage,
} from "../auth.js";
import type { SessionData } from "../auth.js";

export interface TrackEvent {
  type: string;
  timeOffsetMs: number;
  pageId: string;
  url: string;
  [key: string]: unknown;
}

export interface TrackCommandContext extends CommandContext {
  launchBrowser(): Promise<{ browser: Browser; context: BrowserContext; page: Page }>;
}

export class TrackCommand implements Command {
  readonly name = "track";

  validate(_args: string[], _options: GlobalOptions): boolean {
    return true;
  }

  async execute(
    _args: string[],
    options: GlobalOptions,
    ctx: TrackCommandContext,
  ): Promise<number> {
    const trackName = options.trackName;
    const url = options.scriptUrl;
    const sessionName = options.trackSession;

    if (!trackName) {
      ctx.console.error("Error: --name is required for track command");
      return 1;
    }

    let normalizedUrl: string | undefined;
    if (url) {
      normalizedUrl = url.includes("://") ? url : `https://${url}`;
    }

    let isPaused = false;
    let isRecording = true;
    const events: TrackEvent[] = [];
    const startedAt = new Date().toISOString();
    let sessionLoaded = false;
    let openedUrl: string | undefined;

    const { browser, context, page } = await ctx.launchBrowser();

    let pageCounter = 0;
    const pageIds = new WeakMap<Page, string>();

    function getPageId(p: Page): string {
      if (!pageIds.has(p)) {
        pageIds.set(p, `page-${++pageCounter}`);
      }
      return pageIds.get(p)!;
    }

    // Restore session if provided
    if (sessionName) {
      isPaused = true;
      isRecording = false;
      const sessionData = await loadSession(sessionName, ctx.cwd());
      if (sessionData) {
        await restoreCookies(context, sessionData.cookies);
        await restoreLocalStorage(page, sessionData.localStorage || {});
        sessionLoaded = true;
        ctx.console.log(`Session loaded: ${sessionName}`);
      } else {
        ctx.console.log(`No existing session found for: ${sessionName}`);
      }
    }

    // Navigate if URL provided
    if (normalizedUrl) {
      await page.goto(normalizedUrl);
      openedUrl = page.url();
      ctx.console.log(`Opened: ${openedUrl}`);
    } else {
      openedUrl = page.url();
    }

    // Set up event recording
    const startTime = Date.now();

    function pushEvent(event: Omit<TrackEvent, "timeOffsetMs" | "pageId">, p: Page) {
      if (!isRecording || isPaused) return;
      events.push({
        ...event,
        timeOffsetMs: Date.now() - startTime,
        pageId: getPageId(p),
      } as TrackEvent);
    }

    const injectScript = `
      (function() {
        if (window.__demoReelTrackInjected) return;
        window.__demoReelTrackInjected = true;

        function isPasswordField(el) {
          if (!(el instanceof HTMLInputElement)) return false;
          var type = el.getAttribute("type");
          var name = el.getAttribute("name");
          var autocomplete = el.getAttribute("autocomplete") || "";
          return type === "password" ||
                 name === "password" ||
                 autocomplete.indexOf("password") !== -1;
        }

        function getElementSnapshot(el) {
          var attrs = {};
          for (var i = 0; i < el.attributes.length; i++) {
            var attr = el.attributes[i];
            attrs[attr.name] = attr.value;
          }
          
          var value = undefined;
          if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
            value = isPasswordField(el) ? "[REDACTED]" : el.value;
          }

          var result = {
            tag: el.tagName.toLowerCase(),
            text: (el.textContent || "").trim().slice(0, 200),
            role: el.getAttribute("role") || null,
            attributes: attrs
          };
          if (value !== undefined) {
            result.value = value;
          }
          return result;
        }

        function sendEvent(event) {
          if (window.__demoReelTrackEvent) {
            window.__demoReelTrackEvent(event);
          }
        }

        function findClickableTarget(el) {
          var clickableTags = { a: true, button: true, input: true, select: true, textarea: true, label: true };
          var current = el;
          while (current && current !== document.body) {
            var tag = current.tagName.toLowerCase();
            var role = current.getAttribute("role");
            if (clickableTags[tag] || role === "button" || role === "link" || role === "tab") {
              return current;
            }
            current = current.parentElement;
          }
          return el;
        }

        document.addEventListener("click", function(e) {
          var target = findClickableTarget(e.target);
          sendEvent({
            type: "click",
            url: window.location.href,
            button: e.button === 0 ? "left" : e.button === 1 ? "middle" : "right",
            x: e.clientX,
            y: e.clientY,
            target: {
              element: getElementSnapshot(target)
            }
          });
        }, true);

        document.addEventListener("input", function(e) {
          var target = e.target;
          sendEvent({
            type: "input",
            url: window.location.href,
            value: isPasswordField(target) ? "[REDACTED]" : target.value,
            inputType: e.inputType || "unknown",
            target: {
              element: getElementSnapshot(target)
            }
          });
        }, true);

        document.addEventListener("keydown", function(e) {
          sendEvent({
            type: "keydown",
            url: window.location.href,
            key: e.key,
            code: e.code,
            target: {
              element: getElementSnapshot(e.target)
            }
          });
        }, true);

        document.addEventListener("change", function(e) {
          var target = e.target;
          sendEvent({
            type: "change",
            url: window.location.href,
            value: isPasswordField(target) ? "[REDACTED]" : target.value,
            checked: target.checked,
            target: {
              element: getElementSnapshot(target)
            }
          });
        }, true);

        var originalPushState = history.pushState;
        var originalReplaceState = history.replaceState;
        
        history.pushState = function() {
          originalPushState.apply(this, arguments);
          sendEvent({
            type: "navigation",
            url: window.location.href
          });
        };
        
        history.replaceState = function() {
          originalReplaceState.apply(this, arguments);
          sendEvent({
            type: "navigation",
            url: window.location.href
          });
        };

        window.addEventListener("popstate", function() {
          sendEvent({
            type: "navigation",
            url: window.location.href
          });
        });
      })();
    `;

    async function setupPage(p: Page) {
      await p.exposeFunction("__demoReelTrackEvent", (event: Record<string, unknown>) => {
        pushEvent(event as Omit<TrackEvent, "timeOffsetMs" | "pageId">, p);
      });
      await p.evaluate(injectScript);

      p.on("framenavigated", (frame) => {
        if (!isRecording || isPaused) return;
        if (frame === p.mainFrame()) {
          pushEvent(
            {
              type: "navigation",
              url: frame.url(),
            },
            p,
          );
        }
      });
    }

    await setupPage(page);

    context.on("page", async (newPage) => {
      await setupPage(newPage);
    });

    // For future navigations on existing pages
    await context.addInitScript(injectScript);

    // Terminal controls
    ctx.console.log("");
    ctx.console.log("Track recording started.");
    if (isPaused) {
      ctx.console.log("Status: PAUSED (press 'r' to resume)");
    } else {
      ctx.console.log("Status: RECORDING");
    }
    ctx.console.log("Controls: [r] resume  [p] pause  [q] stop");
    if (sessionName) {
      ctx.console.log("          [s] save session");
    }
    ctx.console.log("");

    const stdin = process.stdin;
    if (!stdin.isTTY) {
      ctx.console.error("Error: track command requires an interactive terminal");
      await browser.close().catch(() => {});
      return 1;
    }

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let stopping = false;

    const restoreStdin = () => {
      if (stdin.isTTY) {
        stdin.setRawMode(false);
      }
      stdin.pause();
    };

    return new Promise((resolve) => {
      stdin.on("data", async (key: string) => {
        if (stopping) return;

        if (key === "r" || key === "R") {
          if (!isRecording) {
            isRecording = true;
          }
          isPaused = false;
          ctx.console.log("Resumed recording");
        } else if (key === "p" || key === "P") {
          isPaused = true;
          ctx.console.log("Paused recording");
        } else if (key === "s" || key === "S") {
          if (!sessionName) {
            ctx.console.log("Session saving only available when --session is provided");
            return;
          }
          const cookies = await captureCookies(context);
          const ls = await captureLocalStorage(context);
          const sessionData: SessionData = {
            name: sessionName,
            timestamp: Date.now(),
            cookies,
            localStorage: ls,
          };
          await saveSession(sessionData, ctx.cwd());
          ctx.console.log(`Session saved: ${sessionName}`);
        } else if (key === "q" || key === "Q" || key === "\u0003") {
          stopping = true;
          restoreStdin();

          const endedAt = new Date().toISOString();

          const trackData = {
            version: 1,
            source: "demo-reel track",
            name: trackName,
            browser: "chromium",
            startedAt,
            endedAt,
            meta: {
              openedUrl,
              startedPaused: !!sessionName,
              sessionLoaded,
              rawEventCount: events.length,
            },
            eventCount: events.length,
            events,
          };

          const outputPath = `${trackName}.track.json`;
          await ctx.fs.writeFile(outputPath, JSON.stringify(trackData, null, 2), "utf-8");
          ctx.console.log(`Track written: ${outputPath}`);

          await browser.close().catch(() => {});
          resolve(0);
        }
      });
    });
  }
}
