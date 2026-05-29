import { spawn } from "child_process";
import { mkdir, writeFile, readFile, stat, unlink } from "fs/promises";
import { join, resolve as pathResolve } from "path";

export interface AudioConfig {
  narration?: string;
  narrationManifest?: string;
  narrationDelay?: number;
  background?: string;
  backgroundVolume?: number;
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

export async function getFfmpegPath(): Promise<string> {
  try {
    const mod: any = await import("ffmpeg-static");
    const ffmpegPath = mod.default || mod;
    if (ffmpegPath && typeof ffmpegPath === "string") {
      const { accessSync } = await import("fs");
      accessSync(ffmpegPath);
      return ffmpegPath;
    }
  } catch {}
  return "ffmpeg";
}

export async function getFfprobePath(): Promise<string> {
  const ffmpegPath = await getFfmpegPath();
  const adjacent = ffmpegPath.replace(/ffmpeg([^/\\]*)$/, "ffprobe$1");
  try {
    await stat(adjacent);
    return adjacent;
  } catch {
    return "ffprobe";
  }
}

export function runFFmpeg(ffmpegPath: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args);
    let stderr = "";
    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-200)}`));
        return;
      }
      resolve();
    });
    proc.on("error", reject);
  });
}

export function runFfprobe(ffprobePath: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffprobePath, args);
    let output = "";
    proc.stdout.on("data", (data: Buffer) => {
      output += data.toString();
    });
    proc.stderr.on("data", () => {});
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited with code ${code}`));
        return;
      }
      resolve(output);
    });
    proc.on("error", reject);
  });
}

export async function measureAudioDuration(audioBuffer: Buffer): Promise<number> {
  const ffprobePath = await getFfprobePath();

  const tempDir = join(process.cwd(), ".demo-reel-cache", "temp");
  await mkdir(tempDir, { recursive: true });
  const tempPath = join(tempDir, `probe-${Date.now()}.mp3`);
  await writeFile(tempPath, audioBuffer);

  try {
    const output = await runFfprobe(ffprobePath, [
      "-v",
      "quiet",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      tempPath,
    ]);
    const seconds = parseFloat(output.trim());
    if (isNaN(seconds)) {
      throw new Error("Could not parse audio duration");
    }
    return Math.round(seconds * 1000);
  } finally {
    await unlink(tempPath).catch(() => {});
  }
}

export async function wavToMp3(wavBuffer: Buffer): Promise<Buffer> {
  const ffmpegPath = await getFfmpegPath();
  const tempDir = join(process.cwd(), ".demo-reel-cache", "temp");
  await mkdir(tempDir, { recursive: true });

  const wavPath = join(tempDir, `convert-${Date.now()}.wav`);
  const mp3Path = join(tempDir, `convert-${Date.now()}.mp3`);

  await writeFile(wavPath, wavBuffer);
  await runFFmpeg(ffmpegPath, [
    "-i",
    wavPath,
    "-codec:a",
    "libmp3lame",
    "-q:a",
    "2",
    "-y",
    mp3Path,
  ]);

  const mp3Buffer = await readFile(mp3Path);
  await unlink(wavPath).catch(() => {});
  await unlink(mp3Path).catch(() => {});
  return mp3Buffer;
}

export async function generateSilence(
  ffmpegPath: string,
  outputPath: string,
  durationMs: number,
): Promise<void> {
  await runFFmpeg(ffmpegPath, [
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=44100:cl=mono",
    "-t",
    (durationMs / 1000).toString(),
    "-q:a",
    "9",
    "-y",
    outputPath,
  ]);
}

export async function concatenateAudio(
  segments: { audio: Buffer; gapAfterMs: number }[],
): Promise<Buffer> {
  const ffmpegPath = await getFfmpegPath();
  const tempDir = join(process.cwd(), ".demo-reel-cache", "temp");
  await mkdir(tempDir, { recursive: true });

  const inputFiles: string[] = [];
  const filterParts: string[] = [];
  let inputIndex = 0;

  for (let i = 0; i < segments.length; i++) {
    const segPath = join(tempDir, `seg-${i}.mp3`);
    await writeFile(segPath, segments[i].audio);
    inputFiles.push(segPath);
    filterParts.push(`[${inputIndex}:a]`);
    inputIndex++;

    if (segments[i].gapAfterMs > 0) {
      const silencePath = join(tempDir, `silence-${i}.mp3`);
      await generateSilence(ffmpegPath, silencePath, segments[i].gapAfterMs);
      inputFiles.push(silencePath);
      filterParts.push(`[${inputIndex}:a]`);
      inputIndex++;
    }
  }

  const outputPath = join(tempDir, "concatenated.mp3");
  const args: string[] = [];
  for (const file of inputFiles) args.push("-i", file);
  const concatFilter = `${filterParts.join("")}concat=n=${filterParts.length}:v=0:a=1[out]`;
  args.push("-filter_complex", concatFilter, "-map", "[out]", "-y", outputPath);

  await runFFmpeg(ffmpegPath, args);
  const result = await readFile(outputPath);

  for (const file of inputFiles) await unlink(file).catch(() => {});
  await unlink(outputPath).catch(() => {});

  return result;
}

export async function mergeAudioVideo(options: MergeOptions): Promise<string> {
  const { videoPath, outputPath, audio } = options;
  const mixAudio = audio as MixAudioConfig | undefined;

  if (!audio || (!audio.narration && !audio.background && !mixAudio?.narrationPlacements?.length)) {
    return videoPath;
  }

  const ffmpegPath = await getFfmpegPath();

  if (!ffmpegPath) {
    throw new Error("FFmpeg binary not found. Please ensure ffmpeg-static is installed correctly.");
  }

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

export function buildFfmpegArgs(
  videoPath: string,
  outputPath: string,
  audio: AudioConfig,
): string[] {
  const mixAudio = audio as MixAudioConfig;
  const args: string[] = ["-y", "-i", videoPath];

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
        : `${narrationInputs}amix=inputs=${mixAudio.narrationPlacements.length}:duration=longest:dropout_transition=0:normalize=0[narr]`;

    if (audio.background) {
      const backgroundInputIndex = mixAudio.narrationPlacements.length + 1;
      const bgVolume = audio.backgroundVolume ?? 0.3;
      filterComplex = `${narrationFilters.join(";")};${narrationMix};[${backgroundInputIndex}:a]volume=${bgVolume}[bg];[narr][bg]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[out]`;
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

  if (audio.narration) {
    args.push("-i", audio.narration);
  }

  if (audio.background) {
    args.push("-i", audio.background);
  }

  if (audio.narration && audio.background) {
    const bgVolume = audio.backgroundVolume ?? 0.3;

    if (narrationDelay > 0) {
      const delayMs = narrationDelay;
      filterComplex = `[1:a]adelay=${delayMs}|${delayMs}[delayed];[delayed]volume=1[narr];[2:a]volume=${bgVolume}[bg];[narr][bg]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[out]`;
    } else {
      filterComplex = `[1:a]volume=1[narr];[2:a]volume=${bgVolume}[bg];[narr][bg]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[out]`;
    }

    args.push("-filter_complex", filterComplex, "-map", "0:v", "-map", "[out]");
  } else if (audio.background) {
    const bgVolume = audio.backgroundVolume ?? 0.3;
    args.push("-filter_complex", `[1:a]volume=${bgVolume}[aout]`, "-map", "0:v", "-map", "[aout]");
  } else if (audio.narration && narrationDelay > 0) {
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

export async function isFfmpegAvailable(): Promise<boolean> {
  const path = await getFfmpegPath();
  return !!path;
}

export function resolveAudioPaths(
  audio: AudioConfig | undefined,
  configDir: string,
): AudioConfig | undefined {
  if (!audio) return undefined;

  const resolved: AudioConfig = {
    backgroundVolume: audio.backgroundVolume ?? 0.3,
  };

  if (audio.narration) {
    resolved.narration = pathResolve(configDir, audio.narration);
  }
  if (audio.narrationManifest) {
    resolved.narrationManifest = pathResolve(configDir, audio.narrationManifest);
  }
  if (audio.narrationDelay !== undefined) {
    resolved.narrationDelay = audio.narrationDelay;
  }
  if (audio.background) {
    resolved.background = pathResolve(configDir, audio.background);
  }

  return resolved;
}
