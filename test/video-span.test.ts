import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mkdirMock,
  readFileMock,
  copyFileMock,
  measureMediaDurationMsMock,
  mergeAudioVideoMock,
  trimVideoMock,
} = vi.hoisted(() => ({
  mkdirMock: vi.fn(),
  readFileMock: vi.fn(),
  copyFileMock: vi.fn(),
  measureMediaDurationMsMock: vi.fn(),
  mergeAudioVideoMock: vi.fn(),
  trimVideoMock: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  mkdir: mkdirMock,
  readFile: readFileMock,
  writeFile: vi.fn(),
  unlink: vi.fn(),
  rmdir: vi.fn(),
  copyFile: copyFileMock,
  stat: vi.fn(),
}));

vi.mock("../src/audio-processor.js", () => ({
  mergeAudioVideo: mergeAudioVideoMock,
  resolveAudioPaths: (audio: unknown) => audio,
}));

// Partial: buildFfmpegArgs is under test here and must stay real.
vi.mock("../src/ffmpeg/utils.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/ffmpeg/utils.js")>()),
  measureMediaDurationMs: measureMediaDurationMsMock,
  trimVideo: trimVideoMock,
}));

vi.mock("playwright", () => ({ chromium: { launch: vi.fn() } }));

import { processVideoWithAudio } from "../src/video-handler.js";
import { buildFfmpegArgs } from "../src/ffmpeg/utils.js";
import { demoReelConfigSchema } from "../src/schemas.js";
import type { SceneTimestamp } from "../src/runner/types.js";

/**
 * The recording spans the browser session, not the demo. Everything before the
 * first scene — the auth navigation, the app's cold boot — and everything after
 * the last is filmed, and no config could reach it because it happens outside
 * the scenes entirely.
 *
 * `span` is a statement about what the video IS, resolved from measurements the
 * pipeline takes at runtime. It deliberately is not a duration: the pre-roll is
 * an app cold start, and across 15 consecutive runs of one real app it ranged
 * from 3.7s to 9.5s. No number written in a config file could be right twice.
 */
describe("video.span", () => {
  describe("schema", () => {
    const parse = (video: Record<string, unknown>) =>
      demoReelConfigSchema.parse({
        video,
        cursor: {
          start: { x: 100, y: 100 },
          persistPosition: false,
          type: "dot",
          size: 10,
          borderWidth: 2,
          borderColor: "#000",
          shadowColor: "#fff",
        },
        motion: {
          moveDurationMs: 500,
          moveStepsMin: 20,
          stepsPerPx: 10,
          clickDelayMs: 100,
          curve: { offsetRatio: 0.1, offsetMin: 5, offsetMax: 50, easing: "easeInOutCubic" },
        },
        typing: {
          baseDelayMs: 50,
          spaceDelayMs: 100,
          punctuationDelayMs: 150,
          enterDelayMs: 200,
        },
        timing: { afterGotoDelayMs: 1000, endDelayMs: 2000 },
        steps: [{ action: "goto", url: "https://example.com" }],
      });

    it("defaults to trimming down to the scenes", () => {
      expect(parse({ resolution: "FHD" }).video.span).toBe("scenes");
    });

    it("accepts the whole session when the pre-roll is wanted on camera", () => {
      expect(parse({ resolution: "FHD", span: "session" }).video.span).toBe("session");
    });

    it("rejects anything else", () => {
      expect(() => parse({ resolution: "FHD", span: "everything" })).toThrow();
    });
  });

  describe("ffmpeg arguments", () => {
    // Input seek, so the decode starts at the cut rather than decoding and
    // discarding four seconds of frames.
    it("seeks before the input and bounds the output duration", () => {
      const args = buildFfmpegArgs(
        "/tmp/raw.webm",
        "/out/demo.mp4",
        { narration: "/n.mp3" } as any,
        {
          startMs: 3900,
          durationMs: 88000,
        },
      );

      const ssIndex = args.indexOf("-ss");
      const inputIndex = args.indexOf("-i");
      expect(ssIndex).toBeGreaterThanOrEqual(0);
      expect(ssIndex).toBeLessThan(inputIndex);
      expect(args[ssIndex + 1]).toBe("3.9");
      expect(args[args.indexOf("-t") + 1]).toBe("88");
    });

    it("leaves the arguments alone when nothing is trimmed", () => {
      const args = buildFfmpegArgs("/tmp/raw.webm", "/out/demo.mp4", {
        narration: "/n.mp3",
      } as any);

      expect(args).not.toContain("-ss");
      expect(args).not.toContain("-t");
    });
  });

  describe("placement after trimming", () => {
    const scenes = (spec: Array<[number, number, number]>): SceneTimestamp[] =>
      spec.map(([sceneIndex, startMs, endMs]) => ({
        sceneIndex,
        startMs,
        endMs,
      })) as SceneTimestamp[];

    const manifest = () =>
      JSON.stringify({
        version: 1,
        processingVersion: "v5-no-volume-normalization",
        audioPath: "out/narration.mp3",
        clips: [
          {
            sceneIndex: 0,
            stepIndex: 0,
            narration: "line 0",
            filePath: "clips/clip-0.mp3",
            audioDurationMs: 500,
            audioOffsetMs: 0,
            gapAfterMs: 0,
          },
        ],
      });

    const run = (span: "scenes" | "session", timeline?: { preRollMs: number; tailMs: number }) => {
      readFileMock.mockResolvedValue(manifest());
      return processVideoWithAudio(
        "/tmp/temp.webm",
        "/out/demo.mp4",
        { narrationManifest: "/out/m.json" } as any,
        "/workspace/project",
        scenes([[0, 2000, 6000]]),
        "auto",
        { timeline, span },
      );
    };

    beforeEach(() => {
      vi.clearAllMocks();
      mkdirMock.mockResolvedValue(undefined);
      mergeAudioVideoMock.mockResolvedValue("/out/demo.mp4");
      measureMediaDurationMsMock.mockResolvedValue(10000);
    });

    it("asks for the pre-roll and tail to be cut", async () => {
      await run("scenes", { preRollMs: 3000, tailMs: 1000 });

      expect(mergeAudioVideoMock).toHaveBeenCalledWith(
        expect.objectContaining({ trim: { startMs: 3000, durationMs: 6000 } }),
      );
    });

    // The cut moves the first scene to zero, so cues must NOT also be pushed
    // forward by the pre-roll — that would double-count it.
    it("places cues from the start of the trimmed video", async () => {
      const result = await run("scenes", { preRollMs: 3000, tailMs: 1000 });

      expect(result.videoTime).toEqual({ originMs: 0, scale: 1 });
      expect(result.narrationPlacements[0].startMs).toBe(2000);
    });

    it("keeps the whole session and the offset when asked to", async () => {
      const result = await run("session", { preRollMs: 3000, tailMs: 1000 });

      expect(mergeAudioVideoMock).toHaveBeenCalledWith(
        expect.not.objectContaining({ trim: expect.anything() }),
      );
      expect(result.videoTime).toEqual({ originMs: 3000, scale: 1 });
      expect(result.narrationPlacements[0].startMs).toBe(5000);
    });

    it("cannot trim what it did not measure", async () => {
      const result = await run("scenes", undefined);

      expect(mergeAudioVideoMock).toHaveBeenCalledWith(
        expect.not.objectContaining({ trim: expect.anything() }),
      );
      expect(result.videoTime.originMs).toBe(0);
    });
  });

  describe("a video with no narration", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mkdirMock.mockResolvedValue(undefined);
      measureMediaDurationMsMock.mockResolvedValue(10000);
      trimVideoMock.mockResolvedValue(undefined);
    });

    const runSilent = (span: "scenes" | "session") =>
      processVideoWithAudio(
        "/tmp/temp.webm",
        "/out/demo.webm",
        undefined,
        "/workspace/project",
        [{ sceneIndex: 0, startMs: 0, endMs: 6000 }] as SceneTimestamp[],
        "auto",
        { timeline: { preRollMs: 3000, tailMs: 1000 }, span },
      );

    /**
     * mergeAudioVideo returns early with no audio and the caller just copies the
     * file, so without this the flag would silently do nothing for silent runs.
     */
    it("still trims, rather than copying the untrimmed recording", async () => {
      await runSilent("scenes");

      expect(trimVideoMock).toHaveBeenCalledWith("/tmp/temp.webm", "/out/demo.webm", 3000, 6000);
      expect(copyFileMock).not.toHaveBeenCalled();
    });

    it("copies as before when the whole session is wanted", async () => {
      await runSilent("session");

      expect(trimVideoMock).not.toHaveBeenCalled();
      expect(copyFileMock).toHaveBeenCalledWith("/tmp/temp.webm", "/out/demo.webm");
    });
  });
});
