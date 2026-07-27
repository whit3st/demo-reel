import { chromium } from "playwright";
import { join } from "path";
import type { DemoReelConfig } from "../schemas.js";
import type { BrowserSession } from "./types.js";

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Chromium launch options shared by both launchers.
 *
 * `DEMO_REEL_EXECUTABLE_PATH` points Playwright at a browser already installed
 * on the host instead of the bundled Chromium. Needed when a page depends on a
 * proprietary component the open-source build omits — most often PDFium:
 * bundled Chromium cannot display an embedded PDF (it renders "PDF preview is
 * not supported in this browser") where Brave or Chrome can. Ignored when
 * unset, so the default stays the bundled browser.
 */
export function chromiumLaunchOptions(headed: boolean): {
  headless: boolean;
  executablePath?: string;
} {
  const executablePath = process.env.DEMO_REEL_EXECUTABLE_PATH;
  return {
    headless: !headed,
    ...(executablePath ? { executablePath } : {}),
  };
}

export async function launchBrowser(
  config: DemoReelConfig,
  headed: boolean = false,
): Promise<BrowserSession> {
  const browser = await chromium.launch(chromiumLaunchOptions(headed));
  const context = await browser.newContext({
    viewport: config.video.resolution,
  });
  context.setDefaultTimeout(DEFAULT_TIMEOUT_MS);
  const page = await context.newPage();
  return { browser, context, page, isRecording: false };
}

export async function launchRecordingBrowser(
  config: DemoReelConfig,
  headed: boolean = false,
): Promise<BrowserSession> {
  const browser = await chromium.launch(chromiumLaunchOptions(headed));
  const context = await browser.newContext({
    viewport: config.video.resolution,
    recordVideo: {
      dir: join(process.cwd(), ".demo-reel-temp"),
      size: config.video.resolution,
    },
  });
  context.setDefaultTimeout(DEFAULT_TIMEOUT_MS);
  const page = await context.newPage();
  return { browser, context, page, isRecording: true };
}

export async function closeSession(
  session: BrowserSession,
  saveSessionFn?: () => Promise<void>,
): Promise<string | null> {
  const { page, context, browser, isRecording } = session;

  await page.close();

  let tempVideoPath: string | null = null;
  if (isRecording) {
    const video = page.video();
    if (video) {
      tempVideoPath = await video.path();
    }
  }

  if (saveSessionFn) {
    await saveSessionFn();
  }

  await context.close();
  await browser.close();

  if (isRecording && !tempVideoPath) {
    throw new Error("No video was recorded");
  }

  return tempVideoPath;
}
