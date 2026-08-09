import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { measureAudioDurationMock } = vi.hoisted(() => ({
  measureAudioDurationMock: vi.fn(),
}));

vi.mock("../src/ffmpeg/utils.js", () => ({ measureAudioDuration: measureAudioDurationMock }));

import { elevenlabsProvider } from "../src/voice/elevenlabs.js";

const options = { provider: "elevenlabs", voice: "", speed: 1.0 } as any;

const okResponse = () => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
});

describe("elevenlabsProvider", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const savedEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    measureAudioDurationMock.mockResolvedValue(2500);
    fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);
    delete process.env.ELEVENLABS_KEY;
    delete process.env.ELEVENLABS_API_KEY;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...savedEnv };
  });

  describe("API key resolution", () => {
    it("fails with an actionable message when no key is set", async () => {
      await expect(elevenlabsProvider.generate("hi", options)).rejects.toThrow(
        /Set ELEVENLABS_KEY or ELEVENLABS_API_KEY/,
      );
    });

    it("does not call the API without a key", async () => {
      await expect(elevenlabsProvider.generate("hi", options)).rejects.toThrow();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("uses ELEVENLABS_KEY when set", async () => {
      process.env.ELEVENLABS_KEY = "primary-key";

      await elevenlabsProvider.generate("hi", options);

      expect(fetchMock.mock.calls[0][1].headers["xi-api-key"]).toBe("primary-key");
    });

    it("falls back to ELEVENLABS_API_KEY", async () => {
      process.env.ELEVENLABS_API_KEY = "fallback-key";

      await elevenlabsProvider.generate("hi", options);

      expect(fetchMock.mock.calls[0][1].headers["xi-api-key"]).toBe("fallback-key");
    });

    it("prefers ELEVENLABS_KEY over ELEVENLABS_API_KEY", async () => {
      process.env.ELEVENLABS_KEY = "primary-key";
      process.env.ELEVENLABS_API_KEY = "fallback-key";

      await elevenlabsProvider.generate("hi", options);

      expect(fetchMock.mock.calls[0][1].headers["xi-api-key"]).toBe("primary-key");
    });
  });

  describe("request", () => {
    beforeEach(() => {
      process.env.ELEVENLABS_KEY = "k";
    });

    it("targets the configured voice id", async () => {
      await elevenlabsProvider.generate("hi", { ...options, voice: "my-voice-id" });

      expect(fetchMock.mock.calls[0][0]).toBe(
        "https://api.elevenlabs.io/v1/text-to-speech/my-voice-id",
      );
    });

    // An empty voice must not produce a request to ".../text-to-speech/", which
    // 404s with a confusing message rather than using the default voice.
    it("falls back to the default voice id when none is configured", async () => {
      await elevenlabsProvider.generate("hi", { ...options, voice: "" });

      expect(fetchMock.mock.calls[0][0]).toBe(
        "https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM",
      );
    });

    it("sends the text and speed in the body", async () => {
      await elevenlabsProvider.generate("hello world", { ...options, speed: 1.15 });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toMatchObject({
        text: "hello world",
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 1.15 },
      });
    });

    it("posts JSON", async () => {
      await elevenlabsProvider.generate("hi", options);

      const init = fetchMock.mock.calls[0][1];
      expect(init.method).toBe("POST");
      expect(init.headers["Content-Type"]).toBe("application/json");
    });
  });

  describe("response handling", () => {
    beforeEach(() => {
      process.env.ELEVENLABS_KEY = "k";
    });

    it("returns the audio buffer and its measured duration", async () => {
      const result = await elevenlabsProvider.generate("hi", options);

      expect(Buffer.isBuffer(result.audio)).toBe(true);
      expect(Array.from(result.audio)).toEqual([1, 2, 3]);
      expect(result.durationMs).toBe(2500);
    });

    // The status and body both matter: 401 vs 429 vs 422 need different fixes,
    // and the body carries ElevenLabs' explanation.
    it.each([
      [401, "invalid api key"],
      [429, "quota exceeded"],
      [422, "voice not found"],
    ])("surfaces HTTP %s with the response body", async (status, body) => {
      fetchMock.mockResolvedValue({ ok: false, status, text: async () => body });

      await expect(elevenlabsProvider.generate("hi", options)).rejects.toThrow(
        `ElevenLabs API error ${status}: ${body}`,
      );
    });

    it("does not try to measure audio for a failed request", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => "boom" });

      await expect(elevenlabsProvider.generate("hi", options)).rejects.toThrow();

      expect(measureAudioDurationMock).not.toHaveBeenCalled();
    });
  });
});
