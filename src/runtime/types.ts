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
  target?: string;
  expected?: string;
  actual?: string;
  context?: string;
  stack?: string;
  type?: "assertion" | "runtime";
}

export interface RuntimeAttemptResult {
  attempt: number;
  ok: boolean;
  durationMs: number;
  artifacts?: RuntimeArtifacts;
  failure?: RuntimeFailure;
}

export interface RuntimeResult {
  ok: boolean;
  durationMs: number;
  artifacts?: RuntimeArtifacts;
  failure?: RuntimeFailure;
  attempts?: RuntimeAttemptResult[];
  retryCount?: number;
  iteration?: number;
  flaky?: boolean;
  exitCode?: 0 | 1 | 2;
}

export interface RuntimeContext {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}
