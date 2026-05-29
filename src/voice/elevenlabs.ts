import type { VoiceConfig } from "../voice-config.js";
import type { TTSProvider } from "./types.js";
import { measureAudioDuration } from "../ffmpeg/utils.js";

export const elevenlabsProvider: TTSProvider = {
  name: "elevenlabs",
  generate: async (text, options) => {
    const apiKey = process.env.ELEVENLABS_KEY || process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ElevenLabs API key not found. Set ELEVENLABS_KEY or ELEVENLABS_API_KEY env var.",
      );
    }

    const voiceId =
      (options as Extract<VoiceConfig, { provider: "elevenlabs" }>).voice || "21m00Tcm4TlvDq8ikWAM";

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          speed: options.speed,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`ElevenLabs API error ${response.status}: ${body}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const audio = Buffer.from(arrayBuffer);
    const durationMs = await measureAudioDuration(audio);

    return { audio, durationMs };
  },
};
