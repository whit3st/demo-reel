import { z } from "zod";

export const PIPER_VOICES = ["nl_NL-mls-medium", "en_US-amy-medium"] as const;
export const OPENAI_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
export const ELEVENLABS_VOICES = [
  "21m00Tcm4TlvDq8ikWAM",
  "5zhopMftSdRGaPYVcwKK",
  "CwhRBWXzGAHq8TQ4Fs17",
] as const;

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
      voice: z
        .enum(PIPER_VOICES)
        .default("nl_NL-mls-medium")
        .describe("Built-in Piper voice model"),
      speed: speedSchema,
      pronunciation: pronunciationSchema,
    }),
  ])
  .describe("Piper voice configuration");

export const openaiVoiceConfigSchema = z
  .object({
    provider: z.literal("openai").describe("TTS provider (OpenAI cloud voices)"),
    voice: z.enum(OPENAI_VOICES).default("alloy").describe("OpenAI voice name"),
    speed: speedSchema,
    pronunciation: pronunciationSchema,
  })
  .describe("OpenAI voice configuration");

export const elevenLabsVoiceConfigSchema = z
  .object({
    provider: z.literal("elevenlabs").describe("TTS provider (ElevenLabs cloud voices)"),
    voice: z
      .enum(ELEVENLABS_VOICES)
      .default("21m00Tcm4TlvDq8ikWAM")
      .describe("Curated ElevenLabs voice ID"),
    speed: speedSchema,
    pronunciation: pronunciationSchema,
  })
  .describe("ElevenLabs voice configuration");

export const voiceConfigSchema = z
  .union([piperVoiceConfigSchema, openaiVoiceConfigSchema, elevenLabsVoiceConfigSchema])
  .default({ provider: "piper", voice: "nl_NL-mls-medium", speed: 1.0 });

export type PiperVoiceName = (typeof PIPER_VOICES)[number];
export type OpenAIVoiceName = (typeof OPENAI_VOICES)[number];
export type ElevenLabsVoiceName = (typeof ELEVENLABS_VOICES)[number];
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
