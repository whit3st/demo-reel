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

    it("should validate with testId strategy", async () => {
      const testHtml = `
        <!DOCTYPE html>
        <html>
        <body>
          <div data-testid="success-element">Success!</div>
        </body>
        </html>
      `;
      await page.setContent(testHtml);

      const validateConfig: AuthValidateConfig = {
        protectedUrl: "data:text/html," + encodeURIComponent(testHtml),
        successIndicator: { strategy: "testId", value: "success-element" },
      };

      const isValid = await validateSession(page, validateConfig, false);
      expect(isValid).toBe(true);
    });

    it("should validate with data-node-id strategy", async () => {
      const testHtml = `
        <!DOCTYPE html>
        <html>
        <body>
          <div data-node-id="node-123">Success!</div>
        </body>
        </html>
      `;
      await page.setContent(testHtml);

      const validateConfig: AuthValidateConfig = {
        protectedUrl: "data:text/html," + encodeURIComponent(testHtml),
        successIndicator: { strategy: "data-node-id", value: "node-123" },
      };

      const isValid = await validateSession(page, validateConfig, false);
      expect(isValid).toBe(true);
    });

    it("should validate with specific index", async () => {
      await page.setContent(TEST_HTML);

      const validateConfig: AuthValidateConfig = {
        protectedUrl: "data:text/html," + encodeURIComponent(TEST_HTML),
        successIndicator: { strategy: "class", value: "nav-link", index: 1 },
      };

      const isValid = await validateSession(page, validateConfig, false);
      expect(isValid).toBe(true);
    });
  });

  describe("Storage Type Checking", () => {
    it("should check if storage type is configured", async () => {
      const { hasStorageType } = await import("../src/auth.js");

      const cookieConfig: AuthStorageConfig = {
        name: "test",
        types: ["cookies"],
      };
      expect(hasStorageType(cookieConfig, "cookies")).toBe(true);
      expect(hasStorageType(cookieConfig, "localStorage")).toBe(false);

      const localStorageConfig: AuthStorageConfig = {
        name: "test",
        types: ["localStorage"],
      };
      expect(hasStorageType(localStorageConfig, "localStorage")).toBe(true);
      expect(hasStorageType(localStorageConfig, "cookies")).toBe(false);

      const bothConfig: AuthStorageConfig = {
        name: "test",
        types: ["cookies", "localStorage"],
      };
      expect(hasStorageType(bothConfig, "cookies")).toBe(true);
      expect(hasStorageType(bothConfig, "localStorage")).toBe(true);
    });
  });

  describe("Session Path Resolution", () => {
    it("should use custom file path when provided", async () => {
      const { getSessionPath } = await import("../src/auth.js");

      const configWithFile: AuthStorageConfig = {
        name: "test-session",
        types: ["cookies"],
        file: "custom/path/session.json",
      };

      const path = getSessionPath(configWithFile, TEST_DIR);
      expect(path).toBe(join(TEST_DIR, "custom/path/session.json"));
    });

    it("should use default path when no file provided", async () => {
      const { getSessionPath } = await import("../src/auth.js");

      const config: AuthStorageConfig = {
        name: "test-session",
        types: ["cookies"],
      };

      const path = getSessionPath(config, TEST_DIR);
      expect(path).toBe(join(TEST_DIR, ".demo-reel-sessions/test-session.json"));
    });
  });

  describe("Legacy Cookie Functions", () => {
    it("should load and save legacy cookies", async () => {
      const { loadCookies, saveCookies, clearCookies } = await import("../src/auth.js");

      // Set a cookie
      await context.addCookies([
        {
          name: "legacyCookie",
          value: "legacyValue",
          domain: ".example.com",
          path: "/",
        },
      ]);

      // Save cookies
      await saveCookies(context, "test-cookies.json", TEST_DIR);

      // Create new context and load cookies
      const newContext = await browser.newContext();
      const loaded = await loadCookies(newContext, "test-cookies.json", TEST_DIR);
      expect(loaded).toBe(true);

      // Verify cookie was loaded
      const cookies = await newContext.cookies();
      expect(cookies.some((c) => c.name === "legacyCookie")).toBe(true);

      await newContext.close();

      // Clear cookies
      await clearCookies("test-cookies.json", TEST_DIR);
    });

    it("should return false when cookie file does not exist", async () => {
      const { loadCookies } = await import("../src/auth.js");

      const newContext = await browser.newContext();
      const loaded = await loadCookies(newContext, "non-existent-cookies.json", TEST_DIR);
      expect(loaded).toBe(false);
      await newContext.close();
    });

    it("should handle empty cookie array", async () => {
      const { loadCookies, saveCookies } = await import("../src/auth.js");

      // Save empty context (no cookies)
      await saveCookies(context, "empty-cookies.json", TEST_DIR);

      const newContext = await browser.newContext();
      const loaded = await loadCookies(newContext, "empty-cookies.json", TEST_DIR);
      expect(loaded).toBe(false);
      await newContext.close();
    });
  });

  describe("Authentication Check", () => {
    it("should check authentication by URL", async () => {
      const { isAuthenticated } = await import("../src/auth.js");

      await page.goto("https://example.com/dashboard");
      let authenticated = await isAuthenticated(page);
      expect(authenticated).toBe(true);

      await page.goto("https://example.com/login");
      authenticated = await isAuthenticated(page);
      expect(authenticated).toBe(false);

      await page.goto("https://example.com/signin");
      authenticated = await isAuthenticated(page);
      expect(authenticated).toBe(false);
    });

    it("should check authentication with custom login URL", async () => {
      const { isAuthenticated } = await import("../src/auth.js");

      await page.goto("https://example.com/auth");
      let authenticated = await isAuthenticated(page, "/auth");
      expect(authenticated).toBe(false);

      await page.goto("https://example.com/home");
      authenticated = await isAuthenticated(page, "/auth");
      expect(authenticated).toBe(true);
    });
  });

  describe("Error Handling and Edge Cases", () => {
    it("should handle validation errors gracefully", async () => {
      const validateConfig: AuthValidateConfig = {
        protectedUrl: "invalid://url",
        successIndicator: { strategy: "id", value: "app" },
      };

      const isValid = await validateSession(page, validateConfig, false);
      expect(isValid).toBe(false);
    });

    it("should handle validation errors with verbose logging", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const validateConfig: AuthValidateConfig = {
        protectedUrl: "invalid://url",
        successIndicator: { strategy: "id", value: "app" },
      };

      const isValid = await validateSession(page, validateConfig, true);
      expect(isValid).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Validation error:"));

      consoleSpy.mockRestore();
    });

    it("should handle closed pages during localStorage capture", async () => {
      const tempPage = await context.newPage();
      await tempPage.goto("https://example.com");
      await tempPage.close();

      const storage = await captureLocalStorage(context);
      expect(storage).toBeUndefined();
    });

    it("should log element visibility with verbose mode", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await page.setContent(TEST_HTML);

      const validateConfig: AuthValidateConfig = {
        protectedUrl: "data:text/html," + encodeURIComponent(TEST_HTML),
        successIndicator: { strategy: "id", value: "app" },
      };

      const isValid = await validateSession(page, validateConfig, true);
      expect(isValid).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Navigating to:"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Current URL:"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Element is visible!"));

      consoleSpy.mockRestore();
    });

    it("should log element timeout with verbose mode", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await page.setContent(TEST_HTML);

      const validateConfig: AuthValidateConfig = {
        protectedUrl: "data:text/html," + encodeURIComponent(TEST_HTML),
        successIndicator: { strategy: "id", value: "non-existent-element" },
      };

      const isValid = await validateSession(page, validateConfig, true);
      expect(isValid).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Element not visible (timeout):"),
      );

      consoleSpy.mockRestore();
    });

    it("should capture and restore session with localStorage", async () => {
      const storageConfig: AuthStorageConfig = {
        name: "test-ls",
        types: ["cookies", "localStorage"],
      };

      // Set up localStorage
      await page.goto("https://example.com");
      await page.evaluate(() => {
        localStorage.setItem("authToken", "secret123");
      });

      // Set up cookies
      await context.addCookies([
        {
          name: "sessionId",
          value: "xyz789",
          domain: ".example.com",
          path: "/",
        },
      ]);

      // Capture session
      const session = await captureSession(context, storageConfig);
      expect(session.cookies).toHaveLength(1);
      expect(session.localStorage).toBeDefined();

      // Create new context and restore
      const newContext = await browser.newContext();
      const newPage = await newContext.newPage();
      await newPage.goto("https://example.com");

      await restoreSession(newContext, newPage, session, storageConfig);

      // Verify localStorage was restored
      const restoredValue = await newPage.evaluate(() => localStorage.getItem("authToken"));
      expect(restoredValue).toBe("secret123");

      // Verify cookie was restored
      const restoredCookies = await newContext.cookies();
      expect(restoredCookies.some((c) => c.name === "sessionId")).toBe(true);

      await newContext.close();
    });
  });
});
