import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { Page, BrowserContext } from 'playwright';

export interface CookieAuth {
  persistCookies: boolean;
  cookieFile?: string;
  loginUrl?: string;
  successUrl?: string;
}

const DEFAULT_COOKIE_FILE = '.demo-reel-cookies.json';

export async function loadCookies(
  context: BrowserContext,
  cookieFile: string = DEFAULT_COOKIE_FILE,
  cwd: string = process.cwd()
): Promise<boolean> {
  const filePath = join(cwd, cookieFile);
  
  try {
    const cookieData = await readFile(filePath, 'utf-8');
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
  cwd: string = process.cwd()
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
  loginUrl?: string
): Promise<boolean> {
  if (!loginUrl) {
    // Simple check: if we're not on a login page, assume authenticated
    const url = page.url();
    return !url.includes('/login') && !url.includes('/signin');
  }
  
  // Check if current URL is different from login URL
  const currentUrl = page.url();
  return !currentUrl.includes(loginUrl);
}

export async function clearCookies(
  cookieFile: string = DEFAULT_COOKIE_FILE,
  cwd: string = process.cwd()
): Promise<void> {
  const filePath = join(cwd, cookieFile);
  
  try {
    await writeFile(filePath, '[]');
  } catch {
    // Ignore errors
  }
}
