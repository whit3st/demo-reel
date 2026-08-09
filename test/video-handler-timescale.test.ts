import { beforeEach, describe, expect, it, vi } from "vitest";

const { mkdirMock, readFileMock, measureMediaDurationMsMock, mergeAudioVideoMock } = vi.hoisted(
  () => ({
    mkdirMock: vi.fn(),
    readFileMock: vi.fn(),
    measureMediaDurationMsMock: vi.fn(),
    mergeAudioVideoMock: vi.fn(),
  }),
);

vi.mock("fs/promises", () => ({
  mkdir: mkdirMock,
  readFile: readFileMock,
  writeFile: vi.fn(),
  unlink: vi.fn(),
  rmdir: vi.fn(),
  copyFile: vi.fn(),
  stat: vi.fn(),
}));

vi.mock("../src/audio-processor.js", () => ({
  mergeAudioVideo: mergeAudioVideoMock,
  resolveAudioPaths: (audio: unknown) => audio,
}));

// video-handler imports the duration probe from ffmpeg/utils, not audio-processor.
vi.mock("../src/ffmpeg/utils.js", () => ({
  measureMediaDurationMs: measureMediaDurationMsMock,
}));

vi.mock("playwright", () => ({ chromium: { launch: vi.fn() } }));

import { processVideoWithAudio } from "../src/video-handler.js";
import type { SceneTimestamp } from "../src/runner/types.js";

/**
 * Scene timestamps come off the STEP clock (elapsed time the runner measured);
 * the recorded video runs on wall-clock and is typically a few percent longer
 * under recording load. processVideoWithAudio measures the recording and
 * rescales narration onto it with a single ratio.
 *
 * This is one line of arithmetic that decides whether narration drifts seconds
 * out of sync by the end of a long demo, and the existing suite only ever
 * exercised it at a ratio of exactly 1.0.
 */
describe("processVideoWithAudio narration rescale", () => {
  const scenes = (spec: Array<[number, number, number]>): SceneTimestamp[] =>
    spec.map(([sceneIndex, startMs, endMs]) => ({
      sceneIndex,
      startMs,
      endMs,
    })) as SceneTimestamp[];

  const manifest = (clips: Array<{ sceneIndex: number; audioDurationMs: number }>) =>
    JSON.stringify({
      version: 1,
      processingVersion: "v5-no-volume-normalization",
      audioPath: "out/narration.mp3",
      clips: clips.map((clip) => ({
        ...clip,
        stepIndex: clip.sceneIndex,
        narration: `line ${clip.sceneIndex}`,
        filePath: `clips/clip-${clip.sceneIndex}.mp3`,
        audioOffsetMs: 0,
        gapAfterMs: 0,
      })),
    });

  const run = (opts: {
    manifestJson: string;
    sceneTimestamps: SceneTimestamp[];
    narrationDelay?: number;
    syncMode?: string;
  }) => {
    readFileMock.mockResolvedValue(opts.manifestJson);
    return processVideoWithAudio(
      "/tmp/temp.webm",
      "/out/demo.mp4",
      {
        narrationManifest: "/out/demo-narration-manifest.json",
        ...(opts.narrationDelay === undefined ? {} : { narrationDelay: opts.narrationDelay }),
      } as any,
      "/workspace/project",
      opts.sceneTimestamps,
      opts.syncMode ?? "auto",
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mkdirMock.mockResolvedValue(undefined);
    mergeAudioVideoMock.mockResolvedValue("/out/demo.mp4");
    measureMediaDurationMsMock.mockResolvedValue(10000);
  });

  describe("time scaling", () => {
    it("leaves placements untouched when the recording matches the step clock", async () => {
      measureMediaDurationMsMock.mockResolvedValue(10000);

      const result = await run({
        manifestJson: manifest([{ sceneIndex: 0, audioDurationMs: 1000 }]),
        sceneTimestamps: scenes([[0, 4000, 10000]]),
      });

      expect(result.narrationPlacements[0].startMs).toBe(4000);
    });

    // A recording 20% longer than the step clock must push every cue 20% later,
    // proportionally — a fixed offset would only fix the first scene.
    it("scales every placement by the recorded/step-clock ratio", async () => {
      measureMediaDurationMsMock.mockResolvedValue(12000);

      const result = await run({
        manifestJson: manifest([
          { sceneIndex: 0, audioDurationMs: 1000 },
          { sceneIndex: 1, audioDurationMs: 1000 },
        ]),
        sceneTimestamps: scenes([
          [0, 1000, 5000],
          [1, 5000, 10000],
        ]),
      });

      expect(result.narrationPlacements.map((p) => p.startMs)).toEqual([1200, 6000]);
    });

    it("scales down when the recording is shorter than the step clock", async () => {
      measureMediaDurationMsMock.mockResolvedValue(5000);

      const result = await run({
        manifestJson: manifest([{ sceneIndex: 0, audioDurationMs: 500 }]),
        sceneTimestamps: scenes([[0, 4000, 10000]]),
      });

      expect(result.narrationPlacements[0].startMs).toBe(2000);
    });

    it("rounds the rescaled start to a whole millisecond", async () => {
      measureMediaDurationMsMock.mockResolvedValue(10333);

      const result = await run({
        manifestJson: manifest([{ sceneIndex: 0, audioDurationMs: 500 }]),
        sceneTimestamps: scenes([[0, 3000, 10000]]),
      });

      expect(Number.isInteger(result.narrationPlacements[0].startMs)).toBe(true);
      expect(result.narrationPlacements[0].startMs).toBe(3100);
    });

    it("derives endMs from the rescaled start plus the clip's real duration", async () => {
      measureMediaDurationMsMock.mockResolvedValue(12000);

      const result = await run({
        manifestJson: manifest([{ sceneIndex: 0, audioDurationMs: 1500 }]),
        sceneTimestamps: scenes([[0, 1000, 10000]]),
      });

      const [placement] = result.narrationPlacements;
      // The clip's own length is real audio and must NOT be scaled.
      expect(placement.endMs - placement.startMs).toBe(1500);
    });

    it("adds the narration delay after scaling, not before", async () => {
      measureMediaDurationMsMock.mockResolvedValue(20000);

      const result = await run({
        manifestJson: manifest([{ sceneIndex: 0, audioDurationMs: 500 }]),
        sceneTimestamps: scenes([[0, 1000, 10000]]),
        narrationDelay: 300,
      });

      // 1000 * 2 + 300, not (1000 + 300) * 2
      expect(result.narrationPlacements[0].startMs).toBe(2300);
    });
  });

  describe("drift warning", () => {
    it("warns when the drift exceeds the quarter-second threshold", async () => {
      measureMediaDurationMsMock.mockResolvedValue(10600);

      const result = await run({
        manifestJson: manifest([{ sceneIndex: 0, audioDurationMs: 500 }]),
        sceneTimestamps: scenes([[0, 0, 10000]]),
      });

      expect(result.warnings.join("\n")).toMatch(/600ms longer/);
    });

    it("reports a shorter recording in the other direction", async () => {
      measureMediaDurationMsMock.mockResolvedValue(9000);

      const result = await run({
        manifestJson: manifest([{ sceneIndex: 0, audioDurationMs: 500 }]),
        sceneTimestamps: scenes([[0, 0, 10000]]),
      });

      expect(result.warnings.join("\n")).toMatch(/-1000ms shorter/);
    });

    // Small drift is normal and rescaled silently; warning on it would train
    // users to ignore the message.
    it("stays quiet for drift within the threshold", async () => {
      measureMediaDurationMsMock.mockResolvedValue(10200);

      const result = await run({
        manifestJson: manifest([{ sceneIndex: 0, audioDurationMs: 500 }]),
        sceneTimestamps: scenes([[0, 0, 10000]]),
      });

      expect(result.warnings.join("\n")).not.toMatch(/rescaled/);
    });
  });

  describe("unmeasurable recording", () => {
    it("falls back to the step clock and says so", async () => {
      measureMediaDurationMsMock.mockRejectedValue(new Error("ffprobe not found"));

      const result = await run({
        manifestJson: manifest([{ sceneIndex: 0, audioDurationMs: 500 }]),
        sceneTimestamps: scenes([[0, 4000, 10000]]),
      });

      expect(result.narrationPlacements[0].startMs).toBe(4000);
      expect(result.warnings.join("\n")).toMatch(/Could not measure recorded video duration/);
      expect(result.warnings.join("\n")).toMatch(/ffprobe not found/);
    });

    it("does not scale by zero when the recording measures as empty", async () => {
      measureMediaDurationMsMock.mockResolvedValue(0);

      const result = await run({
        manifestJson: manifest([{ sceneIndex: 0, audioDurationMs: 500 }]),
        sceneTimestamps: scenes([[0, 4000, 10000]]),
      });

      expect(result.narrationPlacements[0].startMs).toBe(4000);
    });

    it("does not divide by zero when there is no step clock", async () => {
      const result = await run({
        manifestJson: manifest([{ sceneIndex: 0, audioDurationMs: 500 }]),
        sceneTimestamps: scenes([[0, 0, 0]]),
      });

      expect(result.narrationPlacements[0].startMs).toBe(0);
    });
  });

  describe("placement ordering", () => {
    it("sorts placements by start time regardless of manifest order", async () => {
      const result = await run({
        manifestJson: manifest([
          { sceneIndex: 2, audioDurationMs: 100 },
          { sceneIndex: 0, audioDurationMs: 100 },
          { sceneIndex: 1, audioDurationMs: 100 },
        ]),
        sceneTimestamps: scenes([
          [0, 0, 3000],
          [1, 3000, 6000],
          [2, 6000, 10000],
        ]),
      });

      expect(result.narrationPlacements.map((p) => p.sceneIndex)).toEqual([0, 1, 2]);
    });

    // Two scenes can share a start when a scene contains no time-consuming
    // steps; scene index breaks the tie so ordering stays deterministic.
    it("breaks a start-time tie by scene index", async () => {
      const result = await run({
        manifestJson: manifest([
          { sceneIndex: 1, audioDurationMs: 100 },
          { sceneIndex: 0, audioDurationMs: 100 },
        ]),
        sceneTimestamps: scenes([
          [0, 2000, 6000],
          [1, 2000, 10000],
        ]),
      });

      expect(result.narrationPlacements.map((p) => p.sceneIndex)).toEqual([0, 1]);
    });

    it("warns and skips a clip with no recorded scene", async () => {
      const result = await run({
        manifestJson: manifest([
          { sceneIndex: 0, audioDurationMs: 100 },
          { sceneIndex: 7, audioDurationMs: 100 },
        ]),
        sceneTimestamps: scenes([[0, 0, 10000]]),
      });

      expect(result.narrationPlacements).toHaveLength(1);
      expect(result.warnings.join("\n")).toMatch(
        /No recorded scene timestamp for narration clip 7/,
      );
    });
  });

  describe("overlap resolution after rescaling", () => {
    // Scaling can push a cue into the one before it, so overlap handling has to
    // run on the rescaled values rather than the raw ones.
    it("shifts an overlapping cue forward in auto mode", async () => {
      measureMediaDurationMsMock.mockResolvedValue(10000);

      const result = await run({
        manifestJson: manifest([
          { sceneIndex: 0, audioDurationMs: 4000 },
          { sceneIndex: 1, audioDurationMs: 1000 },
        ]),
        sceneTimestamps: scenes([
          [0, 0, 2000],
          [1, 2000, 10000],
        ]),
      });

      expect(result.narrationPlacements[1].startMs).toBe(4000);
      expect(result.warnings.join("\n")).toMatch(/auto-shift/);
    });

    it("throws in strict mode instead of shifting", async () => {
      await expect(
        run({
          manifestJson: manifest([
            { sceneIndex: 0, audioDurationMs: 4000 },
            { sceneIndex: 1, audioDurationMs: 1000 },
          ]),
          sceneTimestamps: scenes([
            [0, 0, 2000],
            [1, 2000, 10000],
          ]),
          syncMode: "strict",
        }),
      ).rejects.toThrow(/Narration overlap/);
    });

    it("leaves the overlap alone when sync is off", async () => {
      const result = await run({
        manifestJson: manifest([
          { sceneIndex: 0, audioDurationMs: 4000 },
          { sceneIndex: 1, audioDurationMs: 1000 },
        ]),
        sceneTimestamps: scenes([
          [0, 0, 2000],
          [1, 2000, 10000],
        ]),
        syncMode: "off",
      });

      expect(result.narrationPlacements[1].startMs).toBe(2000);
    });
  });
});
