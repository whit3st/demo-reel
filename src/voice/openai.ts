import type { VoiceConfig } from "../voice-config.js";
import type { TTSProvider } from "./types.js";
import { measureAudioDuration } from "../ffmpeg/utils.js";

export const openaiProvider: TTSProvider = {
  name: "openai",
  generate: async (text, options) => {
    const openaiModule: any = await import("openai");
    const OpenAI = openaiModule.default;
    const client = new OpenAI();

    const response = await client.audio.speech.create({
      model: "tts-1",
      voice: (options as Extract<VoiceConfig, { provider: "openai" }>).voice as
        | "alloy"
        | "echo"
        | "fable"
        | "onyx"
        | "nova"
        | "shimmer",
      input: text,
      speed: options.speed,
      response_format: "mp3",
    });

    const arrayBuffer = await response.arrayBuffer();
    const audio = Buffer.from(arrayBuffer);
    const durationMs = await measureAudioDuration(audio);

    return { audio, durationMs };
  },
};
