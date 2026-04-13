import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm } from "fs/promises";
import { join } from "path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import {
  loadSession,
  saveSession,
  clearSession,
  captureSession,
  restoreSession,
  validateSession,
  captureCookies,
  captureLocalStorage,
} from "../src/auth.js";
import type { AuthStorageConfig, AuthValidateConfig } from "../src/schemas.js";

const TEST_DIR = join(process.cwd(), ".test-sessions");

// Create a simple test HTML page
const TEST_HTML = `
<!DOCTYPE html>
<html>
<head><title>Test Page</title></head>
<body>
  <div id="app" class="app-container">
    <h1 class="title">Test Page</h1>
    <a href="/dashboard" class="nav-link">Dashboard</a>
    <a href="/profile" class="nav-link">Profile</a>
  </div>
</body>
</html>
`;

describe("Auth Persistence", () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
    page = await context.newPage();
  });

  afterEach(async () => {
    await context?.close();
    await browser?.close();
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("Session Storage", () => {
    it("should save and load session data", async () => {
      const sessionData = {
        name: "test-session",
        timestamp: Date.now(),
        cookies: [
          {
            name: "sessionId",
            value: "abc123",
            domain: ".example.com",
            path: "/",
            expires: -1,
            httpOnly: true,
            secure: true,
            sameSite: "Lax" as const,
          },
        ],
      };

      await saveSession(sessionData, TEST_DIR);
      const loaded = await loadSession("test-session", TEST_DIR);

      expect(loaded).not.toBeNull();
      expect(loaded?.name).toBe("test-session");
      expect(loaded?.cookies).toHaveLength(1);
      expect(loaded?.cookies[0].name).toBe("sessionId");
    });

    it("should return null for non-existent session", async () => {
      const loaded = await loadSession("non-existent", TEST_DIR);
      expect(loaded).toBeNull();
    });

    it("should clear session file", async () => {
      const sessionData = {
        name: "test-session",
        timestamp: Date.now(),
        cookies: [],
      };

      await saveSession(sessionData, TEST_DIR);
      await clearSession("test-session", TEST_DIR);

      const loaded = await loadSession("test-session", TEST_DIR);
      expect(loaded).toBeNull();
    });
  });

  describe("Cookie Capture", () => {
    it("should capture cookies from browser context", async () => {
      await page.goto("https://httpbin.org/cookies/set/testCookie/testValue");

      const cookies = await captureCookies(context);

      expect(cookies.length).toBeGreaterThan(0);
      expect(cookies.some((c) => c.name === "testCookie" && c.value === "testValue")).toBe(true);
    });
  });

  describe("LocalStorage Capture", () => {
    it("should capture localStorage from page", async () => {
      await page.goto("https://example.com");
      await page.evaluate(() => {
        localStorage.setItem("authToken", "token123");
        localStorage.setItem("userId", "user456");
      });

      const storage = await captureLocalStorage(context);

      expect(storage).toBeDefined();
      const domain = new URL(page.url()).hostname;
      expect(storage?.[domain]).toBeDefined();
      expect(storage?.[domain]["authToken"]).toBe("token123");
      expect(storage?.[domain]["userId"]).toBe("user456");
    });
  });

  describe("Session Capture and Restore", () => {
    it("should capture and restore session with cookies", async () => {
      const storageConfig: AuthStorageConfig = {
        name: "test-capture",
        types: ["cookies"],
      };

      // Set a cookie
      await context.addCookies([
        {
          name: "testCookie",
          value: "testValue",
          domain: ".example.com",
          path: "/",
        },
      ]);

      // Capture session
      const session = await captureSession(context, storageConfig);
      expect(session.cookies).toHaveLength(1);
      expect(session.cookies[0].name).toBe("testCookie");

      // Create new context and restore
      const newContext = await browser.newContext();
      const newPage = await newContext.newPage();

      await restoreSession(newContext, newPage, session, storageConfig);

      // Verify cookie was restored
      const restoredCookies = await newContext.cookies();
      expect(restoredCookies.some((c) => c.name === "testCookie")).toBe(true);

      await newContext.close();
    });
  });

  describe("Session Validation", () => {
    it("should validate session with visible element by ID", async () => {
      await page.setContent(TEST_HTML);

      const validateConfig: AuthValidateConfig = {
        protectedUrl: "data:text/html," + encodeURIComponent(TEST_HTML),
        successIndicator: { strategy: "id", value: "app" },
      };

      const isValid = await validateSession(page, validateConfig, false);
      expect(isValid).toBe(true);
    });

    it("should validate session with visible element by class", async () => {
      await page.setContent(TEST_HTML);

      const validateConfig: AuthValidateConfig = {
        protectedUrl: "data:text/html," + encodeURIComponent(TEST_HTML),
        successIndicator: { strategy: "class", value: "app-container" },
      };

      const isValid = await validateSession(page, validateConfig, false);
      expect(isValid).toBe(true);
    });

    it("should validate session with visible element by href", async () => {
      await page.setContent(TEST_HTML);

      const validateConfig: AuthValidateConfig = {
        protectedUrl: "data:text/html," + encodeURIComponent(TEST_HTML),
        successIndicator: { strategy: "href", value: "/dashboard" },
      };

      const isValid = await validateSession(page, validateConfig, false);
      expect(isValid).toBe(true);
    });

    it("should validate session with visible element by custom selector", async () => {
      await page.setContent(TEST_HTML);

      const validateConfig: AuthValidateConfig = {
        protectedUrl: "data:text/html," + encodeURIComponent(TEST_HTML),
        successIndicator: { strategy: "custom", value: ".nav-link" },
      };

      const isValid = await validateSession(page, validateConfig, false);
      expect(isValid).toBe(true);
    });

    it("should fail validation when element not found", async () => {
      await page.setContent(TEST_HTML);

      const validateConfig: AuthValidateConfig = {
        protectedUrl: "data:text/html," + encodeURIComponent(TEST_HTML),
        successIndicator: { strategy: "id", value: "non-existent-id-12345" },
      };

      const isValid = await validateSession(page, validateConfig, false);
      expect(isValid).toBe(false);
    });

    it("should handle multiple matching elements", async () => {
      await page.setContent(TEST_HTML);

      // Two elements have class 'nav-link'
      const validateConfig: AuthValidateConfig = {
        protectedUrl: "data:text/html," + encodeURIComponent(TEST_HTML),
        successIndicator: { strategy: "class", value: "nav-link" },
      };

      // This tests that we don't get strict mode violation
      const isValid = await validateSession(page, validateConfig, false);
      expect(isValid).toBe(true);
    });
  });
});
