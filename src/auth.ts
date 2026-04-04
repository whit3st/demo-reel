import { mkdir, readFile, writeFile, unlink } from "fs/promises";
import { join } from "path";
import type { Page, BrowserContext } from "playwright";
import type {
  AuthStorageConfig,
  AuthValidateConfig,
  StorageType,
} from "./schemas.js";

// Session data structure
export interface SessionData {
  name: string;
  timestamp: number;
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Strict" | "Lax" | "None";
  }>;
  localStorage?: Record<string, Record<string, string>>; // domain -> key-value pairs
}

const DEFAULT_SESSIONS_DIR = ".demo-reel-sessions";

function getSessionFilePath(
  sessionName: string,
  cwd: string = process.cwd(),
): string {
  return join(cwd, DEFAULT_SESSIONS_DIR, `${sessionName}.json`);
}

/**
 * Load session data from file
 */
export async function loadSession(
  sessionName: string,
  cwd: string = process.cwd(),
): Promise<SessionData | null> {
  const filePath = getSessionFilePath(sessionName, cwd);

  try {
    const data = await readFile(filePath, "utf-8");
    return JSON.parse(data) as SessionData;
  } catch {
    return null;
  }
}

/**
 * Save session data to file
 */
export async function saveSession(
  sessionData: SessionData,
  cwd: string = process.cwd(),
): Promise<void> {
  const filePath = getSessionFilePath(sessionData.name, cwd);
  const dir = join(cwd, DEFAULT_SESSIONS_DIR);

  await mkdir(dir, { recursive: true });
  await writeFile(filePath, JSON.stringify(sessionData, null, 2));
}

/**
 * Delete session file
 */
export async function clearSession(
  sessionName: string,
  cwd: string = process.cwd(),
): Promise<void> {
  const filePath = getSessionFilePath(sessionName, cwd);

  try {
    await unlink(filePath);
  } catch {
    // File doesn't exist, ignore
  }
}

/**
 * Capture cookies from browser context
 */
export async function captureCookies(
  context: BrowserContext,
): Promise<SessionData["cookies"]> {
  const cookies = await context.cookies();
  return cookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    expires: cookie.expires,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite as "Strict" | "Lax" | "None",
  }));
}

/**
 * Capture localStorage from all pages in context
 */
export async function captureLocalStorage(
  context: BrowserContext,
): Promise<SessionData["localStorage"]> {
  const localStorageData: Record<string, Record<string, string>> = {};
  const pages = context.pages();

  for (const page of pages) {
    const url = new URL(page.url());
    const domain = url.hostname;

    try {
      const storage = await page.evaluate(() => {
        const data: Record<string, string> = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) {
            data[key] = localStorage.getItem(key) || "";
          }
        }
        return data;
      });

      if (Object.keys(storage).length > 0) {
        localStorageData[domain] = storage;
      }
    } catch {
      // Page might be closed or unreachable
    }
  }

  return Object.keys(localStorageData).length > 0
    ? localStorageData
    : undefined;
}

/**
 * Restore cookies to browser context
 */
export async function restoreCookies(
  context: BrowserContext,
  cookies: SessionData["cookies"],
): Promise<void> {
  if (cookies.length > 0) {
    await context.addCookies(cookies);
  }
}

/**
 * Restore localStorage to a page
 */
export async function restoreLocalStorage(
  page: Page,
  storageData: Record<string, Record<string, string>>,
): Promise<void> {
  const url = new URL(page.url());
  const domain = url.hostname;
  const domainStorage = storageData[domain];

  if (domainStorage) {
    await page.evaluate((data) => {
      for (const [key, value] of Object.entries(data)) {
        localStorage.setItem(key, value);
      }
    }, domainStorage);
  }
}

/**
 * Validate if current session is still valid by checking for success indicator element
 */
export async function validateSession(
  page: Page,
  validateConfig: AuthValidateConfig,
  verbose?: boolean,
): Promise<boolean> {
  try {
    // Navigate to protected URL
    if (verbose) {
      console.log(`  → Navigating to: ${validateConfig.protectedUrl}`);
    }
    await page.goto(validateConfig.protectedUrl, { waitUntil: "networkidle" });

    const currentUrl = page.url();
    if (verbose) {
      console.log(`  → Current URL: ${currentUrl}`);
    }

    // Wait a bit for any redirects or dynamic content
    await page.waitForTimeout(1000);

    // Try to find the success indicator element
    const selector = validateConfig.successIndicator;
    let locator;
    let selectorString: string | undefined;

    switch (selector.strategy) {
      case "testId":
        locator = page.getByTestId(selector.value);
        selectorString = `[data-testid="${selector.value}"]`;
        break;
      case "id":
        locator = page.locator(`#${selector.value}`);
        selectorString = `#${selector.value}`;
        break;
      case "class":
        locator = page.locator(`.${selector.value}`);
        selectorString = `.${selector.value}`;
        break;
      case "href":
        locator = page.locator(`[href="${selector.value}"]`);
        selectorString = `[href="${selector.value}"]`;
        break;
      case "data-node-id":
        locator = page.locator(`[data-node-id="${selector.value}"]`);
        selectorString = `[data-node-id="${selector.value}"]`;
        break;
    }

    if (locator) {
      locator = selector.index !== undefined
        ? locator.nth(selector.index)
        : locator.first();
    }

    if (verbose) {
      console.log(`  → Couldn't find selector. ${selectorString}`);
    }

    // Count matching elements for debugging
    const count = await locator?.count().catch(() => 0);
    if (verbose) {
      console.log(`  → Found ${count} matching element(s)`);
    }

    // Wait for element to be visible with timeout (indicates successful auth)
    // Use .first() to avoid strict mode violation when multiple elements match
    let isVisible = false;
    try {
      await locator?.waitFor({ state: "visible", timeout: 5000 });
      isVisible = true;
      if (verbose) {
        console.log("  → Element is visible!");
      }
    } catch (error) {
      isVisible = false;
      if (verbose) {
        console.log(
          `  → Element not visible (timeout): ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
    }

    return isVisible;
  } catch (error) {
    if (verbose) {
      console.log(
        `  → Validation error: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
    return false;
  }
}

/**
 * Check if a specific storage type is configured
 */
export function hasStorageType(
  storageConfig: AuthStorageConfig,
  type: StorageType,
): boolean {
  return storageConfig.types.includes(type);
}

/**
 * Get the session file path for a given storage config
 */
export function getSessionPath(
  storageConfig: AuthStorageConfig,
  cwd: string = process.cwd(),
): string {
  if (storageConfig.file) {
    return join(cwd, storageConfig.file);
  }
  return getSessionFilePath(storageConfig.name, cwd);
}

/**
 * Restore session to browser context and page
 */
export async function restoreSession(
  context: BrowserContext,
  page: Page,
  sessionData: SessionData,
  storageConfig: AuthStorageConfig,
): Promise<void> {
  // Restore cookies if configured
  if (hasStorageType(storageConfig, "cookies")) {
    await restoreCookies(context, sessionData.cookies);
  }

  // Restore localStorage if configured and data exists
  if (
    hasStorageType(storageConfig, "localStorage") &&
    sessionData.localStorage
  ) {
    await restoreLocalStorage(page, sessionData.localStorage);
  }
}

/**
 * Capture session from browser context
 */
export async function captureSession(
  context: BrowserContext,
  storageConfig: AuthStorageConfig,
): Promise<SessionData> {
  const sessionData: SessionData = {
    name: storageConfig.name,
    timestamp: Date.now(),
    cookies: [],
  };

  // Capture cookies if configured
  if (hasStorageType(storageConfig, "cookies")) {
    sessionData.cookies = await captureCookies(context);
  }

  // Capture localStorage if configured
  if (hasStorageType(storageConfig, "localStorage")) {
    sessionData.localStorage = await captureLocalStorage(context);
  }

  return sessionData;
}

// Legacy exports for backward compatibility
export interface CookieAuth {
  persistCookies: boolean;
  cookieFile?: string;
  loginUrl?: string;
  successUrl?: string;
}

const DEFAULT_COOKIE_FILE = ".demo-reel-cookies.json";

export async function loadCookies(
  context: BrowserContext,
  cookieFile: string = DEFAULT_COOKIE_FILE,
  cwd: string = process.cwd(),
): Promise<boolean> {
  const filePath = join(cwd, cookieFile);

  try {
    const cookieData = await readFile(filePath, "utf-8");
    const cookies = JSON.parse(cookieData);

    if (Array.isArray(cookies) && cookies.length > 0) {
      await context.addCookies(cookies);
      return true;
    }
  } catch {
    // File doesn't exist or is invalid - no cookies to restore
  }

  return false;
}

export async function saveCookies(
  context: BrowserContext,
  cookieFile: string = DEFAULT_COOKIE_FILE,
  cwd: string = process.cwd(),
): Promise<void> {
  const filePath = join(cwd, cookieFile);
  const cookies = await context.cookies();

  if (cookies.length > 0) {
    await mkdir(cwd, { recursive: true });
    await writeFile(filePath, JSON.stringify(cookies, null, 2));
  }
}

export async function isAuthenticated(
  page: Page,
  loginUrl?: string,
): Promise<boolean> {
  if (!loginUrl) {
    const url = page.url();
    return !url.includes("/login") && !url.includes("/signin");
  }

  const currentUrl = page.url();
  return !currentUrl.includes(loginUrl);
}

export async function clearCookies(
  cookieFile: string = DEFAULT_COOKIE_FILE,
  cwd: string = process.cwd(),
): Promise<void> {
  const filePath = join(cwd, cookieFile);

  try {
    await writeFile(filePath, "[]");
  } catch {
    // Ignore errors
  }
}
