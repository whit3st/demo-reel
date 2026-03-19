import { mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { DemoReelConfig } from './schemas.js';
import { runDemo } from './runner.js';

export interface VideoResult {
  page: Page;
  context: BrowserContext;
  browser: Browser;
  tempVideoPath: string;
}

export async function startRecording(config: DemoReelConfig): Promise<VideoResult> {
  const browser = await chromium.launch({ headless: true });
  
  const context = await browser.newContext({
    viewport: config.viewport,
    recordVideo: config.video.enabled
      ? {
          dir: join(process.cwd(), '.demo-reel-temp'),
          size: config.video.size,
        }
      : undefined,
  });
  
  const page = await context.newPage();
  
  return {
    page,
    context,
    browser,
    tempVideoPath: '', // Will be set after recording
  };
}

export async function stopRecording(result: VideoResult, outputPath: string): Promise<string> {
  const { page, context, browser } = result;
  
  // Close page first to finish video recording
  await page.close();
  
  // Get the video path before closing context
  const video = page.video();
  let tempVideoPath = '';
  
  if (video) {
    tempVideoPath = await video.path();
  }
  
  await context.close();
  await browser.close();
  
  if (!tempVideoPath) {
    throw new Error('No video was recorded');
  }
  
  // Ensure output directory exists
  await mkdir(dirname(outputPath), { recursive: true });
  
  // Copy video to final destination
  const { copyFile } = await import('fs/promises');
  await copyFile(tempVideoPath, outputPath);
  
  return outputPath;
}

export async function runVideoScenario(
  config: DemoReelConfig,
  outputPath: string,
  options: {
    verbose?: boolean;
    dryRun?: boolean;
  } = {}
): Promise<string> {
  const { verbose, dryRun } = options;
  
  if (dryRun) {
    console.log('✓ Config validated successfully (dry run)');
    return outputPath;
  }
  
  const startTime = Date.now();
  
  if (verbose) {
    console.log('Starting browser and recording...');
  }
  
  const recording = await startRecording(config);
  
  try {
    if (verbose) {
      console.log('Running demo scenario...');
    }
    
    await runDemo(recording.page, config);
    
    if (verbose) {
      console.log('Finalizing video...');
    }
    
    const finalPath = await stopRecording(recording, outputPath);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log(`✓ Video created (${duration}s) → ${finalPath}`);
    
    return finalPath;
  } catch (error) {
    // Clean up on error
    await recording.context.close().catch(() => {});
    await recording.browser.close().catch(() => {});
    throw error;
  }
}
