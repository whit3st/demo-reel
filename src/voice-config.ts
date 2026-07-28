import { z } from "zod";

const pronunciationSchema = z
  .record(z.string(), z.string())
  .optional()
  .describe(
    "Word replacements for pronunciation (e.g. { 'template': 'templayt', 'editor': 'èditor' })",
  );

const speedSchema = z.number().min(0.5).max(2.0).default(1.0).describe("Speech speed multiplier");

export const piperVoiceConfigSchema = z
  .union([
    // voicePath schema must come first - it has no defaults, so Zod will try it first
    z.object({
      provider: z.literal("piper").default("piper").describe("TTS provider (piper = local/free)"),
      voicePath: z
        .string()
        .min(1)
        .describe("Absolute path or .onnx path to a custom Piper voice model"),
      speed: speedSchema,
      pronunciation: pronunciationSchema,
    }),
    // voice schema has defaults, so it will match if voicePath is not present
    z.object({
      provider: z.literal("piper").default("piper").describe("TTS provider (piper = local/free)"),
      voice: z.string().default("nl_NL-mls-medium").describe("Piper voice model name"),
      speed: speedSchema,
      pronunciation: pronunciationSchema,
    }),
  ])
  .describe("Piper voice configuration");

export const chatterboxVoiceConfigSchema = z
  .union([
    // voicePath schema must come first - it has no defaults, so Zod will try it first
    z.object({
      provider: z
        .literal("chatterbox")
        .default("chatterbox")
        .describe("TTS provider (chatterbox = local/free, highest quality)"),
      voicePath: z
        .string()
        .min(1)
        .describe("Path to a 7-15s reference clip to clone the voice from"),
      speed: speedSchema,
      pronunciation: pronunciationSchema,
    }),
    z.object({
      provider: z
        .literal("chatterbox")
        .default("chatterbox")
        .describe("TTS provider (chatterbox = local/free, highest quality)"),
      voice: z.string().default("default").describe("Built-in Chatterbox voice"),
      speed: speedSchema,
      pronunciation: pronunciationSchema,
    }),
  ])
  .describe("Chatterbox voice configuration");

export const CHATTERBOX_LANGUAGES = [
  "ar",
  "da",
  "de",
  "el",
  "en",
  "es",
  "fi",
  "fr",
  "he",
  "hi",
  "it",
  "ja",
  "ko",
  "ms",
  "nl",
  "no",
  "pl",
  "pt",
  "ru",
  "sv",
  "sw",
  "tr",
  "zh",
] as const;

const chatterboxLanguageSchema = z
  .enum(CHATTERBOX_LANGUAGES)
  .default("en")
  .describe("Language of the narration text");

export const chatterboxMultilingualVoiceConfigSchema = z
  .union([
    // voicePath schema must come first - it has no defaults, so Zod will try it first
    z.object({
      provider: z
        .literal("chatterbox-multilingual")
        .default("chatterbox-multilingual")
        .describe("TTS provider (chatterbox-multilingual = local/free, 23 languages)"),
      voicePath: z
        .string()
        .min(1)
        .describe("Path to a 7-15s reference clip to clone the voice from"),
      language: chatterboxLanguageSchema,
      speed: speedSchema,
      pronunciation: pronunciationSchema,
    }),
    z.object({
      provider: z
        .literal("chatterbox-multilingual")
        .default("chatterbox-multilingual")
        .describe("TTS provider (chatterbox-multilingual = local/free, 23 languages)"),
      voice: z.string().default("default").describe("Built-in Chatterbox voice"),
      language: chatterboxLanguageSchema,
      speed: speedSchema,
      pronunciation: pronunciationSchema,
    }),
  ])
  .describe("Chatterbox multilingual voice configuration");

export const openaiVoiceConfigSchema = z
  .object({
    provider: z.literal("openai").describe("TTS provider (OpenAI cloud voices)"),
    voice: z.string().default("alloy").describe("OpenAI voice name"),
    speed: speedSchema,
    pronunciation: pronunciationSchema,
  })
  .describe("OpenAI voice configuration");

export const elevenLabsVoiceConfigSchema = z
  .object({
    provider: z.literal("elevenlabs").describe("TTS provider (ElevenLabs cloud voices)"),
    voice: z.string().default("21m00Tcm4TlvDq8ikWAM").describe("Curated ElevenLabs voice ID"),
    speed: speedSchema,
    pronunciation: pronunciationSchema,
  })
  .describe("ElevenLabs voice configuration");

export const voiceConfigSchema = z
  .union([
    piperVoiceConfigSchema,
    chatterboxVoiceConfigSchema,
    chatterboxMultilingualVoiceConfigSchema,
    openaiVoiceConfigSchema,
    elevenLabsVoiceConfigSchema,
  ])
  .default({ provider: "piper", voice: "nl_NL-mls-medium", speed: 1.0 });

export type VoiceConfig = z.infer<typeof voiceConfigSchema>;

export const DEFAULT_VOICE_CONFIG = {
  provider: "piper",
  voice: "nl_NL-mls-medium",
  speed: 1.0,
} as const satisfies Extract<VoiceConfig, { provider: "piper" }>;

export interface VoiceConfigOverrides {
  provider?: VoiceConfig["provider"];
  voice?: string;
  voicePath?: string;
  language?: string;
  speed?: number;
  pronunciation?: Record<string, string>;
}

function looksLikePiperVoicePath(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  return value.startsWith("/") || value.includes(".onnx");
}

export function resolveVoiceConfig(overrides: VoiceConfigOverrides = {}): VoiceConfig {
  const provider = overrides.provider ?? DEFAULT_VOICE_CONFIG.provider;
  const speed = overrides.speed ?? DEFAULT_VOICE_CONFIG.speed;
  const pronunciation = overrides.pronunciation;

  if (provider === "piper") {
    if (overrides.voicePath || looksLikePiperVoicePath(overrides.voice)) {
      return piperVoiceConfigSchema.parse({
        provider,
        voicePath: overrides.voicePath ?? overrides.voice,
        speed,
        pronunciation,
      });
    }

    return piperVoiceConfigSchema.parse({
      provider,
      voice: overrides.voice ?? DEFAULT_VOICE_CONFIG.voice,
      speed,
      pronunciation,
    });
  }

  if (provider === "chatterbox") {
    if (overrides.voicePath) {
      return chatterboxVoiceConfigSchema.parse({
        provider,
        voicePath: overrides.voicePath,
        speed,
        pronunciation,
      });
    }

    return chatterboxVoiceConfigSchema.parse({
      provider,
      voice: overrides.voice ?? "default",
      speed,
      pronunciation,
    });
  }

  if (provider === "chatterbox-multilingual") {
    const language = overrides.language ?? "en";
    if (overrides.voicePath) {
      return chatterboxMultilingualVoiceConfigSchema.parse({
        provider,
        voicePath: overrides.voicePath,
        language,
        speed,
        pronunciation,
      });
    }

    return chatterboxMultilingualVoiceConfigSchema.parse({
      provider,
      voice: overrides.voice ?? "default",
      language,
      speed,
      pronunciation,
    });
  }

  if (provider === "openai") {
    return openaiVoiceConfigSchema.parse({
      provider,
      voice: overrides.voice ?? "alloy",
      speed,
      pronunciation,
    });
  }

  return elevenLabsVoiceConfigSchema.parse({
    provider,
    voice: overrides.voice ?? "21m00Tcm4TlvDq8ikWAM",
    speed,
    pronunciation,
  });
}

export function getVoiceName(config: VoiceConfig): string {
  return "voice" in config ? config.voice : config.voicePath;
}
