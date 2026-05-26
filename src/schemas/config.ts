import { z } from "zod";
import { resolutionSchema } from "./primitives.js";
import { selectorSchema } from "./selector.js";
import { stepSchema } from "./steps.js";

export const videoConfigSchema = z.object({
  resolution: resolutionSchema.describe("Video resolution (also sets viewport)"),
});

export const outputFormatSchema = z.enum(["webm", "mp4"]).describe("Output file format");

export const randomizationSchema = z
  .object({
    seed: z
      .union([z.string().min(1), z.number().int()])
      .optional()
      .describe("Seed for deterministic randomization"),
  })
  .describe("Randomization settings");

export const audioConfigSchema = z.object({
  narration: z.string().min(1).optional().describe("Path to narration MP3 file"),
  narrationManifest: z
    .string()
    .min(1)
    .optional()
    .describe("Path to per-scene narration manifest JSON for exact scene-based placement"),
  narrationDelay: z.number().min(0).optional().describe("Delay before narration starts in ms"),
  background: z.string().min(1).optional().describe("Path to background music MP3 file"),
  backgroundVolume: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Background music volume (0.0 to 1.0)"),
});

export const storageTypeSchema = z
  .enum(["cookies", "localStorage"])
  .describe("Browser storage type");

export const authStorageConfigSchema = z.object({
  name: z.string().min(1).describe("Session identifier name"),
  types: z.array(storageTypeSchema).min(1).describe("Storage types to persist"),
  file: z.string().min(1).optional().describe("Custom file path for session storage"),
});

export const authValidateConfigSchema = z.object({
  protectedUrl: z.string().url().describe("URL to test session validity"),
  successIndicator: selectorSchema.describe("Element that appears when session is valid"),
});

export const authBehaviorConfigSchema = z.object({
  autoReauth: z.boolean().optional().describe("Automatically re-login on 401"),
  forceReauth: z.boolean().optional().describe("Force fresh login, ignore saved session"),
  clearInvalid: z.boolean().optional().describe("Delete saved session when invalid"),
});

export const authConfigSchema = z.object({
  loginSteps: z.array(stepSchema).min(1).describe("Steps to perform login"),
  validate: authValidateConfigSchema.describe("Session validation settings"),
  storage: authStorageConfigSchema.describe("Session persistence settings"),
  behavior: authBehaviorConfigSchema.optional().describe("Authentication behavior options"),
});

export type VideoConfig = z.infer<typeof videoConfigSchema>;
export type AudioConfig = z.infer<typeof audioConfigSchema>;
export type RandomizationConfig = z.infer<typeof randomizationSchema>;
export type StorageType = z.infer<typeof storageTypeSchema>;
export type AuthStorageConfig = z.infer<typeof authStorageConfigSchema>;
export type AuthValidateConfig = z.infer<typeof authValidateConfigSchema>;
export type AuthBehaviorConfig = z.infer<typeof authBehaviorConfigSchema>;
export type AuthConfig = z.infer<typeof authConfigSchema>;
