import type { Browser, BrowserContext, Page } from "playwright";

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  isRecording: boolean;
  /**
   * Wall clock when the recording began, stamped as close to the first frame as
   * the API allows — immediately after the page that `recordVideo` captures is
   * created. Everything between this and the first scene is filmed but was
   * never asked for, so the pipeline needs it to know where the scene clock's
   * origin sits inside the video.
   */
  recordingStartedAt?: number;
  /** Wall clock when the recording stopped, stamped before the page closes. */
  recordingEndedAt?: number;
}
