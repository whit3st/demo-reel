import { mkdir, unlink, rmdir, writeFile as fsWriteFile, readFile } from "fs/promises";
import { basename, dirname, join, resolve } from "path";
import type { Browser, BrowserContext, Page } from "playwright";
import type { DemoReelConfig, AuthConfig, AuthBehaviorConfig, VideoSpan } from "./schemas.js";
import { runDemo, runSteps, runStepSimple, type SceneTimestamp } from "./runner.js";
import { motionPresets, typingPresets, timingPresets } from "./presets.js";
import {
  mergeAudioVideo,
  resolveAudioPaths,
  type AudioConfig,
  type NarrationPlacement,
} from "./audio-processor.js";
import { narrationManifestSchema } from "./narration-manifest.js";
import { measureMediaDurationMs, trimVideo, type VideoTrim } from "./ffmpeg/utils.js";
import {
  loadSession,
  saveSession,
  clearSession,
  clearBrowserSession,
  resolveSessionBaseDir,
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
  const configDir = resolveSessionBaseDir(configPath);
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
      // Clear the BROWSER as well, not just the file. The restored session
      // carries IdP cookies alongside the app's, and they expire separately —
      // leaving a live IdP cookie makes the login steps below complete silently
      // via SSO, so whichever field they wait for never renders.
      await clearBrowserSession(context, page);
      if (verbose) {
        console.log("→ Cleared invalid session (file + browser state)");
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

import {
  launchBrowser as _launchBrowser,
  launchRecordingBrowser as _launchRecordingBrowser,
  closeSession as _closeSession,
} from "./browser/launcher.js";
import type { BrowserSession } from "./browser/types.js";

export async function startBrowser(
  config: DemoReelConfig,
  headed: boolean = false,
): Promise<VideoResult> {
  const session = await _launchBrowser(config, headed);

  if (onBrowserCreated) {
    onBrowserCreated(session.browser, session.context);
  }

  return {
    page: session.page,
    context: session.context,
    browser: session.browser,
    tempVideoPath: "",
  };
}

export async function startRecording(
  config: DemoReelConfig,
  headed: boolean = false,
): Promise<VideoResult> {
  const session = await _launchRecordingBrowser(config, headed);

  if (onBrowserCreated) {
    onBrowserCreated(session.browser, session.context);
  }

  return {
    page: session.page,
    context: session.context,
    browser: session.browser,
    tempVideoPath: "",
  };
}

export async function stopRecording(
  result: VideoResult,
  saveSessionFn?: () => Promise<void>,
): Promise<string> {
  const session: BrowserSession = {
    page: result.page,
    context: result.context,
    browser: result.browser,
    isRecording: true,
  };

  const tempVideoPath = await _closeSession(session, saveSessionFn);

  if (!tempVideoPath) {
    throw new Error("No video was recorded");
  }

  return tempVideoPath;
}

/**
 * Where the scene clock sits inside the recording.
 *
 * Both are wall-clock measurements taken by the pipeline: `preRollMs` between
 * the recording context opening and the first scene starting, `tailMs` between
 * the last scene ending and the recording stopping.
 */
export interface RecordingTimeline {
  preRollMs: number;
  tailMs: number;
}

/** Maps a step-clock offset onto the finished video's timeline. */
export interface VideoTimeMapping {
  originMs: number;
  scale: number;
}

export const sceneToVideoMs = (mapping: VideoTimeMapping, sceneMs: number): number =>
  mapping.originMs + Math.round(sceneMs * mapping.scale);

export async function processVideoWithAudio(
  tempVideoPath: string,
  outputPath: string,
  audio: AudioConfig | undefined,
  configPath: string,
  sceneTimestamps: SceneTimestamp[],
  narrationSyncMode: string = "auto",
  options: { timeline?: RecordingTimeline; span?: VideoSpan } = {},
): Promise<{
  finalPath: string;
  narrationPlacements: NarrationPlacement[];
  warnings: string[];
  videoTime: VideoTimeMapping;
}> {
  // Ensure output directory exists
  await mkdir(dirname(outputPath), { recursive: true });

  let videoTime: VideoTimeMapping = { originMs: 0, scale: 1 };
  // Explicit opt-in rather than a default here: the policy lives in the schema
  // (`video.span`, default "scenes"), and a caller that says nothing should get
  // the recording it handed over. Trimming also needs the scenes to have been
  // located inside the recording — `span` alone cannot say where to cut.
  const trimming = options.span === "scenes" && options.timeline !== undefined;

  if (!audio || (!audio.narration && !audio.narrationManifest && !audio.background)) {
    // No audio to mix. mergeAudioVideo would return the input untouched here,
    // so a trim has to be its own pass or `span` would silently do nothing for
    // silent runs.
    if (trimming) {
      const recordedMs = await measureMediaDurationMs(tempVideoPath).catch(() => 0);
      const { preRollMs, tailMs } = options.timeline!;
      const durationMs = recordedMs - preRollMs - tailMs;
      if (durationMs > 0) {
        await trimVideo(tempVideoPath, outputPath, preRollMs, durationMs);
        return { finalPath: outputPath, narrationPlacements: [], warnings: [], videoTime };
      }
    }
    const { copyFile } = await import("fs/promises");
    await copyFile(tempVideoPath, outputPath);
    return { finalPath: outputPath, narrationPlacements: [], warnings: [], videoTime };
  }

  const configDir = dirname(configPath);
  const resolvedAudio = resolveAudioPaths(audio, configDir) ?? {};
  const warnings: string[] = [];
  let narrationPlacements: NarrationPlacement[] = [];
  let trim: VideoTrim | undefined;

  if (resolvedAudio.narrationManifest) {
    try {
      const rawManifest = await readFile(resolvedAudio.narrationManifest, "utf-8");
      const manifest = narrationManifestSchema.parse(JSON.parse(rawManifest));
      const timestampsByScene = new Map(sceneTimestamps.map((scene) => [scene.sceneIndex, scene]));

      // Scene timestamps come off the STEP clock — elapsed time the runner
      // measured while driving the page, starting at zero with the first scene.
      // The recording starts earlier than that: `recordVideo` attaches when the
      // context is created, and `handleAuth` then navigates and waits for the
      // app inside it. The two clocks therefore share a UNIT but not an ORIGIN.
      //
      // When the pipeline reports where the scenes sit (`timeline`), place cues
      // at `preRoll + sceneStart` and use what is left over as a genuine scale
      // check. Without it, fall back to the whole-recording ratio — which is
      // the best guess available, but treats a constant head offset as a
      // stretch and so drags early cues ahead of the picture.
      const stepClockMs = sceneTimestamps.reduce((max, scene) => Math.max(max, scene.endMs), 0);
      const { timeline } = options;
      try {
        const recordedMs = await measureMediaDurationMs(tempVideoPath);
        if (stepClockMs > 0 && recordedMs > 0) {
          if (timeline) {
            const sceneSpanMs = recordedMs - timeline.preRollMs - timeline.tailMs;
            // A pre-roll and tail that swallow the whole recording means the
            // measurement is wrong; scaling by it would place every cue at a
            // negative offset. Fall back to real time and say nothing more than
            // the scale warning below already says.
            const scale = sceneSpanMs > 0 ? sceneSpanMs / stepClockMs : 1;
            // When the pre-roll is being cut away the first scene lands at zero,
            // so cues must not also be pushed forward by it — that would count
            // the same offset twice.
            if (trimming && sceneSpanMs > 0) {
              trim = { startMs: timeline.preRollMs, durationMs: sceneSpanMs };
              videoTime = { originMs: 0, scale };
            } else {
              videoTime = { originMs: Math.max(0, timeline.preRollMs), scale };
            }
            if (scale < 0.98 || scale > 1.02) {
              warnings.push(
                `Recorded scene span (${Math.round(sceneSpanMs)}ms) does not match the step clock ` +
                  `(${stepClockMs}ms); narration scaled by ${scale.toFixed(4)}. The recording may ` +
                  `have dropped frames or stalled.`,
              );
            }
          } else {
            const timeScale = recordedMs / stepClockMs;
            videoTime = { originMs: 0, scale: timeScale };
            const driftMs = Math.round(recordedMs - stepClockMs);
            if (Math.abs(driftMs) > 250) {
              warnings.push(
                `Recording ran ${driftMs}ms ${driftMs > 0 ? "longer" : "shorter"} than the step clock ` +
                  `(${stepClockMs}ms); narration rescaled by ${timeScale.toFixed(4)} to stay in sync.`,
              );
            }
          }
        } else if (timeline) {
          videoTime = { originMs: Math.max(0, timeline.preRollMs), scale: 1 };
        }
      } catch (error) {
        if (timeline) videoTime = { originMs: Math.max(0, timeline.preRollMs), scale: 1 };
        warnings.push(
          `Could not measure recorded video duration, narration placed on the step clock and may drift: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      narrationPlacements = manifest.clips
        .map((clip) => {
          const scene = timestampsByScene.get(clip.sceneIndex);
          if (!scene) {
            warnings.push(
              `No recorded scene timestamp for narration clip ${clip.sceneIndex} (${clip.narration.slice(0, 60)})`,
            );
            return null;
          }

          const startMs =
            sceneToVideoMs(videoTime, scene.startMs) + (resolvedAudio.narrationDelay ?? 0);
          return {
            sceneIndex: clip.sceneIndex,
            narration: clip.narration,
            clipPath: resolve(dirname(resolvedAudio.narrationManifest!), clip.filePath),
            startMs,
            endMs: startMs + clip.audioDurationMs,
          } satisfies NarrationPlacement;
        })
        .filter((placement): placement is NarrationPlacement => placement !== null)
        .sort((left, right) => left.startMs - right.startMs || left.sceneIndex - right.sceneIndex);
    } catch (error) {
      warnings.push(
        `Failed to load narration manifest: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    for (let i = 1; i < narrationPlacements.length; i++) {
      const current = narrationPlacements[i];
      const previous = narrationPlacements[i - 1];
      if (current.startMs < previous.endMs) {
        const overlapMs = previous.endMs - current.startMs;

        if (narrationSyncMode === "off") continue;

        if (narrationSyncMode === "strict") {
          throw new Error(
            `Narration overlap: scene ${current.sceneIndex} starts before scene ${previous.sceneIndex} narration ends (overlap: ${overlapMs}ms)`,
          );
        }

        current.startMs = previous.endMs;
        current.endMs += overlapMs;
        warnings.push(
          `Narration auto-shift: scene ${current.sceneIndex} pushed forward ${overlapMs}ms to avoid overlap with scene ${previous.sceneIndex}`,
        );
      }
    }
  }

  // Mix audio with video
  const finalPath = await mergeAudioVideo({
    ...(trim ? { trim } : {}),
    videoPath: tempVideoPath,
    outputPath,
    audio: {
      ...resolvedAudio,
      narrationPlacements: narrationPlacements.length > 0 ? narrationPlacements : undefined,
    },
  });

  return { finalPath, narrationPlacements, warnings, videoTime };
}

// --- Subtitle and metadata generation ---

export interface SubtitleCue {
  narration: string;
  startMs: number;
  endMs: number;
  isIntro: boolean;
}

/**
 * Build subtitle cues. When audio is present, use the narrationDelay + audio durations
 * so subtitles sync with the voiceover. Otherwise fall back to recording timestamps.
 */
export function buildSubtitleCues(
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
 * Build subtitle cues from exact narration placement when available.
 */
export function buildSubtitleCuesWithNarrationPlacements(
  sceneTimestamps: SceneTimestamp[],
  config: DemoReelConfig,
  narrationPlacements: NarrationPlacement[],
  videoTime?: VideoTimeMapping,
): SubtitleCue[] {
  if (narrationPlacements.length === 0) {
    return buildSubtitleCues(sceneTimestamps, config);
  }

  const placementByScene = new Map(
    narrationPlacements.map((placement) => [placement.sceneIndex, placement]),
  );
  return sceneTimestamps.map((scene) => {
    const placement = placementByScene.get(scene.sceneIndex);
    if (!placement) {
      // No clip for this scene, so fall back to when it was on screen — which
      // has to be converted, since placements are already on the video's clock
      // and a subtitle file cannot mix the two.
      const toVideo = (ms: number) => (videoTime ? sceneToVideoMs(videoTime, ms) : ms);
      return {
        narration: scene.narration,
        startMs: toVideo(scene.startMs),
        endMs: toVideo(scene.endMs),
        isIntro: scene.isIntro,
      };
    }

    return {
      narration: scene.narration,
      startMs: placement.startMs,
      endMs: placement.endMs,
      isIntro: scene.isIntro,
    };
  });
}

export function formatTimecode(ms: number, separator: string): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${separator}${String(millis).padStart(3, "0")}`;
}

export function generateSRT(cues: SubtitleCue[]): string {
  return cues
    .map((cue, i) => {
      const start = formatTimecode(cue.startMs, ",");
      const end = formatTimecode(cue.endMs, ",");
      return `${i + 1}\n${start} --> ${end}\n${cue.narration}\n`;
    })
    .join("\n");
}

export function generateVTT(cues: SubtitleCue[]): string {
  const lines = cues
    .map((cue) => {
      const start = formatTimecode(cue.startMs, ".");
      const end = formatTimecode(cue.endMs, ".");
      return `${start} --> ${end}\n${cue.narration}\n`;
    })
    .join("\n");
  return `WEBVTT\n\n${lines}`;
}

export function generateMetadata(
  sceneTimestamps: SceneTimestamp[],
  subtitleCues: SubtitleCue[],
  videoPath: string,
  videoTime?: VideoTimeMapping,
) {
  // Visual times are read as positions in the finished file. On the step clock
  // they are short by however long the recording ran before the first scene, so
  // anything seeking by them lands on the wrong frame.
  const toVideo = (ms: number) => (videoTime ? sceneToVideoMs(videoTime, ms) : ms);

  const scenes = sceneTimestamps.map((t, i) => ({
    index: t.sceneIndex,
    narration: t.narration,
    isIntro: t.isIntro,
    // Visual timing (when things happen on screen)
    visualStartMs: toVideo(t.startMs),
    visualEndMs: toVideo(t.endMs),
    // Audio timing (when narration is heard) — from subtitles, already placed
    // on the video's clock by processVideoWithAudio.
    audioStartMs: subtitleCues[i]?.startMs ?? toVideo(t.startMs),
    audioEndMs: subtitleCues[i]?.endMs ?? toVideo(t.endMs),
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

function stripDelaysForDryRun(steps: DemoReelConfig["steps"]): DemoReelConfig["steps"] {
  return steps
    .filter((step) => (step as any).action !== "wait")
    .map((step) => {
      const stripped = { ...step } as Record<string, unknown>;
      for (const key of ["delayAfterMs", "delayBeforeMs", "delayMs"]) {
        if (key in stripped) {
          stripped[key] = 0;
        }
      }
      return stripped;
    }) as DemoReelConfig["steps"];
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
    const dryConfig = {
      ...config,
      motion: motionPresets.instant,
      typing: typingPresets.instant,
      timing: { ...timingPresets.instant, narrationSyncMode: "off" as const },
      steps: stripDelaysForDryRun(config.steps),
      preSteps: config.preSteps ? stripDelaysForDryRun(config.preSteps) : undefined,
      postSteps: config.postSteps ? stripDelaysForDryRun(config.postSteps) : undefined,
    };

    const startTime = Date.now();

    const browser = await startBrowser(dryConfig, headed);

    try {
      if (config.auth) {
        if (verbose) {
          console.log("→ Authenticating...");
        }
        await handleAuth(browser.context, browser.page, config.auth, configPath, verbose);
      }

      if (config.preSteps && config.preSteps.length > 0) {
        if (verbose) {
          console.log("Running pre-steps...");
        }
        await runSteps(browser.page, config.preSteps, {
          tolerant: true,
          verbose,
          label: "setup",
        });
      }

      if (verbose) {
        console.log("Running scenes...\n");
      }

      const sceneTimestamps = await runDemo(browser.page, dryConfig);

      if (sceneTimestamps.length > 0) {
        console.log("Scene results:");
        for (const ts of sceneTimestamps) {
          const duration = ((ts.endMs - ts.startMs) / 1000).toFixed(1);
          const label = ts.narration
            ? ts.narration.length > 60
              ? `${ts.narration.slice(0, 60)}...`
              : ts.narration
            : "(no narration)";
          console.log(`  scene ${ts.sceneIndex}: ${duration}s — ${label}`);
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n✓ All steps passed (${duration}s)`);

      if (config.postSteps && config.postSteps.length > 0) {
        if (verbose) {
          console.log("Running post-steps...");
        }
        await runSteps(browser.page, config.postSteps, {
          tolerant: true,
          verbose,
          label: "post",
        });
        if (verbose) {
          console.log("✓ Post-steps complete");
        }
      }
    } catch (error) {
      console.error(`\n✗ Failed: ${error instanceof Error ? error.message : String(error)}`);

      if (config.postSteps && config.postSteps.length > 0) {
        try {
          if (verbose) {
            console.log("Running post-steps (error cleanup)...");
          }
          await runSteps(browser.page, config.postSteps, {
            tolerant: true,
            verbose,
            label: "post",
          });
        } catch {
          // Ignore post-step errors during error cleanup
        }
      }

      await browser.context.close().catch(() => {});
      await browser.browser.close().catch(() => {});

      throw error;
    }

    await browser.context.close().catch(() => {});
    await browser.browser.close().catch(() => {});

    return outputPath;
  }

  const startTime = Date.now();

  // Run auth + preSteps in a separate browser BEFORE recording starts
  const hasPreWork = config.auth || (config.preSteps && config.preSteps.length > 0);
  if (hasPreWork) {
    if (verbose) {
      console.log("Starting browser for setup (no recording)...");
    }

    const setupBrowser = await startBrowser(config, headed);

    try {
      if (config.auth) {
        await handleAuth(setupBrowser.context, setupBrowser.page, config.auth, configPath, verbose);
      }

      if (config.preSteps && config.preSteps.length > 0) {
        if (verbose) {
          console.log("Running pre-steps...");
        }
        await runSteps(setupBrowser.page, config.preSteps, {
          tolerant: true,
          verbose,
          label: "setup",
        });
      }
    } finally {
      await setupBrowser.context.close();
      await setupBrowser.browser.close();
    }
  }

  if (verbose) {
    console.log("Starting browser and recording...");
  }

  const recording = await startRecording(config, headed);

  try {
    if (config.auth) {
      if (verbose) {
        console.log("Restoring session for recording...");
      }
      await handleAuth(recording.context, recording.page, config.auth, configPath, verbose);
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
          const configDir = resolveSessionBaseDir(configPath);
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

    const processedVideo = await processVideoWithAudio(
      tempVideoPath,
      outputPath,
      config.audio,
      configPath,
      sceneTimestamps,
      config.timing?.narrationSyncMode ?? "auto",
    );
    const { finalPath, narrationPlacements, warnings } = processedVideo;

    // Clean up temp video file and directory
    try {
      await unlink(tempVideoPath);
      await rmdir(join(process.cwd(), ".demo-reel-temp")).catch(() => {});
    } catch {
      // Ignore cleanup errors
    }

    for (const warning of warnings) {
      console.warn(`Warning: ${warning}`);
    }

    // Generate subtitles and metadata if scene timestamps are available
    if (sceneTimestamps.length > 0) {
      const basePath = finalPath.replace(/\.[^.]+$/, "");

      const subtitleCues = buildSubtitleCuesWithNarrationPlacements(
        sceneTimestamps,
        config,
        narrationPlacements,
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

    // Run post-steps (cleanup) in a fresh browser
    if (config.postSteps && config.postSteps.length > 0) {
      if (verbose) {
        console.log("Running post-steps...");
      }
      const postBrowser = await startBrowser(config, headed);
      try {
        if (config.auth) {
          await handleAuth(postBrowser.context, postBrowser.page, config.auth, configPath, verbose);
        }
        await runSteps(postBrowser.page, config.postSteps, {
          tolerant: true,
          verbose,
          label: "post",
        });
        if (verbose) {
          console.log("✓ Post-steps complete");
        }
      } finally {
        await postBrowser.context.close().catch(() => {});
        await postBrowser.browser.close().catch(() => {});
      }
    }

    return finalPath;
  } catch (error) {
    // Clean up on error — still try to run postSteps for cleanup
    await recording.context.close().catch(() => {});
    await recording.browser.close().catch(() => {});

    if (config.postSteps && config.postSteps.length > 0) {
      try {
        if (verbose) {
          console.log("Running post-steps (error cleanup)...");
        }
        const postBrowser = await startBrowser(config, headed);
        try {
          if (config.auth) {
            await handleAuth(
              postBrowser.context,
              postBrowser.page,
              config.auth,
              configPath,
              verbose,
            );
          }
          await runSteps(postBrowser.page, config.postSteps, {
            tolerant: true,
            verbose,
            label: "post",
          });
        } finally {
          await postBrowser.context.close().catch(() => {});
          await postBrowser.browser.close().catch(() => {});
        }
      } catch {
        // Ignore post-step errors during error cleanup
      }
    }

    throw error;
  }
}
