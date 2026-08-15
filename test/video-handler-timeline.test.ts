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

vi.mock("../src/ffmpeg/utils.js", () => ({
  measureMediaDurationMs: measureMediaDurationMsMock,
}));

vi.mock("playwright", () => ({ chromium: { launch: vi.fn() } }));

import { processVideoWithAudio } from "../src/video-handler.js";
import type { SceneTimestamp } from "../src/runner/types.js";

/**
 * The recording starts when the browser context is created, which is before the
 * first scene runs: `handleAuth` navigates and the app boots inside the
 * recording. The scene clock starts at zero regardless, so the two clocks share
 * a UNIT but not an ORIGIN.
 *
 * The original code corrected for that with `recordedMs / stepClockMs`, which
 * models a constant head offset as a uniform stretch. Measured against real
 * recordings the video timeline tracks wall clock to well under a percent, so
 * the true scale is ~1.0 while a recording with a 3.9s pre-roll and a 0.8s tail
 * on a 88s demo yields 1.053 — placing the first cue seconds before the thing
 * it describes and converging to correct only at the very end.
 *
 * When the pipeline knows the pre-roll and tail it can place cues at
 * `preRoll + sceneStart` instead, and use what is left over as a genuine scale
 * check rather than a fudge factor.
 */
describe("processVideoWithAudio with a known recording timeline", () => {
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
    timeline?: { preRollMs: number; tailMs: number };
    narrationDelay?: number;
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
      "auto",
      opts.timeline === undefined ? undefined : { timeline: opts.timeline },
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mkdirMock.mockResolvedValue(undefined);
    mergeAudioVideoMock.mockResolvedValue("/out/demo.mp4");
  });

  it("offsets placements by the pre-roll instead of stretching them", async () => {
    // 10s recording = 3s pre-roll + 6s of scenes + 1s tail, so the scenes are
    // real-time and only displaced. The old model would have scaled by
    // 10000/6000 and put this cue at 3333.
    measureMediaDurationMsMock.mockResolvedValue(10000);

    const result = await run({
      manifestJson: manifest([{ sceneIndex: 0, audioDurationMs: 500 }]),
      sceneTimestamps: scenes([[0, 2000, 6000]]),
      timeline: { preRollMs: 3000, tailMs: 1000 },
    });

    expect(result.narrationPlacements[0].startMs).toBe(5000);
  });

  it("keeps the gap between two scenes at its recorded length", async () => {
    measureMediaDurationMsMock.mockResolvedValue(10000);

    const result = await run({
      manifestJson: manifest([
        { sceneIndex: 0, audioDurationMs: 500 },
        { sceneIndex: 1, audioDurationMs: 500 },
      ]),
      sceneTimestamps: scenes([
        [0, 0, 2000],
        [1, 2000, 6000],
      ]),
      timeline: { preRollMs: 3000, tailMs: 1000 },
    });

    const [first, second] = result.narrationPlacements;
    expect(first.startMs).toBe(3000);
    expect(second.startMs).toBe(5000);
    expect(second.startMs - first.startMs).toBe(2000);
  });

  it("adds the narration delay after the offset", async () => {
    measureMediaDurationMsMock.mockResolvedValue(10000);

    const result = await run({
      manifestJson: manifest([{ sceneIndex: 0, audioDurationMs: 500 }]),
      sceneTimestamps: scenes([[0, 1000, 6000]]),
      timeline: { preRollMs: 3000, tailMs: 1000 },
      narrationDelay: 300,
    });

    expect(result.narrationPlacements[0].startMs).toBe(4300);
  });

  it("does not warn about drift that the pre-roll and tail fully explain", async () => {
    measureMediaDurationMsMock.mockResolvedValue(10000);

    const result = await run({
      manifestJson: manifest([{ sceneIndex: 0, audioDurationMs: 500 }]),
      sceneTimestamps: scenes([[0, 0, 6000]]),
      timeline: { preRollMs: 3000, tailMs: 1000 },
    });

    expect(result.warnings.join("\n")).not.toMatch(/rescal|drift|scale/i);
  });

  /**
   * The leftover after removing pre-roll and tail is the scene span as the
   * VIDEO recorded it, against the scene span as the STEP CLOCK measured it.
   * Those should agree; when they do not, something is wrong with the recording
   * (dropped frames, a stalled encoder) and the placement is no longer
   * trustworthy. Today that condition is silent.
   */
  it("warns when the scene span does not match the step clock", async () => {
    // 14s - 3s - 1s = 10s of scenes recorded, against a 6s step clock.
    measureMediaDurationMsMock.mockResolvedValue(14000);

    const result = await run({
      manifestJson: manifest([{ sceneIndex: 0, audioDurationMs: 500 }]),
      sceneTimestamps: scenes([[0, 0, 6000]]),
      timeline: { preRollMs: 3000, tailMs: 1000 },
    });

    expect(result.warnings.join("\n")).toMatch(/scale/i);
  });

  it("still scales when the scene span genuinely differs", async () => {
    measureMediaDurationMsMock.mockResolvedValue(14000);

    const result = await run({
      manifestJson: manifest([{ sceneIndex: 0, audioDurationMs: 500 }]),
      sceneTimestamps: scenes([[0, 3000, 6000]]),
      timeline: { preRollMs: 3000, tailMs: 1000 },
    });

    // scale = (14000 - 3000 - 1000) / 6000 = 1.6667; 3000 * 1.6667 + 3000
    expect(result.narrationPlacements[0].startMs).toBe(8000);
  });

  it("tolerates a timeline whose pre-roll and tail exceed the recording", async () => {
    // A nonsensical measurement must not produce negative or NaN placements.
    measureMediaDurationMsMock.mockResolvedValue(2000);

    const result = await run({
      manifestJson: manifest([{ sceneIndex: 0, audioDurationMs: 500 }]),
      sceneTimestamps: scenes([[0, 1000, 6000]]),
      timeline: { preRollMs: 3000, tailMs: 1000 },
    });

    const [placement] = result.narrationPlacements;
    expect(Number.isFinite(placement.startMs)).toBe(true);
    expect(placement.startMs).toBeGreaterThanOrEqual(0);
  });

  it("falls back to the whole-recording ratio when no timeline is supplied", async () => {
    measureMediaDurationMsMock.mockResolvedValue(12000);

    const result = await run({
      manifestJson: manifest([{ sceneIndex: 0, audioDurationMs: 500 }]),
      sceneTimestamps: scenes([[0, 1000, 10000]]),
    });

    expect(result.narrationPlacements[0].startMs).toBe(1200);
  });

  it("reports the resolved origin and scale so subtitles can use them", async () => {
    measureMediaDurationMsMock.mockResolvedValue(10000);

    const result = await run({
      manifestJson: manifest([{ sceneIndex: 0, audioDurationMs: 500 }]),
      sceneTimestamps: scenes([[0, 0, 6000]]),
      timeline: { preRollMs: 3000, tailMs: 1000 },
    });

    expect(result.videoTime).toEqual({ originMs: 3000, scale: 1 });
  });
});
