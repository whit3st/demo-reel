import { mkdir, unlink, rmdir, writeFile as fsWriteFile, readFile } from "fs/promises";
import { basename, dirname, join, resolve } from "path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { DemoReelConfig, AuthConfig, AuthBehaviorConfig } from "./schemas.js";
import { runDemo, runPreSteps, runStepSimple, type SceneTimestamp } from "./runner.js";
import { mergeAudioVideo, type AudioConfig } from "./audio-processor.js";
import {
  loadSession,
  saveSession,
  clearSession,
  validateSession,
  captureSession,
  restoreSession,
} from "./auth.js";

export interface VideoResult {
  page: Page;
  context: BrowserContext;
  browser: Browser;
  tempVideoPath: string;
}

let onBrowserCreated: ((browser: Browser, context: BrowserContext) => void) | null = null;

export function setOnBrowserCreated(cb: (browser: Browser, context: BrowserContext) => void): void {
  onBrowserCreated = cb;
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
  verbose?: boolean,
): Promise<boolean> {
  const configDir = dirname(configPath);
  const behavior = { ...DEFAULT_BEHAVIOR, ...authConfig.behavior };
  const { storage, validate, loginSteps } = authConfig;

  // Force reauth if requested
  if (behavior.forceReauth) {
    if (verbose) {
      console.log("→ Force re-authentication requested");
    }
    await clearSession(storage.name, configDir);
  }

  // Try to load existing session
  const existingSession = await loadSession(storage.name, configDir);

  if (existingSession && !behavior.forceReauth) {
    if (verbose) {
      console.log("→ Found saved session, validating...");
    }

    // Restore session to browser
    await restoreSession(context, page, existingSession, storage);

    // Validate session by checking protected URL
    const isValid = await validateSession(page, validate, verbose);

    if (isValid) {
      if (verbose) {
        console.log("✓ Session is valid");
      }
      return true;
    }

    // Session is invalid
    if (verbose) {
      console.log("✗ Session is invalid or expired");
    }

    if (behavior.clearInvalid) {
      await clearSession(storage.name, configDir);
      if (verbose) {
        console.log("→ Cleared invalid session");
      }
    }
  }

  // No valid session - run login steps
  if (verbose) {
    console.log("→ Running login steps...");
  }

  // Run each login step
  for (const step of loginSteps) {
    await runStepSimple(page, step);
  }

  // Validate login was successful
  const loginSuccess = await validateSession(page, validate, verbose);

  if (!loginSuccess) {
    throw new Error("Login failed: could not find success indicator after login steps");
  }

  if (verbose) {
    console.log("✓ Login successful");
  }

  // Capture and save session
  const sessionData = await captureSession(context, storage);
  await saveSession(sessionData, configDir);

  if (verbose) {
    const storageTypes = storage.types.join(", ");
    console.log(`✓ Saved session (${storageTypes})`);
  }

  return true;
}

export async function startBrowser(
  config: DemoReelConfig,
  headed: boolean = false,
): Promise<VideoResult> {
  const browser = await chromium.launch({ headless: !headed });

  const context = await browser.newContext({
    viewport: config.video.resolution,
  });

  const page = await context.newPage();

  if (onBrowserCreated) {
    onBrowserCreated(browser, context);
  }

  return {
    page,
    context,
    browser,
    tempVideoPath: "",
  };
}

export async function startRecording(
  config: DemoReelConfig,
  headed: boolean = false,
): Promise<VideoResult> {
  const browser = await chromium.launch({ headless: !headed });

  const context = await browser.newContext({
    viewport: config.video.resolution,
    recordVideo: {
      dir: join(process.cwd(), ".demo-reel-temp"),
      size: config.video.resolution,
    },
  });

  const page = await context.newPage();

  if (onBrowserCreated) {
    onBrowserCreated(browser, context);
  }

  return {
    page,
    context,
    browser,
    tempVideoPath: "",
  };
}

export async function stopRecording(
  result: VideoResult,
  saveSessionFn?: () => Promise<void>,
): Promise<string> {
  const { page, context, browser } = result;

  // Close page first to finish video recording
  await page.close();

  // Get the video path before closing context
  const video = page.video();
  let tempVideoPath = "";

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
    throw new Error("No video was recorded");
  }

  return tempVideoPath;
}

export async function processVideoWithAudio(
  tempVideoPath: string,
  outputPath: string,
  audio: AudioConfig | undefined,
  configPath: string,
): Promise<string> {
  // Ensure output directory exists
  await mkdir(dirname(outputPath), { recursive: true });

  if (!audio || (!audio.narration && !audio.background)) {
    // No audio - just copy video
    const { copyFile } = await import("fs/promises");
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

// --- Subtitle and metadata generation ---

interface SubtitleCue {
  narration: string;
  startMs: number;
  endMs: number;
  isIntro: boolean;
}

/**
 * Build subtitle cues. When audio is present, use the narrationDelay + audio durations
 * so subtitles sync with the voiceover. Otherwise fall back to recording timestamps.
 */
function buildSubtitleCues(
  sceneTimestamps: SceneTimestamp[],
  config: DemoReelConfig,
): SubtitleCue[] {
  // If we have audio with a timed script, compute subtitle timing from audio offsets
  if (config.audio?.narration && config.scenes) {
    const narrationDelay = config.audio.narrationDelay ?? 0;
    let audioOffset = narrationDelay;

    return sceneTimestamps.map((scene) => {
      // Estimate audio duration from the recording scene duration as fallback
      // The actual audio segment duration would be ideal, but we use the scene gap
      const sceneDurationMs = scene.endMs - scene.startMs;
      const cue: SubtitleCue = {
        narration: scene.narration,
        startMs: audioOffset,
        endMs: audioOffset + sceneDurationMs,
        isIntro: scene.isIntro,
      };
      audioOffset = cue.endMs;
      return cue;
    });
  }

  // No audio — use recording timestamps directly
  return sceneTimestamps.map((scene) => ({
    narration: scene.narration,
    startMs: scene.startMs,
    endMs: scene.endMs,
    isIntro: scene.isIntro,
  }));
}

/**
 * Try to load audio timing from a timed .script.json file.
 * Returns audio offsets + durations per scene if available.
 */
async function loadAudioTiming(
  configPath: string,
): Promise<{ audioOffsetMs: number; audioDurationMs: number; gapAfterMs: number }[] | null> {
  // Look for a .script.json next to the config
  const scriptPath = configPath.replace(/\.demo\.ts$/, ".script.json");
  try {
    const raw = await readFile(scriptPath, "utf-8");
    const script = JSON.parse(raw);
    if (script.scenes && script.audioPath) {
      return script.scenes.map((s: any) => ({
        audioOffsetMs: s.audioOffsetMs ?? 0,
        audioDurationMs: s.audioDurationMs ?? 0,
        gapAfterMs: s.gapAfterMs ?? 0,
      }));
    }
  } catch {
    // No script file or invalid format
  }
  return null;
}

/**
 * Build subtitle cues from audio timing data (preferred) or recording timestamps (fallback).
 */
async function buildSubtitleCuesWithAudioTiming(
  sceneTimestamps: SceneTimestamp[],
  config: DemoReelConfig,
  configPath: string,
): Promise<SubtitleCue[]> {
  if (!config.audio?.narration) {
    return buildSubtitleCues(sceneTimestamps, config);
  }

  const narrationDelay = config.audio.narrationDelay ?? 0;
  const audioTiming = await loadAudioTiming(configPath);

  if (audioTiming && audioTiming.length === sceneTimestamps.length) {
    // Use audio timing — these are the actual positions in the narration audio
    return sceneTimestamps.map((scene, i) => {
      const timing = audioTiming[i];
      return {
        narration: scene.narration,
        startMs: narrationDelay + timing.audioOffsetMs,
        endMs: narrationDelay + timing.audioOffsetMs + timing.audioDurationMs,
        isIntro: scene.isIntro,
      };
    });
  }

  // Fallback to estimate-based approach
  return buildSubtitleCues(sceneTimestamps, config);
}

function formatTimecode(ms: number, separator: string): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${separator}${String(millis).padStart(3, "0")}`;
}

function generateSRT(cues: SubtitleCue[]): string {
  return cues
    .map((cue, i) => {
      const start = formatTimecode(cue.startMs, ",");
      const end = formatTimecode(cue.endMs, ",");
      return `${i + 1}\n${start} --> ${end}\n${cue.narration}\n`;
    })
    .join("\n");
}

function generateVTT(cues: SubtitleCue[]): string {
  const lines = cues
    .map((cue) => {
      const start = formatTimecode(cue.startMs, ".");
      const end = formatTimecode(cue.endMs, ".");
      return `${start} --> ${end}\n${cue.narration}\n`;
    })
    .join("\n");
  return `WEBVTT\n\n${lines}`;
}

function generateMetadata(
  sceneTimestamps: SceneTimestamp[],
  subtitleCues: SubtitleCue[],
  videoPath: string,
) {
  const scenes = sceneTimestamps.map((t, i) => ({
    index: t.sceneIndex,
    narration: t.narration,
    isIntro: t.isIntro,
    // Visual timing (when things happen on screen)
    visualStartMs: t.startMs,
    visualEndMs: t.endMs,
    // Audio timing (when narration is heard) — from subtitles
    audioStartMs: subtitleCues[i]?.startMs ?? t.startMs,
    audioEndMs: subtitleCues[i]?.endMs ?? t.endMs,
  }));

  const introScene = scenes.find((s) => s.isIntro);
  const lastScene = scenes[scenes.length - 1];

  return {
    video: basename(videoPath),
    scenes,
    introEndMs: introScene ? introScene.visualEndMs : null,
    totalDurationMs: lastScene ? lastScene.visualEndMs : 0,
  };
}

export async function runVideoScenario(
  config: DemoReelConfig,
  outputPath: string,
  configPath: string,
  options: {
    verbose?: boolean;
    dryRun?: boolean;
    headed?: boolean;
  } = {},
): Promise<string> {
  const { verbose, dryRun, headed } = options;

  if (dryRun) {
    console.log("✓ Config validated successfully (dry run)");
    return outputPath;
  }

  const startTime = Date.now();

  if (config.auth) {
    if (verbose) {
      console.log("Starting browser for authentication (no recording)...");
    }

    const authBrowser = await startBrowser(config, headed);

    try {
      await handleAuth(authBrowser.context, authBrowser.page, config.auth, configPath, verbose);
    } finally {
      await authBrowser.context.close();
      await authBrowser.browser.close();
    }

    if (verbose) {
      console.log("Starting browser and recording...");
    }
  } else {
    if (verbose) {
      console.log("Starting browser and recording...");
    }
  }

  const recording = await startRecording(config, headed);

  try {
    if (config.auth) {
      if (verbose) {
        console.log("Restoring session for recording...");
      }
      await handleAuth(recording.context, recording.page, config.auth, configPath, verbose);
    }

    if (config.preSteps && config.preSteps.length > 0) {
      if (verbose) {
        console.log("Running pre-steps...");
      }
      await runPreSteps(recording.page, config.preSteps);
    }

    if (verbose) {
      console.log("Running demo scenario...");
    }

    const sceneTimestamps = await runDemo(recording.page, config);

    if (verbose) {
      console.log("Stopping recording...");
      if (sceneTimestamps.length > 0) {
        console.log(`Tracked ${sceneTimestamps.length} scene(s)`);
      }
    }

    // Prepare session save function if auth is configured
    const saveSessionFn = config.auth
      ? async () => {
          const configDir = dirname(configPath);
          const sessionData = await captureSession(recording.context, config.auth!.storage);
          await saveSession(sessionData, configDir);
          if (verbose) {
            console.log("✓ Saved session state");
          }
        }
      : undefined;

    const tempVideoPath = await stopRecording(recording, saveSessionFn);

    if (verbose) {
      if (config.audio?.narration || config.audio?.background) {
        console.log("Mixing audio...");
      } else {
        console.log("Finalizing video...");
      }
    }

    const finalPath = await processVideoWithAudio(
      tempVideoPath,
      outputPath,
      config.audio,
      configPath,
    );

    // Clean up temp video file and directory
    try {
      await unlink(tempVideoPath);
      await rmdir(join(process.cwd(), ".demo-reel-temp")).catch(() => {});
    } catch {
      // Ignore cleanup errors
    }

    // Generate subtitles and metadata if scene timestamps are available
    if (sceneTimestamps.length > 0) {
      const basePath = finalPath.replace(/\.[^.]+$/, "");

      const subtitleCues = await buildSubtitleCuesWithAudioTiming(
        sceneTimestamps, config, configPath,
      );

      const srt = generateSRT(subtitleCues);
      await fsWriteFile(`${basePath}.srt`, srt, "utf-8");

      const vtt = generateVTT(subtitleCues);
      await fsWriteFile(`${basePath}.vtt`, vtt, "utf-8");

      const meta = generateMetadata(sceneTimestamps, subtitleCues, finalPath);
      await fsWriteFile(`${basePath}.meta.json`, JSON.stringify(meta, null, 2), "utf-8");

      if (verbose) {
        console.log(`✓ Subtitles: ${basePath}.srt, ${basePath}.vtt`);
        console.log(`✓ Metadata: ${basePath}.meta.json`);
      }
    }

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
