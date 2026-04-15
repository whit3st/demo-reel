import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  readFileMock,
  generateScriptMock,
  validateScriptMock,
  fixBrokenStepsMock,
  generateVoiceSegmentsMock,
  generateNarrationAudioMock,
  synchronizeTimingMock,
  writeDemoConfigMock,
  writeScriptJsonMock,
  resolveVoiceConfigMock,
  schemaParseMock,
} = vi.hoisted(() => ({
  readFileMock: vi.fn(),
  generateScriptMock: vi.fn(),
  validateScriptMock: vi.fn(),
  fixBrokenStepsMock: vi.fn(),
  generateVoiceSegmentsMock: vi.fn(),
  generateNarrationAudioMock: vi.fn(),
  synchronizeTimingMock: vi.fn(),
  writeDemoConfigMock: vi.fn(),
  writeScriptJsonMock: vi.fn(),
  resolveVoiceConfigMock: vi.fn(),
  schemaParseMock: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  readFile: readFileMock,
}));

vi.mock("../src/script/generator.js", () => ({
  generateScript: generateScriptMock,
  validateScript: validateScriptMock,
  fixBrokenSteps: fixBrokenStepsMock,
}));

vi.mock("../src/script/tts.js", () => ({
  generateVoiceSegments: generateVoiceSegmentsMock,
  generateNarrationAudio: generateNarrationAudioMock,
}));

vi.mock("../src/script/timing.js", () => ({
  synchronizeTiming: synchronizeTimingMock,
}));

vi.mock("../src/script/assembler.js", () => ({
  writeDemoConfig: writeDemoConfigMock,
  writeScriptJson: writeScriptJsonMock,
}));

vi.mock("../src/voice-config.js", () => ({
  resolveVoiceConfig: resolveVoiceConfigMock,
}));

vi.mock("../src/script/types.js", () => ({
  demoScriptSchema: {
    parse: schemaParseMock,
  },
}));

import {
  scriptBuild,
  scriptFix,
  scriptFullPipeline,
  scriptGenerate,
  scriptValidate,
  scriptVoice,
} from "../src/script/cli.js";

describe("script cli", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scriptGenerate writes generated script json", async () => {
    generateScriptMock.mockResolvedValue({ scenes: [{ id: "1" }] });
    writeScriptJsonMock.mockResolvedValue(undefined);

    const out = await scriptGenerate("show signup", "https://example.com", "signup", {
      verbose: true,
      headed: true,
      hints: ["focus cta"],
    });

    expect(out).toBe("signup.script.json");
    expect(generateScriptMock).toHaveBeenCalledWith({
      description: "show signup",
      url: "https://example.com",
      hints: ["focus cta"],
      headed: true,
      verbose: true,
    });
    expect(writeScriptJsonMock).toHaveBeenCalledWith(
      { scenes: [{ id: "1" }] },
      "signup.script.json",
    );
  });

  it("scriptVoice generates audio and rewrites timed script", async () => {
    const parsed = { scenes: [{ steps: [] }] };
    const timedScenes = [{ duration: 1.2 }];
    const timedScript = { scenes: [{ steps: [], timing: 1.2 }] };

    readFileMock.mockResolvedValue('{"scenes":[]}');
    schemaParseMock.mockReturnValue(parsed);
    generateVoiceSegmentsMock.mockResolvedValue([{ text: "hello" }]);
    generateNarrationAudioMock.mockResolvedValue({
      timedScenes,
      narrationManifestPath: "demo-narration.json",
    });
    synchronizeTimingMock.mockReturnValue(timedScript);
    writeScriptJsonMock.mockResolvedValue(undefined);

    const out = await scriptVoice("demo.script.json", { provider: "openai", voice: "alloy" } as any, {
      noCache: true,
      verbose: true,
    });

    expect(out).toBe("demo-narration.mp3");
    expect(generateVoiceSegmentsMock).toHaveBeenCalledWith(
      parsed,
      { provider: "openai", voice: "alloy" },
      { noCache: true, verbose: true },
    );
    expect(generateNarrationAudioMock).toHaveBeenCalledWith(
      [{ text: "hello" }],
      "demo-narration.mp3",
      { verbose: true },
    );
    expect(synchronizeTimingMock).toHaveBeenCalledWith(parsed, timedScenes, "demo-narration.mp3");
    expect(writeScriptJsonMock).toHaveBeenCalledWith(
      { scenes: [{ steps: [], timing: 1.2 }], narrationManifestPath: "demo-narration.json" },
      "demo.script.json",
    );
  });

  it("scriptBuild throws when audio path missing", async () => {
    readFileMock.mockResolvedValue('{"scenes":[]}');

    await expect(scriptBuild("demo.script.json")).rejects.toThrow(
      "Script has no audio timing data. Run `demo-reel script voice` first.",
    );
  });

  it("scriptBuild writes demo config when audio exists", async () => {
    readFileMock.mockResolvedValue('{"audioPath":"demo-narration.mp3"}');
    writeDemoConfigMock.mockResolvedValue(undefined);

    const out = await scriptBuild("demo.script.json", { resolution: "FHD", format: "webm" });

    expect(out).toBe("demo.demo.ts");
    expect(writeDemoConfigMock).toHaveBeenCalledWith(
      { audioPath: "demo-narration.mp3" },
      "demo.demo.ts",
      { resolution: "FHD", format: "webm" },
    );
  });

  it("scriptValidate returns true when no failures", async () => {
    const parsed = { scenes: [{ steps: [] }] };
    readFileMock.mockResolvedValue('{"scenes":[]}');
    schemaParseMock.mockReturnValue(parsed);
    validateScriptMock.mockResolvedValue([]);

    const ok = await scriptValidate("demo.script.json", { headed: true, verbose: true });

    expect(ok).toBe(true);
    expect(validateScriptMock).toHaveBeenCalledWith(parsed, { headed: true, verbose: true });
  });

  it("scriptValidate returns false when failures found", async () => {
    const parsed = { scenes: [{ steps: [{ action: "click" }] }] };
    readFileMock.mockResolvedValue('{"scenes":[]}');
    schemaParseMock.mockReturnValue(parsed);
    validateScriptMock.mockResolvedValue([{ scene: 0, step: 0, error: "not found" }]);

    const ok = await scriptValidate("demo.script.json");

    expect(ok).toBe(false);
  });

  it("scriptFix returns early when no broken steps", async () => {
    const parsed = { scenes: [{ steps: [] }] };
    readFileMock.mockResolvedValue('{"scenes":[]}');
    schemaParseMock.mockReturnValue(parsed);
    validateScriptMock.mockResolvedValue([]);

    await scriptFix("demo.script.json", { verbose: true, headed: true });

    expect(fixBrokenStepsMock).not.toHaveBeenCalled();
    expect(writeScriptJsonMock).not.toHaveBeenCalled();
  });

  it("scriptFix writes fixed file and revalidates", async () => {
    const parsed = { scenes: [{ steps: [{ action: "click" }] }] };
    const fixed = { scenes: [{ steps: [{ action: "click", selector: "#ok" }] }] };
    readFileMock.mockResolvedValue('{"scenes":[]}');
    schemaParseMock.mockReturnValue(parsed);
    validateScriptMock
      .mockResolvedValueOnce([{ scene: 0, step: 0, error: "missing selector" }])
      .mockResolvedValueOnce([]);
    fixBrokenStepsMock.mockResolvedValue(fixed);
    writeScriptJsonMock.mockResolvedValue(undefined);

    await scriptFix("demo.script.json", { verbose: true });

    expect(fixBrokenStepsMock).toHaveBeenCalledWith(
      parsed,
      [{ scene: 0, step: 0, error: "missing selector" }],
      { verbose: true },
    );
    expect(writeScriptJsonMock).toHaveBeenCalledWith(fixed, "demo.script.json");
    expect(validateScriptMock).toHaveBeenLastCalledWith(fixed, { verbose: true });
  });

  it("scriptFullPipeline runs full flow", async () => {
    resolveVoiceConfigMock.mockReturnValue({ provider: "openai", voice: "nova", speed: 1.2 });
    generateScriptMock.mockResolvedValue({ scenes: [{ steps: [] }] });
    writeScriptJsonMock.mockResolvedValue(undefined);
    readFileMock
      .mockResolvedValueOnce('{"scenes":[]}')
      .mockResolvedValueOnce('{"scenes":[]}')
      .mockResolvedValueOnce('{"audioPath":"signup-narration.mp3"}');
    schemaParseMock.mockReturnValue({ scenes: [{ steps: [{ action: "click" }] }] });
    validateScriptMock.mockResolvedValue([]);
    generateVoiceSegmentsMock.mockResolvedValue([{ text: "hello" }]);
    generateNarrationAudioMock.mockResolvedValue({
      timedScenes: [{ duration: 1.2 }],
      narrationManifestPath: "narration.json",
    });
    synchronizeTimingMock.mockReturnValue({ scenes: [{ steps: [] }], audioPath: "demo-narration.mp3" });
    writeDemoConfigMock.mockResolvedValue(undefined);

    const out = await scriptFullPipeline("show signup", "https://example.com", {
      output: "signup",
      voice: { voice: "nova", speed: 1.2 },
      hints: ["focus cta"],
      resolution: "FHD",
      format: "webm",
      verbose: true,
    });

    expect(out).toBe("signup.demo.ts");
    expect(resolveVoiceConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "openai", voice: "nova", speed: 1.2 }),
    );
    expect(writeDemoConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({ audioPath: "signup-narration.mp3" }),
      "signup.demo.ts",
      { resolution: "FHD", format: "webm" },
    );
  });
});
