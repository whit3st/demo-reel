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

/**
 * Locate a usable ffmpeg once, so the suite can skip cleanly on a machine that
 * has neither ffmpeg-static nor a system ffmpeg instead of failing with an
 * opaque ENOENT from deep inside a spawn.
 */
async function resolveUsableFfmpeg(): Promise<string | null> {
  const candidate = await getFfmpegPath();
  try {
    await runCommand(candidate, ["-version"]);
    return candidate;
  } catch {
    return null;
  }
}

const ffmpegPathOrNull = await resolveUsableFfmpeg();
const describeWithFfmpeg = ffmpegPathOrNull ? describe : describe.skip;

// Each case drives several sequential ffmpeg invocations (two encodes, the
// merge, then the analysis passes). The global 10s testTimeout is not enough
// for that on a cold CI runner.
const FFMPEG_TEST_TIMEOUT = 60000;

describeWithFfmpeg("mergeAudioVideo (integration)", () => {
  it(
    "keeps delayed narration clip loudness consistent across scenes",
    async () => {
      const ffmpegPath = ffmpegPathOrNull!;
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
    },
    FFMPEG_TEST_TIMEOUT,
  );

  /**
   * Narration is placed on the RESCALED timeline: processVideoWithAudio
   * measures the recording, divides by the step clock and moves every cue by
   * that ratio (see video-handler-timescale.test.ts for the arithmetic).
   *
   * That test proves the numbers; this one proves the numbers are honoured —
   * that a clip asked for at 2400ms is audible at 2400ms in the encoded file
   * and silent where it used to sit. A filtergraph that ignored startMs, or
   * applied the delay in seconds instead of milliseconds, would pass every
   * argument-string assertion and still produce an unusable video.
   */
  it(
    "places a rescaled narration clip at its requested offset",
    async () => {
      const ffmpegPath = ffmpegPathOrNull!;
      const dir = await mkdtemp(join(tmpdir(), "demo-reel-audio-rescale-"));

      try {
        const videoPath = join(dir, "video.mp4");
        const clipPath = join(dir, "clip.wav");
        const outputPath = join(dir, "final.webm");

        await runCommand(ffmpegPath, [
          "-y",
          "-f",
          "lavfi",
          "-i",
          "color=c=black:s=320x180:r=30:d=5",
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
          clipPath,
        ]);

        // A step-clock start of 2000ms scaled by a 1.2 recording ratio.
        const rescaledStartMs = 2400;

        const finalPath = await mergeAudioVideo({
          videoPath,
          outputPath,
          audio: {
            narrationPlacements: [
              {
                sceneIndex: 0,
                narration: "rescaled",
                clipPath,
                startMs: rescaledStartMs,
                endMs: rescaledStartMs + 1000,
              },
            ],
          } as any,
        });

        const measure = async (startS: number, endS: number) =>
          readMeanVolumeDb(
            await runCommand(ffmpegPath, [
              "-i",
              finalPath,
              "-vn",
              "-af",
              `atrim=start=${startS}:end=${endS},volumedetect`,
              "-f",
              "null",
              "-",
            ]),
          );

        const duringClip = await measure(2.5, 3.2);
        const nearStart = await measure(0.5, 1.5);
        const justBeforeClip = await measure(1.9, 2.3);

        // Audible where it was asked for, silent everywhere before. The
        // just-before window is the sharp test: a delay applied in seconds
        // instead of milliseconds, or dropped entirely, puts the clip at 0ms and
        // lights up both of the other windows.
        //
        // Note there is no "after" window — the mixed audio stream ends with the
        // last clip rather than being padded to the video length, so there are no
        // samples past 3.4s to measure.
        expect(duringClip - nearStart).toBeGreaterThan(20);
        expect(duringClip - justBeforeClip).toBeGreaterThan(20);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    FFMPEG_TEST_TIMEOUT,
  );
});
