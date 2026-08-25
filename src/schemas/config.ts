import { z } from "zod";
import { resolutionSchema } from "./primitives.js";
import { selectorSchema } from "./selector.js";
import { stepSchema } from "./steps.js";

export const videoSpanSchema = z
  .enum(["scenes", "session"])
  .describe(
    "Which part of the browser session becomes the video: 'scenes' (default) " +
      "trims to the span the scenes occupy; 'session' keeps everything the " +
      "recorder captured, including the navigation and app load that precede " +
      "the first scene and the teardown after the last",
  );

export const zoomModeSchema = z
  .enum(["off", "manual", "auto"])
  .describe(
    "Camera trigger policy: 'off' records unzoomed, 'manual' responds only to " +
      "explicit zoom steps, 'auto' additionally eases onto every interaction target",
  );

export const zoomConfigSchema = z.object({
  mode: zoomModeSchema.default("off"),
  percent: z
    .number()
    .min(100)
    .max(400)
    .default(150)
    .describe("Zoom level when engaged; 100 leaves the frame unzoomed"),
  deadZone: z
    .number()
    .min(0)
    .max(1)
    .default(0.3)
    .describe(
      "Fraction of the viewport the pointer may cross without the camera " +
        "panning — the frame rests while the cursor roams inside this box",
    ),
  leadMs: z
    .number()
    .int()
    .min(0)
    .default(250)
    .describe("Eased zoom-in duration before an auto-triggered interaction"),
  settleMs: z
    .number()
    .int()
    .min(0)
    .default(600)
    .describe("How long the camera holds on a target after its action before easing back out"),
});

export const videoConfigSchema = z.object({
  resolution: resolutionSchema.describe("Video resolution (also sets viewport)"),
  // Expressed as a policy rather than a duration on purpose: the pre-roll is an
  // app cold start and is not stable. Over 15 consecutive runs of one real app
  // it ranged from 3.7s to 9.5s, so no number written in a config file could be
  // right twice. The pipeline measures it per run instead.
  span: videoSpanSchema.default("scenes"),
  zoom: zoomConfigSchema
    .optional()
    .describe("Camera behaviour: zoom percentage and mouse following"),
});

export type ZoomMode = z.infer<typeof zoomModeSchema>;
export type ZoomSettings = z.infer<typeof zoomConfigSchema>;
export type ZoomOverride = Partial<ZoomSettings>;

/**
 * A scene-level camera override stays sparse on purpose: `.partial()` on
 * zoomConfigSchema would still fire each field's default, turning "override
 * two fields" into "restate all five" and burying which fields the author
 * actually chose. Plain optionals keep the merge honest.
 */
export const zoomOverrideSchema = z.object({
  mode: zoomModeSchema.optional(),
  percent: z.number().min(100).max(400).optional(),
  deadZone: z.number().min(0).max(1).optional(),
  leadMs: z.number().int().min(0).optional(),
  settleMs: z.number().int().min(0).optional(),
});

const ZOOM_DEFAULTS: ZoomSettings = {
  mode: "off",
  percent: 150,
  deadZone: 0.3,
  leadMs: 250,
  settleMs: 600,
};

/**
 * Layered resolution: global `video.zoom` defaults ← scene override ← step
 * parameters all funnel through here, so one merge defines precedence for
 * every layer.
 */
export function resolveZoom(...layers: Array<ZoomOverride | undefined>): ZoomSettings {
  let resolved: ZoomSettings = { ...ZOOM_DEFAULTS };
  for (const layer of layers) {
    if (!layer) continue;
    resolved = { ...resolved, ...layer };
  }
  return resolved;
}

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
