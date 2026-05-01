import type { Browser, BrowserContext, Page } from "playwright";

export interface RuntimeArtifacts {
  dir?: string;
  screenshotPath?: string;
  tracePath?: string;
  htmlPath?: string;
  [key: string]: string | undefined;
}

export interface RuntimeFailure {
  message: string;
  stepIndex?: number;
  stack?: string;
}

export interface RuntimeResult {
  ok: boolean;
  durationMs: number;
  artifacts?: RuntimeArtifacts;
  failure?: RuntimeFailure;
}

export interface RuntimeContext {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}
