import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  readFileMock,
  mkdirMock,
  statMock,
  parseMock,
  generateVoiceSegmentsMock,
  generateNarrationAudioMock,
  synchronizeTimingMock,
  writeScriptJsonMock,
  getVoiceNameMock,
  resolveVoiceConfigMock,
} = vi.hoisted(() => ({
  readFileMock: vi.fn(),
  mkdirMock: vi.fn(),
  statMock: vi.fn(),
  parseMock: vi.fn(),
  generateVoiceSegmentsMock: vi.fn(),
  generateNarrationAudioMock: vi.fn(),
  synchronizeTimingMock: vi.fn(),
  writeScriptJsonMock: vi.fn(),
  getVoiceNameMock: vi.fn(),
  resolveVoiceConfigMock: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  readFile: readFileMock,
  mkdir: mkdirMock,
  stat: statMock,
}));

vi.mock("../src/script/types.js", () => ({
  demoScriptSchema: {
    parse: parseMock,
  },
}));

vi.mock("../src/script/tts.js", () => ({
  generateVoiceSegments: generateVoiceSegmentsMock,
  generateNarrationAudio: generateNarrationAudioMock,
}));

vi.mock("../src/script/timing.js", () => ({
  synchronizeTiming: synchronizeTimingMock,
}));

vi.mock("../src/script/assembler.js", () => ({
  writeScriptJson: writeScriptJsonMock,
}));

vi.mock("../src/voice-config.js", () => ({
  getVoiceName: getVoiceNameMock,
  resolveVoiceConfig: resolveVoiceConfigMock,
}));

import { main } from "../src/script/voice-cli.js";

describe("voice-cli", () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.clearAllMocks();
    process.argv = [...originalArgv];
  });

  it("exits with usage when script path missing", async () => {
    process.argv = ["node", "voice-cli"];
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
      code?: string | number | null,
    ) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(main()).rejects.toThrow("exit:1");
    expect(errorSpy).toHaveBeenCalledWith(
      "Usage: node dist/script/voice-cli.js <script.json> [--provider piper] [--voice nl_NL-mls-medium] [--speed 1.0]",
    );

    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("generates narration using cli overrides", async () => {
    process.argv = [
      "node",
      "voice-cli",
      "demo.script.json",
      "--provider",
      "openai",
      "--voice",
      "nova",
      "--speed",
      "1.2",
      "--output",
      "out/audio.mp3",
      "--pronunciation",
      '{"OpenAI":"Open A I"}',
    ];

    const parsedScript = {
      scenes: [{ steps: [] }],
      voice: { provider: "piper", voicePath: "model.onnx", speed: 0.9 },
    };
    const voice = { provider: "openai", voice: "nova", speed: 1.2 };

    statMock.mockRejectedValue(new Error("missing"));
    readFileMock.mockResolvedValue('{"scenes":[]}');
    parseMock.mockReturnValue(parsedScript);
    resolveVoiceConfigMock.mockReturnValue(voice);
    getVoiceNameMock.mockReturnValue("nova");
    generateVoiceSegmentsMock.mockResolvedValue([{ text: "hello" }]);
    generateNarrationAudioMock.mockResolvedValue({
      timedScenes: [{ duration: 1.2 }],
      narrationManifestPath: "out/narration.json",
    });
    synchronizeTimingMock.mockReturnValue({ scenes: [{ steps: [] }] });
    writeScriptJsonMock.mockResolvedValue(undefined);
    mkdirMock.mockResolvedValue(undefined);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await main();

    expect(resolveVoiceConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai",
        voicePath: "model.onnx",
        voice: "nova",
        speed: 1.2,
        pronunciation: { OpenAI: "Open A I" },
      }),
    );
    expect(mkdirMock).toHaveBeenCalledWith("out", { recursive: true });
    expect(generateNarrationAudioMock).toHaveBeenCalledWith([{ text: "hello" }], "out/audio.mp3", {
      verbose: true,
    });
    expect(writeScriptJsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        voice,
        narrationManifestPath: "out/narration.json",
      }),
      "demo.script.json",
    );
    expect(logSpy).toHaveBeenCalledWith("out/audio.mp3");

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("uses product config voice and default output path", async () => {
    process.argv = ["node", "voice-cli", "demo.script.json"];

    const parsedScript = {
      scenes: [{ steps: [] }],
      voice: "invalid",
    };
    const voice = {
      provider: "elevenlabs",
      voice: "Rachel",
      speed: 0.95,
      pronunciation: { OpenAI: "Open A I" },
    };

    statMock.mockResolvedValue(undefined);
    readFileMock
      .mockResolvedValueOnce('{"scenes":[]}')
      .mockResolvedValueOnce(
        '{"voice":{"provider":"elevenlabs","voice":"Rachel","speed":0.95,"pronunciation":{"OpenAI":"Open A I"}}}',
      );
    parseMock.mockReturnValue(parsedScript);
    resolveVoiceConfigMock.mockReturnValue(voice);
    getVoiceNameMock.mockReturnValue("Rachel");
    generateVoiceSegmentsMock.mockResolvedValue([{ text: "hello" }]);
    generateNarrationAudioMock.mockResolvedValue({
      timedScenes: [{ duration: 2 }],
      narrationManifestPath: "output/demo-narration.json",
    });
    synchronizeTimingMock.mockReturnValue({ scenes: [{ steps: [] }] });
    writeScriptJsonMock.mockResolvedValue(undefined);
    mkdirMock.mockResolvedValue(undefined);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await main();

    expect(resolveVoiceConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "elevenlabs",
        voice: "Rachel",
        speed: 0.95,
        pronunciation: { OpenAI: "Open A I" },
      }),
    );
    expect(mkdirMock).toHaveBeenCalledWith("output", { recursive: true });
    expect(generateNarrationAudioMock).toHaveBeenCalledWith(
      [{ text: "hello" }],
      "output/demo-narration.mp3",
      { verbose: true },
    );
    expect(errorSpy).toHaveBeenCalledWith("Pronunciation: OpenAI→Open A I");
    expect(logSpy).toHaveBeenCalledWith("output/demo-narration.mp3");

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("loads pronunciation from file path", async () => {
    process.argv = [
      "node",
      "voice-cli",
      "demo.script.json",
      "--pronunciation",
      "pron.json",
      "--output",
      "out/audio.mp3",
    ];

    const parsedScript = { scenes: [{ steps: [] }] };
    const voice = { provider: "openai", voice: "alloy", speed: 1 };

    statMock.mockRejectedValue(new Error("missing"));
    readFileMock
      .mockResolvedValueOnce('{"OpenAI":"Open A I"}')
      .mockResolvedValueOnce('{"scenes":[]}');
    parseMock.mockReturnValue(parsedScript);
    resolveVoiceConfigMock.mockReturnValue(voice);
    getVoiceNameMock.mockReturnValue("alloy");
    generateVoiceSegmentsMock.mockResolvedValue([{ text: "hello" }]);
    generateNarrationAudioMock.mockResolvedValue({
      timedScenes: [{ duration: 1 }],
      narrationManifestPath: "out/narration.json",
    });
    synchronizeTimingMock.mockReturnValue({ scenes: [{ steps: [] }] });
    writeScriptJsonMock.mockResolvedValue(undefined);
    mkdirMock.mockResolvedValue(undefined);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await main();

    expect(readFileMock).toHaveBeenCalledWith("pron.json", "utf-8");
    expect(resolveVoiceConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({ pronunciation: { OpenAI: "Open A I" } }),
    );
    expect(logSpy).toHaveBeenCalledWith("out/audio.mp3");

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("exits when processing fails", async () => {
    process.argv = ["node", "voice-cli", "demo.script.json"];
    statMock.mockRejectedValue(new Error("missing"));
    readFileMock.mockRejectedValue(new Error("cannot read"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
      code?: string | number | null,
    ) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(main()).rejects.toThrow("exit:1");
    expect(errorSpy).toHaveBeenCalledWith("Error: cannot read");

    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
