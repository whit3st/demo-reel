import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { spawn } from "child_process";
import { describe, expect, it } from "vitest";
import { mergeAudioVideo } from "../src/audio-processor.js";

async function getFfmpegPath(): Promise<string> {
  try {
    const mod: any = await import("ffmpeg-static");
    const ffmpegPath = mod.default ?? mod;
    if (typeof ffmpegPath === "string" && ffmpegPath.length > 0) {
      return ffmpegPath;
    }
  } catch {
    // Fall back to system ffmpeg.
  }

  return "ffmpeg";
}

async function runCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("error", (error) => {
      reject(error);
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve(stderr);
        return;
      }
      reject(new Error(`Command failed with code ${code}: ${stderr}`));
    });
  });
}

function readMeanVolumeDb(volumedetectOutput: string): number {
  const match = volumedetectOutput.match(/mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/);
  if (!match) {
    throw new Error(`Could not parse mean_volume from output: ${volumedetectOutput}`);
  }
  return Number(match[1]);
}

describe("mergeAudioVideo (integration)", () => {
  it("keeps delayed narration clip loudness consistent across scenes", async () => {
    const ffmpegPath = await getFfmpegPath();
    const dir = await mkdtemp(join(tmpdir(), "demo-reel-audio-integration-"));

    try {
      const videoPath = join(dir, "video.mp4");
      const clipOnePath = join(dir, "clip-1.wav");
      const clipTwoPath = join(dir, "clip-2.wav");
      const outputPath = join(dir, "final.webm");

      await runCommand(ffmpegPath, [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=640x360:r=30:d=3",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        videoPath,
      ]);

      await runCommand(ffmpegPath, [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=1:sample_rate=48000",
        "-af",
        "volume=0.2",
        clipOnePath,
      ]);

      await runCommand(ffmpegPath, [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=660:duration=1:sample_rate=48000",
        "-af",
        "volume=0.2",
        clipTwoPath,
      ]);

      const finalPath = await mergeAudioVideo({
        videoPath,
        outputPath,
        audio: {
          narrationPlacements: [
            {
              sceneIndex: 0,
              narration: "first",
              clipPath: clipOnePath,
              startMs: 0,
              endMs: 1000,
            },
            {
              sceneIndex: 1,
              narration: "second",
              clipPath: clipTwoPath,
              startMs: 2000,
              endMs: 3000,
            },
          ],
        } as any,
      });

      const firstWindow = await runCommand(ffmpegPath, [
        "-i",
        finalPath,
        "-vn",
        "-af",
        "atrim=start=0:end=1,volumedetect",
        "-f",
        "null",
        "-",
      ]);

      const secondWindow = await runCommand(ffmpegPath, [
        "-i",
        finalPath,
        "-vn",
        "-af",
        "atrim=start=2:end=3,volumedetect",
        "-f",
        "null",
        "-",
      ]);

      const firstMeanDb = readMeanVolumeDb(firstWindow);
      const secondMeanDb = readMeanVolumeDb(secondWindow);
      const differenceDb = Math.abs(firstMeanDb - secondMeanDb);

      expect(differenceDb).toBeLessThan(0.5);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
