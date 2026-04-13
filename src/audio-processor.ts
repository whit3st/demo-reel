import { spawn } from "child_process";
import { resolve } from "path";

export interface AudioConfig {
  narration?: string; // Path to MP3 file
  narrationManifest?: string; // Path to per-scene narration manifest JSON file
  narrationDelay?: number; // Delay in milliseconds before narration starts
  background?: string; // Path to MP3 file
  backgroundVolume?: number; // 0.0 to 1.0, default 0.3
}

export interface NarrationPlacement {
  sceneIndex: number;
  narration: string;
  clipPath: string;
  startMs: number;
  endMs: number;
}

interface MixAudioConfig extends AudioConfig {
  narrationPlacements?: NarrationPlacement[];
}

export interface MergeOptions {
  videoPath: string;
  outputPath: string;
  audio?: MixAudioConfig;
}

// Import ffmpeg-static dynamically, fall back to system ffmpeg
async function getFfmpegPath(): Promise<string | null> {
  try {
    const module: any = await import("ffmpeg-static");
    const path = module.default as string | null;
    if (path) {
      // Verify the binary exists (ffmpeg-static may not ship it in prod)
      const { accessSync } = await import("fs");
      accessSync(path);
      return path;
    }
  } catch {
    // ffmpeg-static not available or binary missing
  }
  // Fall back to system ffmpeg
  return "ffmpeg";
}

/**
 * Merge video with audio files using FFmpeg
 */
export async function mergeAudioVideo(options: MergeOptions): Promise<string> {
  const { videoPath, outputPath, audio } = options;
  const mixAudio = audio as MixAudioConfig | undefined;

  if (!audio || (!audio.narration && !audio.background && !mixAudio?.narrationPlacements?.length)) {
    // No audio to process, just copy video
    return videoPath;
  }

  const ffmpegPath = await getFfmpegPath();

  if (!ffmpegPath) {
    throw new Error("FFmpeg binary not found. Please ensure ffmpeg-static is installed correctly.");
  }

  // Change output to MP4 format when mixing audio (WebM doesn't support AAC)
  const mp4OutputPath = outputPath.replace(/\.webm$/i, ".mp4");

  const args = buildFfmpegArgs(videoPath, mp4OutputPath, audio);

  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("close", (code: number | null) => {
      if (code === 0) {
        resolve(mp4OutputPath);
      } else {
        reject(new Error(`FFmpeg failed with code ${code}: ${stderr}`));
      }
    });

    child.on("error", (err: Error) => {
      reject(new Error(`Failed to start FFmpeg: ${err.message}`));
    });
  });
}

function buildFfmpegArgs(videoPath: string, outputPath: string, audio: AudioConfig): string[] {
  const mixAudio = audio as MixAudioConfig;
  const args: string[] = [
    "-y", // Overwrite output file
    "-i",
    videoPath, // Video input
  ];

  let filterComplex = "";
  const narrationDelay = audio.narrationDelay ?? 0;

  if (mixAudio.narrationPlacements && mixAudio.narrationPlacements.length > 0) {
    for (const placement of mixAudio.narrationPlacements) {
      args.push("-i", placement.clipPath);
    }

    if (audio.background) {
      args.push("-i", audio.background);
    }

    const narrationFilters = mixAudio.narrationPlacements.map(
      (placement, index) =>
        `[${index + 1}:a]adelay=${placement.startMs}|${placement.startMs},volume=1[n${index}]`,
    );
    const narrationInputs = mixAudio.narrationPlacements.map((_, index) => `[n${index}]`).join("");
    const narrationMix =
      mixAudio.narrationPlacements.length === 1
        ? `${narrationInputs}anull[narr]`
        : `${narrationInputs}amix=inputs=${mixAudio.narrationPlacements.length}:duration=longest:dropout_transition=0[narr]`;

    if (audio.background) {
      const backgroundInputIndex = mixAudio.narrationPlacements.length + 1;
      const bgVolume = audio.backgroundVolume ?? 0.3;
      filterComplex = `${narrationFilters.join(";")};${narrationMix};[${backgroundInputIndex}:a]volume=${bgVolume}[bg];[narr][bg]amix=inputs=2:duration=longest:dropout_transition=0[out]`;
      args.push("-filter_complex", filterComplex, "-map", "0:v", "-map", "[out]");
    } else {
      filterComplex = `${narrationFilters.join(";")};${narrationMix}`;
      args.push("-filter_complex", filterComplex, "-map", "0:v", "-map", "[narr]");
    }

    args.push(
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      outputPath,
    );

    return args;
  }

  // Add narration if provided
  if (audio.narration) {
    args.push("-i", audio.narration);
  }

  // Add background music if provided
  if (audio.background) {
    args.push("-i", audio.background);
  }

  // Build filter complex for mixing
  if (audio.narration && audio.background) {
    // Both narration and background
    const bgVolume = audio.backgroundVolume ?? 0.3;

    if (narrationDelay > 0) {
      // Delay the narration
      const delayMs = narrationDelay;
      filterComplex = `[1:a]adelay=${delayMs}|${delayMs}[delayed];[delayed]volume=1[narr];[2:a]volume=${bgVolume}[bg];[narr][bg]amix=inputs=2:duration=first:dropout_transition=0[out]`;
    } else {
      filterComplex = `[1:a]volume=1[narr];[2:a]volume=${bgVolume}[bg];[narr][bg]amix=inputs=2:duration=first:dropout_transition=0[out]`;
    }

    args.push(
      "-filter_complex",
      filterComplex,
      "-map",
      "0:v", // Video from first input
      "-map",
      "[out]", // Mixed audio
    );
  } else if (audio.background) {
    // Only background music
    const bgVolume = audio.backgroundVolume ?? 0.3;
    args.push("-filter_complex", `[1:a]volume=${bgVolume}[aout]`, "-map", "0:v", "-map", "[aout]");
  } else if (audio.narration && narrationDelay > 0) {
    // Only narration with delay
    const delayMs = narrationDelay;
    args.push(
      "-filter_complex",
      `[1:a]adelay=${delayMs}|${delayMs}[aout]`,
      "-map",
      "0:v",
      "-map",
      "[aout]",
    );
  }
  // If only narration without delay, no filter needed - FFmpeg will auto-map

  // Output settings - re-encode to H.264 for MP4 compatibility
  args.push(
    "-c:v",
    "libx264", // Re-encode video to H.264 (compatible with MP4)
    "-preset",
    "fast", // Encoding speed/quality tradeoff
    "-crf",
    "23", // Quality (lower = better, 23 is default)
    "-c:a",
    "aac", // AAC audio codec
    "-b:a",
    "192k", // Audio bitrate
    "-movflags",
    "+faststart", // Enable web streaming
    outputPath,
  );

  return args;
}

/**
 * Check if FFmpeg is available
 */
export async function isFfmpegAvailable(): Promise<boolean> {
  const path = await getFfmpegPath();
  return !!path;
}

/**
 * Resolve audio paths relative to config file
 */
export function resolveAudioPaths(
  audio: AudioConfig | undefined,
  configDir: string,
): AudioConfig | undefined {
  if (!audio) return undefined;

  const resolved: AudioConfig = {
    backgroundVolume: audio.backgroundVolume ?? 0.3,
  };

  if (audio.narration) {
    resolved.narration = resolve(configDir, audio.narration);
  }
  if (audio.narrationManifest) {
    resolved.narrationManifest = resolve(configDir, audio.narrationManifest);
  }
  if (audio.narrationDelay !== undefined) {
    resolved.narrationDelay = audio.narrationDelay;
  }
  if (audio.background) {
    resolved.background = resolve(configDir, audio.background);
  }

  return resolved;
}
