import { describe, expect, it } from "vitest";
import {
  DEFAULT_VOICE_CONFIG,
  getVoiceName,
  resolveVoiceConfig,
  voiceConfigSchema,
} from "../src/voice-config.js";

describe("voice-config", () => {
  it("parses default voice config", () => {
    expect(voiceConfigSchema.parse(undefined)).toEqual(DEFAULT_VOICE_CONFIG);
  });

  it("resolves default piper voice settings", () => {
    expect(resolveVoiceConfig()).toEqual(DEFAULT_VOICE_CONFIG);
  });

  it("resolves custom piper voice by name", () => {
    expect(
      resolveVoiceConfig({
        provider: "piper",
        voice: "en_US-amy-medium",
        speed: 1.5,
        pronunciation: { demo: "deh-moh" },
      }),
    ).toEqual({
      provider: "piper",
      voice: "en_US-amy-medium",
      speed: 1.5,
      pronunciation: { demo: "deh-moh" },
    });
  });

  it("resolves piper with custom voice path when voice looks like a path", () => {
    // When voice looks like a path (starts with / or contains .onnx), use voicePath
    expect(
      resolveVoiceConfig({
        provider: "piper",
        voice: "/models/custom.onnx",
        speed: 0.75,
      }),
    ).toEqual({
      provider: "piper",
      voicePath: "/models/custom.onnx",
      speed: 0.75,
    });

    // voicePath takes precedence over voice
    expect(
      resolveVoiceConfig({
        provider: "piper",
        voice: "en_US-amy-medium",
        voicePath: "./voices/custom.onnx",
      }),
    ).toEqual({
      provider: "piper",
      voicePath: "./voices/custom.onnx",
      speed: 1,
    });
  });

  it("resolves openai and elevenlabs defaults", () => {
    expect(resolveVoiceConfig({ provider: "openai" })).toEqual({
      provider: "openai",
      voice: "alloy",
      speed: 1,
    });

    expect(resolveVoiceConfig({ provider: "elevenlabs" })).toEqual({
      provider: "elevenlabs",
      voice: "21m00Tcm4TlvDq8ikWAM",
      speed: 1,
    });
  });

  it("returns readable voice name for named and path-based configs", () => {
    expect(getVoiceName(resolveVoiceConfig({ provider: "openai", voice: "nova" }))).toBe("nova");
    expect(
      getVoiceName(resolveVoiceConfig({ provider: "piper", voicePath: "/models/custom.onnx" })),
    ).toBe("/models/custom.onnx");
  });

  it("rejects invalid provider-specific options", () => {
    expect(() => resolveVoiceConfig({ provider: "openai", voice: "invalid" })).toThrow();
    expect(() => resolveVoiceConfig({ provider: "piper", speed: 3 })).toThrow();
  });
});
