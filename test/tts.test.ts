import { describe, expect, it, vi, beforeEach } from "vitest";

const { spawnMock, statMock, readFileMock, writeFileMock, unlinkMock, mkdirMock, accessSyncMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  statMock: vi.fn(),
  readFileMock: vi.fn(),
  writeFileMock: vi.fn(),
  unlinkMock: vi.fn(),
  mkdirMock: vi.fn(),
  accessSyncMock: vi.fn(),
}));

vi.mock("child_process", () => ({
  spawn: spawnMock,
}));

vi.mock("fs", () => ({
  accessSync: accessSyncMock,
}));

vi.mock("fs/promises", () => ({
  mkdir: mkdirMock,
  readFile: readFileMock,
  writeFile: writeFileMock,
  unlink: unlinkMock,
  stat: statMock,
}));

import {
  applyPronunciation,
  getTTSProvider,
  registerTTSProvider,
  getFFmpegPath,
  getFFprobePath,
  runFFmpeg,
  runFfprobe,
  wavToMp3,
  generateSilence,
  concatenateAudio,
  measureAudioDuration,
  generateVoiceSegments,
  generateNarrationAudio,
} from "../src/script/tts.js";

describe("applyPronunciation", () => {
  it("returns text unchanged when no pronunciation map", () => {
    expect(applyPronunciation("hello world")).toBe("hello world");
  });

  it("returns text unchanged when pronunciation map is empty", () => {
    expect(applyPronunciation("hello world", {})).toBe("hello world");
  });

  it("applies single replacement", () => {
    expect(applyPronunciation("demo reel", { "demo": "sample" })).toBe("sample reel");
  });

  it("applies multiple replacements", () => {
    const result = applyPronunciation("demo reel is great", {
      "demo": "sample",
      "reel": "roll",
    });
    expect(result).toBe("sample roll is great");
  });

  it("is case-insensitive", () => {
    expect(applyPronunciation("DEMO Reel", { "demo": "sample" })).toBe("sample Reel");
  });

  it("replaces whole words only (no partial matches)", () => {
    expect(applyPronunciation("democracy", { "demo": "sample" })).toBe("democracy");
  });

  it("handles repeated words", () => {
    expect(applyPronunciation("demo demo demo", { "demo": "sample" })).toBe("sample sample sample");
  });

  it("handles special regex characters in replacement words", () => {
    expect(applyPronunciation("hello.world", { "hello.world": "hi" })).toBe("hi");
  });

  it("handles punctuation attached to words", () => {
    expect(applyPronunciation("demo, world!", { demo: "sample" })).toBe("sample, world!");
  });
});

describe("getTTSProvider", () => {
  it("returns piper provider", () => {
    const provider = getTTSProvider("piper");
    expect(provider.name).toBe("piper");
  });

  it("returns openai provider", () => {
    const provider = getTTSProvider("openai");
    expect(provider.name).toBe("openai");
  });

  it("returns elevenlabs provider", () => {
    const provider = getTTSProvider("elevenlabs");
    expect(provider.name).toBe("elevenlabs");
  });

  it("throws for unknown provider with available options", () => {
    expect(() => getTTSProvider("unknown")).toThrow("Unknown TTS provider: \"unknown\"");
    expect(() => getTTSProvider("unknown")).toThrow("Available: piper, openai, elevenlabs");
  });
});

describe("registerTTSProvider", () => {
  it("registers and retrieves a custom provider", () => {
    const customProvider = {
      name: "custom",
      generate: vi.fn(),
    };
    registerTTSProvider(customProvider as any);
    expect(getTTSProvider("custom").name).toBe("custom");
  });

  it("overwrites existing provider with same name", () => {
    const v1 = { name: "test-provider", generate: vi.fn() };
    const v2 = { name: "test-provider", generate: vi.fn() };
    registerTTSProvider(v1 as any);
    registerTTSProvider(v2 as any);
    expect(getTTSProvider("test-provider")).toBe(v2);
  });
});

describe("getFFmpegPath", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns ffmpeg-static path when accessible", async () => {
    vi.doMock("ffmpeg-static", () => ({ default: "/opt/ffmpeg" }));
    const { getFFmpegPath } = await import("../src/script/tts.js");
    accessSyncMock.mockReturnValue(undefined);

    const result = await getFFmpegPath();
    expect(result).toBe("/opt/ffmpeg");
  });

  it("falls back to 'ffmpeg' when ffmpeg-static returns null", async () => {
    vi.doMock("ffmpeg-static", () => ({ default: null as any }));
    const { getFFmpegPath } = await import("../src/script/tts.js");

    const result = await getFFmpegPath();
    expect(result).toBe("ffmpeg");
  });

  it("falls back to 'ffmpeg' when accessSync throws", async () => {
    vi.doMock("ffmpeg-static", () => ({ default: "/opt/ffmpeg" }));
    const { getFFmpegPath } = await import("../src/script/tts.js");
    accessSyncMock.mockImplementation(() => { throw new Error("ENOENT"); });

    const result = await getFFmpegPath();
    expect(result).toBe("ffmpeg");
  });

  it("falls back to 'ffmpeg' when ffmpeg-static module throws", async () => {
    vi.doMock("ffmpeg-static", () => { throw new Error("module not found"); });
    const { getFFmpegPath } = await import("../src/script/tts.js");

    const result = await getFFmpegPath();
    expect(result).toBe("ffmpeg");
  });
});

describe("getFFprobePath", () => {
  it("returns adjacent ffprobe when file exists", async () => {
    const { getFFprobePath } = await import("../src/script/tts.js");
    statMock.mockResolvedValue(undefined);

    const result = await getFFprobePath("/usr/bin/ffmpeg");
    expect(result).toBe("/usr/bin/ffprobe");
  });

  it("falls back to 'ffprobe' when adjacent file does not exist", async () => {
    const { getFFprobePath } = await import("../src/script/tts.js");
    statMock.mockImplementation(() => { throw new Error("not found"); });

    const result = await getFFprobePath("/usr/bin/ffmpeg");
    expect(result).toBe("ffprobe");
  });
});

describe("runFFmpeg", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves when ffmpeg exits with code 0", async () => {
    spawnMock.mockReturnValue({
      stderr: { on: vi.fn() },
      on: vi.fn((evt: string, cb: (code: number) => void) => { if (evt === "close") cb(0); }),
    });
    await expect(runFFmpeg("ffmpeg", ["-version"])).resolves.toBeUndefined();
  });

  it("rejects when ffmpeg exits with non-zero code", async () => {
    spawnMock.mockReturnValue({
      stderr: { on: vi.fn() },
      on: vi.fn((evt: string, cb: (code: number) => void) => { if (evt === "close") cb(1); }),
    });
    await expect(runFFmpeg("ffmpeg", ["-invalid"])).rejects.toThrow("FFmpeg exited with code 1");
  });

  it("rejects when spawn emits error event", async () => {
    spawnMock.mockReturnValue({
      stderr: { on: vi.fn() },
      on: vi.fn((evt: string, cb: (err: Error) => void) => { if (evt === "error") cb(new Error("ENOENT")); }),
    });
    await expect(runFFmpeg("ffmpeg", [])).rejects.toThrow("ENOENT");
  });
});

describe("runFfprobe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects when ffprobe exits with non-zero code", async () => {
    spawnMock.mockReturnValue({
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn((evt: string, cb: (code: number) => void) => { if (evt === "close") cb(1); }),
    });
    await expect(runFfprobe("ffprobe", ["-v", "error", "fake.mp3"])).rejects.toThrow("ffprobe exited with code 1");
  });

  it("rejects when spawn emits error event", async () => {
    spawnMock.mockReturnValue({
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn((evt: string, cb: (err: Error) => void) => { if (evt === "error") cb(new Error("ENOENT")); }),
    });
    await expect(runFfprobe("ffprobe", [])).rejects.toThrow("ENOENT");
  });
});

describe("wavToMp3", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mkdirMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);
    readFileMock.mockResolvedValue(Buffer.from("mp3-data"));
    unlinkMock.mockResolvedValue(undefined);
  });

  it("writes temp files and calls runFFmpeg", async () => {
    spawnMock.mockReturnValue({
      stderr: { on: vi.fn() },
      on: vi.fn((evt: string, cb: (code: number) => void) => { if (evt === "close") cb(0); }),
    });
    mkdirMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);
    readFileMock.mockResolvedValue(Buffer.from("mp3-data"));

    const result = await wavToMp3(Buffer.from("wav-data"));

    expect(result).toBeInstanceOf(Buffer);
    expect(mkdirMock).toHaveBeenCalled();
    expect(writeFileMock).toHaveBeenCalled();
    expect(unlinkMock).toHaveBeenCalled();
  });

  it("rejects when ffmpeg fails", async () => {
    spawnMock.mockReturnValue({
      stderr: { on: vi.fn() },
      on: vi.fn((evt: string, cb: (code: number) => void) => { if (evt === "close") cb(1); }),
    });

    await expect(wavToMp3(Buffer.from("wav-data"))).rejects.toThrow("FFmpeg exited with code 1");
  });
});

describe("generateSilence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls runFFmpeg with silence args", async () => {
    spawnMock.mockReturnValue({
      stderr: { on: vi.fn() },
      on: vi.fn((evt: string, cb: (code: number) => void) => { if (evt === "close") cb(0); }),
    });
    mkdirMock.mockResolvedValue(undefined);

    await expect(generateSilence("ffmpeg", "/out/silence.mp3", 1000)).resolves.toBeUndefined();

    const spawnCall = spawnMock.mock.calls[0];
    expect(spawnCall[0]).toBe("ffmpeg");
    expect(spawnCall[1]).toContain("-f");
    expect(spawnCall[1]).toContain("lavfi");
    expect(spawnCall[1]).toContain("anullsrc=r=44100:cl=mono");
    expect(spawnCall[1]).toContain("-t");
    expect(spawnCall[1]).toContain("1"); // 1000ms = 1s
  });

  it("rejects when ffmpeg fails", async () => {
    spawnMock.mockReturnValue({
      stderr: { on: vi.fn() },
      on: vi.fn((evt: string, cb: (code: number) => void) => { if (evt === "close") cb(1); }),
    });

    await expect(generateSilence("ffmpeg", "/out/silence.mp3", 500)).rejects.toThrow("FFmpeg exited with code 1");
  });
});

describe("concatenateAudio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mkdirMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);
    readFileMock.mockResolvedValue(Buffer.from("concat-result"));
    unlinkMock.mockResolvedValue(undefined);
  });

  it("writes segment files and calls runFFmpeg for concatenation", async () => {
    spawnMock.mockReturnValue({
      stderr: { on: vi.fn() },
      on: vi.fn((evt: string, cb: (code: number) => void) => { if (evt === "close") cb(0); }),
    });
    mkdirMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);
    readFileMock.mockResolvedValue(Buffer.from("concat-result"));
    unlinkMock.mockResolvedValue(undefined);

    const segments = [
      { audio: Buffer.from("seg1"), gapAfterMs: 800 },
      { audio: Buffer.from("seg2"), gapAfterMs: 0 },
    ];

    const result = await concatenateAudio(segments);

    expect(result).toBeInstanceOf(Buffer);
    expect(writeFileMock).toHaveBeenCalled();
    expect(unlinkMock).toHaveBeenCalled();
  });

  it("rejects when concatenation ffmpeg fails", async () => {
    spawnMock.mockReturnValue({
      stderr: { on: vi.fn() },
      on: vi.fn((evt: string, cb: (code: number) => void) => { if (evt === "close") cb(1); }),
    });

    const segments = [{ audio: Buffer.from("seg1"), gapAfterMs: 0 }];
    await expect(concatenateAudio(segments)).rejects.toThrow("FFmpeg exited with code 1");
  });
});

describe("measureAudioDuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses duration from ffprobe output and returns milliseconds", async () => {
    vi.doMock("ffmpeg-static", () => ({ default: "/ffmpeg" }));
    const { measureAudioDuration: mAD } = await import("../src/script/tts.js");

    statMock.mockImplementation(() => { throw new Error("not found"); });
    mkdirMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);
    unlinkMock.mockResolvedValue(undefined);

    spawnMock.mockReturnValue({
      stdout: { on: vi.fn((_: string, cb: (d: Buffer) => void) => cb(Buffer.from("3.5"))) },
      stderr: { on: vi.fn() },
      on: vi.fn((evt: string, cb: (code: number) => void) => { if (evt === "close") cb(0); }),
    });

    const result = await mAD(Buffer.from("fake-mp3"));
    expect(result).toBe(3500);
  });

  it("throws when ffprobe output cannot be parsed", async () => {
    vi.doMock("ffmpeg-static", () => ({ default: "/ffmpeg" }));
    const { measureAudioDuration: mAD } = await import("../src/script/tts.js");

    statMock.mockImplementation(() => { throw new Error("not found"); });
    mkdirMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);
    unlinkMock.mockResolvedValue(undefined);

    spawnMock.mockReturnValue({
      stdout: { on: vi.fn((_: string, cb: (d: Buffer) => void) => cb(Buffer.from("not-a-number"))) },
      stderr: { on: vi.fn() },
      on: vi.fn((evt: string, cb: (code: number) => void) => { if (evt === "close") cb(0); }),
    });

    await expect(mAD(Buffer.from("fake-mp3"))).rejects.toThrow("Could not parse audio duration");
  });

  it("cleans up temp file after reading duration", async () => {
    vi.doMock("ffmpeg-static", () => ({ default: "/ffmpeg" }));
    const { measureAudioDuration: mAD } = await import("../src/script/tts.js");

    statMock.mockImplementation(() => { throw new Error("not found"); });
    mkdirMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);
    unlinkMock.mockResolvedValue(undefined);

    spawnMock.mockReturnValue({
      stdout: { on: vi.fn((_: string, cb: (d: Buffer) => void) => cb(Buffer.from("1.0"))) },
      stderr: { on: vi.fn() },
      on: vi.fn((evt: string, cb: (code: number) => void) => { if (evt === "close") cb(0); }),
    });

    await mAD(Buffer.from("fake-mp3"));
    expect(unlinkMock).toHaveBeenCalled();
  });
});

describe("generateVoiceSegments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates segments for each scene with custom provider", async () => {
    const mockGenerate = vi.fn().mockResolvedValue({ audio: Buffer.from("audio"), durationMs: 1500 });
    registerTTSProvider({ name: "test", generate: mockGenerate });

    const script = {
      title: "Test",
      description: "Test demo",
      url: "https://example.com",
      scenes: [
        { narration: "Hello world", steps: [], stepIndex: 0 },
        { narration: "Second scene", steps: [], stepIndex: 1 },
      ],
      voice: { provider: "test", speed: 1.0 },
    };

    statMock.mockImplementation(() => { throw new Error("not found"); });
    writeFileMock.mockResolvedValue(undefined);
    readFileMock.mockResolvedValue(Buffer.from("cached"));
    mkdirMock.mockResolvedValue(undefined);
    spawnMock.mockReturnValue({
      stdout: { on: vi.fn((_: string, cb: (d: Buffer) => void) => cb(Buffer.from("1.5"))) },
      stderr: { on: vi.fn() },
      on: vi.fn((evt: string, cb: (code: number) => void) => { if (evt === "close") cb(0); }),
    });

    const segments = await generateVoiceSegments(script, script.voice!);

    expect(segments).toHaveLength(2);
    expect(segments[0].narration).toBe("Hello world");
    expect(segments[0].sceneIndex).toBe(0);
    expect(segments[1].narration).toBe("Second scene");
    expect(segments[1].sceneIndex).toBe(1);
  });

  it("uses cached audio when available (noCache=false)", async () => {
    const mockGenerate = vi.fn().mockResolvedValue({ audio: Buffer.from("fresh"), durationMs: 2000 });
    registerTTSProvider({ name: "cached-test", generate: mockGenerate });

    const script = {
      title: "Test",
      description: "Test demo",
      url: "https://example.com",
      scenes: [{ narration: "Cached scene", steps: [], stepIndex: 0 }],
      voice: { provider: "cached-test", speed: 1.0 },
    };

    statMock.mockResolvedValue(undefined);
    readFileMock.mockResolvedValue(Buffer.from("cached-audio"));
    mkdirMock.mockResolvedValue(undefined);
    spawnMock.mockReturnValue({
      stdout: { on: vi.fn((_: string, cb: (d: Buffer) => void) => cb(Buffer.from("2.0"))) },
      stderr: { on: vi.fn() },
      on: vi.fn((evt: string, cb: (code: number) => void) => { if (evt === "close") cb(0); }),
    });

    const segments = await generateVoiceSegments(script, script.voice!);

    expect(segments).toHaveLength(1);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("skips cache when noCache=true", async () => {
    const mockGenerate = vi.fn().mockResolvedValue({ audio: Buffer.from("fresh"), durationMs: 1000 });
    registerTTSProvider({ name: "nocache-test", generate: mockGenerate });

    const script = {
      title: "Test",
      description: "Test demo",
      url: "https://example.com",
      scenes: [{ narration: "Fresh scene", steps: [], stepIndex: 0 }],
      voice: { provider: "nocache-test", speed: 1.0 },
    };

    statMock.mockResolvedValue(undefined);
    readFileMock.mockResolvedValue(Buffer.from("cached-audio"));
    mkdirMock.mockResolvedValue(undefined);
    spawnMock.mockReturnValue({
      stdout: { on: vi.fn((_: string, cb: (d: Buffer) => void) => cb(Buffer.from("1.0"))) },
      stderr: { on: vi.fn() },
      on: vi.fn((evt: string, cb: (code: number) => void) => { if (evt === "close") cb(0); }),
    });

    const segments = await generateVoiceSegments(script, script.voice!, { noCache: true });

    expect(mockGenerate).toHaveBeenCalled();
  });
});

describe("generateNarrationAudio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("writes clip files and concatenates segments", async () => {
    const concatMock = vi.fn().mockResolvedValue(Buffer.from("concatenated"));
    vi.doMock("child_process", () => ({ spawn: spawnMock }));
    vi.doMock("fs", () => ({ accessSync: accessSyncMock }));
    vi.doMock("fs/promises", () => ({
      mkdir: mkdirMock,
      readFile: readFileMock,
      writeFile: writeFileMock,
      unlink: unlinkMock,
      stat: statMock,
    }));
    vi.doMock("ffmpeg-static", () => ({ default: "/ffmpeg" }));

    const { generateNarrationAudio: gNA } = await import("../src/script/tts.js");

    statMock.mockImplementation(() => { throw new Error("not found"); });
    mkdirMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);
    spawnMock.mockReturnValue({
      stderr: { on: vi.fn() },
      on: vi.fn((evt: string, cb: (code: number) => void) => { if (evt === "close") cb(0); }),
    });

    const segments = [
      {
        sceneIndex: 0,
        stepIndex: 0,
        sourceSceneIndex: 0,
        narration: "First",
        audio: Buffer.from("audio1"),
        durationMs: 1000,
        gapAfterMs: 800,
      },
      {
        sceneIndex: 1,
        stepIndex: 1,
        sourceSceneIndex: 1,
        narration: "Second",
        audio: Buffer.from("audio2"),
        durationMs: 2000,
        gapAfterMs: 0,
      },
    ];

    const result = await gNA(segments, "/output/narration.mp3");

    expect(result.timedScenes).toHaveLength(2);
    expect(result.narrationManifestPath).toBeDefined();
    expect(writeFileMock).toHaveBeenCalled();
  });
});
