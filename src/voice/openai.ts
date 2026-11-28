import type { VoiceConfig } from "../voice-config.js";
import type { TTSProvider } from "./types.js";
import { measureAudioDuration } from "../ffmpeg/utils.js";

/**
 * The slice of the optional `openai` peer this provider uses. Declaring it
 * keeps the unchecked module boundary here instead of casting the client and
 * every request field through `any`.
 */
interface OpenAISpeechResponse {
  arrayBuffer(): Promise<ArrayBuffer>;
}

interface OpenAIClient {
  audio: {
    speech: {
      create(input: {
        model: string;
        voice: string;
        input: string;
        speed: number;
        response_format: string;
      }): Promise<OpenAISpeechResponse>;
    };
  };
}
interface OpenAIModule {
  default: new () => OpenAIClient;
}

export const openaiProvider: TTSProvider = {
  name: "openai",
  generate: async (text, options) => {
    const openaiModule = (await import("openai")) as unknown as OpenAIModule;
    const OpenAI = openaiModule.default;
    const client = new OpenAI();

    const response = await client.audio.speech.create({
      model: "tts-1",
      voice: (options as Extract<VoiceConfig, { provider: "openai" }>).voice,
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
