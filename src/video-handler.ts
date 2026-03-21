import { mkdir } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { DemoReelConfig, AuthConfig, AuthBehaviorConfig } from './schemas.js';
import { runDemo, runStepSimple } from './runner.js';
import { mergeAudioVideo, type AudioConfig } from './audio-processor.js';
import { 
  loadSession, 
  saveSession, 
  clearSession,
  validateSession, 
  captureSession, 
  restoreSession
} from './auth.js';

export interface VideoResult {
  page: Page;
  context: BrowserContext;
  browser: Browser;
  tempVideoPath: string;
}

// Default behavior settings
const DEFAULT_BEHAVIOR: Required<AuthBehaviorConfig> = {
  autoReauth: true,
  forceReauth: false,
  clearInvalid: true,
};

/**
 * Handle authentication flow - check session, validate, login if needed
 */
export async function handleAuth(
  context: BrowserContext,
  page: Page,
  authConfig: AuthConfig,
  configPath: string,
  verbose?: boolean
): Promise<boolean> {
  const configDir = dirname(configPath);
  const behavior = { ...DEFAULT_BEHAVIOR, ...authConfig.behavior };
  const { storage, validate, loginSteps } = authConfig;
  
  // Force reauth if requested
  if (behavior.forceReauth) {
    if (verbose) {
      console.log('→ Force re-authentication requested');
    }
    await clearSession(storage.name, configDir);
  }
  
  // Try to load existing session
  const existingSession = await loadSession(storage.name, configDir);
  
  if (existingSession && !behavior.forceReauth) {
    if (verbose) {
      console.log('→ Found saved session, validating...');
    }
    
    // Restore session to browser
    await restoreSession(context, page, existingSession, storage);
    
    // Validate session by checking protected URL
    const isValid = await validateSession(page, validate, verbose);
    
    if (isValid) {
      if (verbose) {
        console.log('✓ Session is valid');
      }
      return true;
    }
    
    // Session is invalid
    if (verbose) {
      console.log('✗ Session is invalid or expired');
    }
    
    if (behavior.clearInvalid) {
      await clearSession(storage.name, configDir);
      if (verbose) {
        console.log('→ Cleared invalid session');
      }
    }
  }
  
  // No valid session - run login steps
  if (verbose) {
    console.log('→ Running login steps...');
  }
  
  // Run each login step
  for (const step of loginSteps) {
    await runStepSimple(page, step);
  }
  
  // Validate login was successful
  const loginSuccess = await validateSession(page, validate, verbose);
  
  if (!loginSuccess) {
    throw new Error('Login failed: could not find success indicator after login steps');
  }
  
  if (verbose) {
    console.log('✓ Login successful');
  }
  
  // Capture and save session
  const sessionData = await captureSession(context, storage);
  await saveSession(sessionData, configDir);
  
  if (verbose) {
    const storageTypes = storage.types.join(', ');
    console.log(`✓ Saved session (${storageTypes})`);
  }
  
  return true;
}

export async function startRecording(config: DemoReelConfig, _configPath: string): Promise<VideoResult> {
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

export async function stopRecording(result: VideoResult, saveSessionFn?: () => Promise<void>): Promise<string> {
  const { page, context, browser } = result;
  
  // Close page first to finish video recording
  await page.close();
  
  // Get the video path before closing context
  const video = page.video();
  let tempVideoPath = '';
  
  if (video) {
    tempVideoPath = await video.path();
  }
  
  // Save session if callback provided (before closing context)
  if (saveSessionFn) {
    await saveSessionFn();
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
    // Handle authentication if configured
    if (config.auth) {
      if (verbose) {
        console.log('Handling authentication...');
      }
      await handleAuth(recording.context, recording.page, config.auth, configPath, verbose);
    }
    
    if (verbose) {
      console.log('Running demo scenario...');
    }
    
    await runDemo(recording.page, config);
    
    if (verbose) {
      console.log('Stopping recording...');
    }
    
    // Prepare session save function if auth is configured
    const saveSessionFn = config.auth
      ? async () => {
          const configDir = dirname(configPath);
          const sessionData = await captureSession(recording.context, config.auth!.storage);
          await saveSession(sessionData, configDir);
          if (verbose) {
            console.log('✓ Saved session state');
          }
        }
      : undefined;
    
    const tempVideoPath = await stopRecording(recording, saveSessionFn);
    
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
