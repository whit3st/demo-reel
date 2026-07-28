import { createHash } from "crypto";
import { describe, expect, it } from "vitest";
import { cacheKey } from "../src/voice/cache.js";
import { NARRATION_PROCESSING_VERSION } from "../src/narration-manifest.js";
import { resolveVoiceConfig } from "../src/voice-config.js";

const TEXT = "We enter the username and password, then click the Login button.";

function legacyKey(text: string, provider: string, voice: string, speed: number): string {
  return createHash("sha256")
    .update(`${NARRATION_PROCESSING_VERSION}|${text}|${provider}|${voice}|${speed}`)
    .digest("hex")
    .slice(0, 16);
}

describe("cacheKey", () => {
  it("keeps keys stable for providers without a language", () => {
    // Adding the language segment must not invalidate already-cached audio.
    for (const voice of [
      resolveVoiceConfig({ provider: "piper", voice: "en_US-amy-medium" }),
      resolveVoiceConfig({ provider: "chatterbox" }),
      resolveVoiceConfig({ provider: "openai", voice: "nova" }),
    ]) {
      const voiceName = "voice" in voice ? voice.voice : voice.voicePath;
      expect(cacheKey(TEXT, voice)).toBe(legacyKey(TEXT, voice.provider, voiceName, voice.speed));
    }
  });

  it("produces different keys per language for the multilingual provider", () => {
    const english = resolveVoiceConfig({ provider: "chatterbox-multilingual", language: "en" });
    const dutch = resolveVoiceConfig({ provider: "chatterbox-multilingual", language: "nl" });

    expect(cacheKey(TEXT, english)).not.toBe(cacheKey(TEXT, dutch));
  });

  it("separates the two chatterbox checkpoints", () => {
    const turbo = resolveVoiceConfig({ provider: "chatterbox" });
    const multilingual = resolveVoiceConfig({ provider: "chatterbox-multilingual" });

    expect(cacheKey(TEXT, turbo)).not.toBe(cacheKey(TEXT, multilingual));
  });

  it("still varies by text and speed", () => {
    const voice = resolveVoiceConfig({ provider: "chatterbox-multilingual", language: "nl" });

    expect(cacheKey(TEXT, voice)).not.toBe(cacheKey("different text", voice));
    expect(cacheKey(TEXT, voice)).not.toBe(
      cacheKey(
        TEXT,
        resolveVoiceConfig({
          provider: "chatterbox-multilingual",
          language: "nl",
          speed: 1.25,
        }),
      ),
    );
  });
});
