import { mkdir } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { DemoReelConfig } from './schemas.js';
import { runDemo } from './runner.js';
import { mergeAudioVideo, type AudioConfig } from './audio-processor.js';
import { loadCookies, saveCookies } from './auth.js';

export interface VideoResult {
  page: Page;
  context: BrowserContext;
  browser: Browser;
  tempVideoPath: string;
}

export async function startRecording(config: DemoReelConfig, configPath: string): Promise<VideoResult> {
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
  
  // Load cookies if auth persistence is enabled
  if (config.auth?.persistCookies) {
    const configDir = dirname(configPath);
    const cookieFile = config.auth.cookieFile;
    const cookiesLoaded = await loadCookies(context, cookieFile, configDir);
    if (cookiesLoaded) {
      console.log('✓ Restored session from saved cookies');
    }
  }
  
  const page = await context.newPage();
  
  return {
    page,
    context,
    browser,
    tempVideoPath: '', // Will be set after recording
  };
}

export async function stopRecording(result: VideoResult, saveCookiesFn?: () => Promise<void>): Promise<string> {
  const { page, context, browser } = result;
  
  // Close page first to finish video recording
  await page.close();
  
  // Get the video path before closing context
  const video = page.video();
  let tempVideoPath = '';
  
  if (video) {
    tempVideoPath = await video.path();
  }
  
  // Save cookies if callback provided (before closing context)
  if (saveCookiesFn) {
    await saveCookiesFn();
  }
  
  await context.close();
  await browser.close();
  
  if (!tempVideoPath) {
    throw new Error('No video was recorded');
  }
  
  return tempVideoPath;
}

export async function processVideoWithAudio(
  tempVideoPath: string,
  outputPath: string,
  audio: AudioConfig | undefined,
  configPath: string
): Promise<string> {
  // Ensure output directory exists
  await mkdir(dirname(outputPath), { recursive: true });
  
  if (!audio || (!audio.narration && !audio.background)) {
    // No audio - just copy video
    const { copyFile } = await import('fs/promises');
    await copyFile(tempVideoPath, outputPath);
    return outputPath;
  }
  
  // Resolve audio paths relative to config file
  const resolvedAudio: AudioConfig = {};
  const configDir = dirname(configPath);
  
  if (audio.narration) {
    resolvedAudio.narration = resolve(configDir, audio.narration);
    resolvedAudio.narrationDelay = audio.narrationDelay;
  }
  if (audio.background) {
    resolvedAudio.background = resolve(configDir, audio.background);
    resolvedAudio.backgroundVolume = audio.backgroundVolume ?? 0.3;
  }
  
  // Mix audio with video
  await mergeAudioVideo({
    videoPath: tempVideoPath,
    outputPath,
    audio: resolvedAudio,
  });
  
  return outputPath;
}

export async function runVideoScenario(
  config: DemoReelConfig,
  outputPath: string,
  configPath: string,
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
  
    const recording = await startRecording(config, configPath);
  
  try {
    if (verbose) {
      console.log('Running demo scenario...');
    }
    
    await runDemo(recording.page, config);
    
    if (verbose) {
      console.log('Stopping recording...');
    }
    
    // Prepare cookie save function if auth persistence is enabled
    const saveCookiesFn = config.auth?.persistCookies
      ? async () => {
          const configDir = dirname(configPath);
          const cookieFile = config.auth?.cookieFile;
          await saveCookies(recording.context, cookieFile, configDir);
          if (verbose) {
            console.log('✓ Saved session cookies');
          }
        }
      : undefined;
    
    const tempVideoPath = await stopRecording(recording, saveCookiesFn);
    
    if (verbose) {
      if (config.audio?.narration || config.audio?.background) {
        console.log('Mixing audio...');
      } else {
        console.log('Finalizing video...');
      }
    }
    
    const finalPath = await processVideoWithAudio(
      tempVideoPath,
      outputPath,
      config.audio,
      configPath
    );
    
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
