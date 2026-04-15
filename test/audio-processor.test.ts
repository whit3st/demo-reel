import { beforeEach, describe, expect, it, vi } from "vitest";

const { spawnMock, ffmpegStaticMock, accessSyncMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  ffmpegStaticMock: vi.fn(),
  accessSyncMock: vi.fn(),
}));

vi.mock("child_process", () => ({
  spawn: spawnMock,
}));

vi.mock("ffmpeg-static", () => ({
  default: ffmpegStaticMock,
}));

vi.mock("fs", () => ({
  accessSync: accessSyncMock,
}));

import { buildFfmpegArgs, mergeAudioVideo, resolveAudioPaths } from "../src/audio-processor.js";
import type { AudioConfig } from "../src/audio-processor.js";

// ── buildFfmpegArgs ──────────────────────────────────────────────
describe("buildFfmpegArgs", () => {
  it("returns basic ffmpeg args for no audio", () => {
    const audio: AudioConfig = {};
    const args = buildFfmpegArgs("/in.mp4", "/out.mp4", audio);

    expect(args).toContain("-y");
    expect(args).toContain("-i");
    expect(args).toContain("/in.mp4");
    expect(args).toContain("-c:v");
    expect(args).toContain("libx264");
    expect(args).toContain("-c:a");
    expect(args).toContain("aac");
  });

  it("adds background music input", () => {
    const audio: AudioConfig = { background: "/music/bg.mp3" };
    const args = buildFfmpegArgs("/in.mp4", "/out.mp4", audio);

    expect(args).toContain("-i");
    expect(args).toContain("/music/bg.mp3");
  });

  it("adds background music with custom volume", () => {
    const audio: AudioConfig = { background: "/music/bg.mp3", backgroundVolume: 0.5 };
    const args = buildFfmpegArgs("/in.mp4", "/out.mp4", audio);

    expect(args).toContain("-filter_complex");
    const fcIdx = args.indexOf("-filter_complex");
    expect(args[fcIdx + 1]).toContain("volume=0.5");
  });

  it("adds narration input", () => {
    const audio: AudioConfig = { narration: "/voice/narration.mp3" };
    const args = buildFfmpegArgs("/in.mp4", "/out.mp4", audio);

    expect(args).toContain("-i");
    expect(args).toContain("/voice/narration.mp3");
  });

  it("applies narration delay", () => {
    const audio: AudioConfig = { narration: "/voice.mp3", narrationDelay: 2000 };
    const args = buildFfmpegArgs("/in.mp4", "/out.mp4", audio);

    expect(args).toContain("-filter_complex");
    const fcIdx = args.indexOf("-filter_complex");
    expect(args[fcIdx + 1]).toContain("adelay=2000|2000");
  });

  it("handles narration + background with delay", () => {
    const audio: AudioConfig = {
      narration: "/voice.mp3",
      background: "/bg.mp3",
      narrationDelay: 500,
    };
    const args = buildFfmpegArgs("/in.mp4", "/out.mp4", audio);

    expect(args).toContain("-filter_complex");
    const fcIdx = args.indexOf("-filter_complex");
    expect(args[fcIdx + 1]).toContain("adelay=500|500");
  });

  it("handles narration + background without delay", () => {
    const audio: AudioConfig = {
      narration: "/voice.mp3",
      background: "/bg.mp3",
    };
    const args = buildFfmpegArgs("/in.mp4", "/out.mp4", audio);

    const fcIdx = args.indexOf("-filter_complex");
    expect(args[fcIdx + 1]).toContain("amix=inputs=2");
  });

  it("handles narration placements", () => {
    const audio: AudioConfig = {
      narrationPlacements: [
        { sceneIndex: 0, narration: "Hello", clipPath: "/clips/0.mp3", startMs: 0, endMs: 1000 },
        { sceneIndex: 1, narration: "World", clipPath: "/clips/1.mp3", startMs: 1000, endMs: 2000 },
      ],
    } as any;
    const args = buildFfmpegArgs("/in.mp4", "/out.mp4", audio);

    expect(args).toContain("/clips/0.mp3");
    expect(args).toContain("/clips/1.mp3");
    expect(args).toContain("-filter_complex");
  });

  it("handles single narration placement", () => {
    const audio: AudioConfig = {
      narrationPlacements: [
        { sceneIndex: 0, narration: "Hi", clipPath: "/clips/0.mp3", startMs: 0, endMs: 500 },
      ],
    } as any;
    const args = buildFfmpegArgs("/in.mp4", "/out.mp4", audio);

    expect(args).toContain("-filter_complex");
  });

  it("handles narration placements with background", () => {
    const audio: AudioConfig = {
      narrationPlacements: [
        { sceneIndex: 0, narration: "Hi", clipPath: "/clips/0.mp3", startMs: 0, endMs: 500 },
      ],
      background: "/bg.mp3",
    } as any;
    const args = buildFfmpegArgs("/in.mp4", "/out.mp4", audio);

    const fcIdx = args.indexOf("-filter_complex");
    expect(args[fcIdx + 1]).toContain("amix=inputs=2");
  });

  it("maps video and audio correctly with placements", () => {
    const audio: AudioConfig = {
      narrationPlacements: [
        { sceneIndex: 0, narration: "A", clipPath: "/a.mp3", startMs: 0, endMs: 100 },
      ],
      background: "/bg.mp3",
    } as any;
    const args = buildFfmpegArgs("/in.mp4", "/out.mp4", audio);

    const mapIdx = args.indexOf("-map");
    expect(args[mapIdx + 1]).toBe("0:v");
  });

  it("uses default background volume 0.3", () => {
    const audio: AudioConfig = { background: "/bg.mp3" };
    const args = buildFfmpegArgs("/in.mp4", "/out.mp4", audio);

    const fcIdx = args.indexOf("-filter_complex");
    expect(args[fcIdx + 1]).toContain("volume=0.3");
  });

  it("applies custom background volume", () => {
    const audio: AudioConfig = { background: "/bg.mp3", backgroundVolume: 0.8 };
    const args = buildFfmpegArgs("/in.mp4", "/out.mp4", audio);

    const fcIdx = args.indexOf("-filter_complex");
    expect(args[fcIdx + 1]).toContain("volume=0.8");
  });

  it("returns H.264/AAC/MP4 output args", () => {
    const args = buildFfmpegArgs("/in.mp4", "/out.mp4", {});

    expect(args).toContain("-preset");
    expect(args).toContain("fast");
    expect(args).toContain("-crf");
    expect(args).toContain("23");
    expect(args).toContain("-b:a");
    expect(args).toContain("192k");
    expect(args).toContain("-movflags");
    expect(args).toContain("+faststart");
  });
});

// ── resolveAudioPaths ─────────────────────────────────────────────
describe("resolveAudioPaths", () => {
  it("returns undefined when audio is undefined", () => {
    expect(resolveAudioPaths(undefined, "/cfg")).toBeUndefined();
  });

  it("returns default background volume", () => {
    const result = resolveAudioPaths({}, "/cfg");
    expect(result?.backgroundVolume).toBe(0.3);
  });

  it("resolves narration path relative to config dir", () => {
    const result = resolveAudioPaths({ narration: "audio.mp3" }, "/cfg");
    expect(result?.narration).toContain("audio.mp3");
  });

  it("resolves narration manifest path relative to config dir", () => {
    const result = resolveAudioPaths({ narrationManifest: "manifest.json" }, "/cfg");
    expect(result?.narrationManifest).toContain("manifest.json");
  });

  it("resolves background path relative to config dir", () => {
    const result = resolveAudioPaths({ background: "music.mp3" }, "/cfg");
    expect(result?.background).toContain("music.mp3");
  });

  it("passes through narrationDelay", () => {
    const result = resolveAudioPaths({ narration: "a.mp3", narrationDelay: 500 }, "/cfg");
    expect(result?.narrationDelay).toBe(500);
  });

  it("passes through custom backgroundVolume", () => {
    const result = resolveAudioPaths({ background: "bg.mp3", backgroundVolume: 0.7 }, "/cfg");
    expect(result?.backgroundVolume).toBe(0.7);
  });

  it("resolves all paths together", () => {
    const result = resolveAudioPaths(
      {
        narration: "voice.mp3",
        narrationManifest: "manifest.json",
        background: "bg.mp3",
        narrationDelay: 100,
        backgroundVolume: 0.5,
      },
      "/cfg",
    );
    expect(result?.narration).toBeTruthy();
    expect(result?.narrationManifest).toBeTruthy();
    expect(result?.background).toBeTruthy();
    expect(result?.narrationDelay).toBe(100);
    expect(result?.backgroundVolume).toBe(0.5);
  });
});

// ── mergeAudioVideo ───────────────────────────────────────────────
describe("mergeAudioVideo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns input path when no audio", async () => {
    const result = await mergeAudioVideo({ videoPath: "/in.mp4", outputPath: "/out.mp4" });

    expect(result).toBe("/in.mp4");
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("returns input path when audio is empty", async () => {
    const result = await mergeAudioVideo({
      videoPath: "/in.mp4",
      outputPath: "/out.mp4",
      audio: {},
    });

    expect(result).toBe("/in.mp4");
  });

  it("returns input path when only narration but no placements", async () => {
    const result = await mergeAudioVideo({
      videoPath: "/in.mp4",
      outputPath: "/out.mp4",
      audio: { narration: undefined as any },
    });

    expect(result).toBe("/in.mp4");
  });

  it("uses ffmpeg-static path when available", async () => {
    ffmpegStaticMock.mockResolvedValue("/opt/ffmpeg");
    accessSyncMock.mockReturnValue(undefined);
    spawnMock.mockReturnValue({
      stderr: { on: vi.fn() },
      on: vi.fn((evt: string, cb: (code: number | null) => void) => {
        if (evt === "close") cb(0);
      }),
    } as any);

    const result = await mergeAudioVideo({
      videoPath: "/in.mp4",
      outputPath: "/out.mp4",
      audio: { background: "/bg.mp3" },
    });

    expect(result).toBe("/out.mp4");
  });

  it("falls back to system ffmpeg when ffmpeg-static returns null", async () => {
    ffmpegStaticMock.mockResolvedValue(null);
    accessSyncMock.mockImplementation(() => { throw new Error("not found"); });
    spawnMock.mockReturnValue({
      stderr: { on: vi.fn() },
      on: vi.fn((evt: string, cb: (code: number | null) => void) => {
        if (evt === "close") cb(0);
      }),
    } as any);

    await mergeAudioVideo({
      videoPath: "/in.mp4",
      outputPath: "/out.mp4",
      audio: { background: "/bg.mp3" },
    });

    expect(spawnMock).toHaveBeenCalledWith(
      "ffmpeg",
      expect.any(Array),
      expect.any(Object),
    );
  });

  it("throws when spawn fails to start", async () => {
    ffmpegStaticMock.mockResolvedValue("/opt/ffmpeg");
    accessSyncMock.mockReturnValue(undefined);
    spawnMock.mockReturnValue({
      stderr: { on: vi.fn() },
      on: vi.fn((evt: string, cb: (err: Error) => void) => {
        if (evt === "error") cb(new Error("ENOENT"));
      }),
    } as any);

    await expect(
      mergeAudioVideo({
        videoPath: "/in.mp4",
        outputPath: "/out.mp4",
        audio: { background: "/bg.mp3" },
      }),
    ).rejects.toThrow("Failed to start FFmpeg");
  });

  it("rejects when ffmpeg exits with non-zero code", async () => {
    ffmpegStaticMock.mockResolvedValue("/opt/ffmpeg");
    accessSyncMock.mockReturnValue(undefined);
    spawnMock.mockReturnValue({
      stderr: {
        on: vi.fn((evt: string, cb: (data: Buffer) => void) => {
          if (evt === "data") cb(Buffer.from("error message"));
        }),
      },
      on: vi.fn((evt: string, cb: (code: number | null) => void) => {
        if (evt === "close") cb(1);
      }),
    } as any);

    await expect(
      mergeAudioVideo({
        videoPath: "/in.mp4",
        outputPath: "/out.mp4",
        audio: { background: "/bg.mp3" },
      }),
    ).rejects.toThrow("FFmpeg failed with code 1");
  });

  it("changes output from webm to mp4", async () => {
    ffmpegStaticMock.mockResolvedValue("/opt/ffmpeg");
    accessSyncMock.mockReturnValue(undefined);
    spawnMock.mockReturnValue({
      stderr: { on: vi.fn() },
      on: vi.fn((evt: string, cb: (code: number | null) => void) => {
        if (evt === "close") cb(0);
      }),
    } as any);

    await mergeAudioVideo({
      videoPath: "/in.webm",
      outputPath: "/out.webm",
      audio: { background: "/bg.mp3" },
    });

    const call = spawnMock.mock.calls[0];
    expect(call[1]).not.toContain("/out.webm");
    expect(call[1]).toContain("/out.mp4");
  });
});
