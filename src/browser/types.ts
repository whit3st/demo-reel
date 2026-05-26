import type { Browser, BrowserContext, Page } from "playwright";

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  isRecording: boolean;
}
