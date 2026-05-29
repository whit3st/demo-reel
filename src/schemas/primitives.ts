import { z } from "zod";
import { cursorPresets, motionPresets, typingPresets, timingPresets } from "../presets.js";

export const sizeSchema = z.object({
  width: z.number().int().positive().describe("Width in pixels"),
  height: z.number().int().positive().describe("Height in pixels"),
});

export const resolutionPresetSchema = z
  .enum(["HD", "FHD", "2K", "4K"])
  .describe("Resolution preset: HD (1280x720), FHD (1920x1080), 2K (2560x1440), 4K (3840x2160)");

export const resolutionSchema = z
  .union([resolutionPresetSchema, sizeSchema])
  .describe("Resolution preset or custom size");

export const cursorPresetSchema = z
  .enum(["dot", "arrow", "none"])
  .describe(
    'Cursor preset: "dot" for colored dot cursor, "arrow" for classic arrow cursor, "none" for no cursor overlay',
  );
export const motionPresetSchema = z
  .enum(["smooth", "snappy", "instant"])
  .describe(
    'Motion preset: "smooth" for natural curved movement, "snappy" for faster direct movement, "instant" for teleporting (no animation)',
  );
export const typingPresetSchema = z
  .enum(["humanlike", "fast", "instant"])
  .describe(
    'Typing preset: "humanlike" for realistic variable delays, "fast" for quick natural typing, "instant" for no delay',
  );
export const timingPresetSchema = z
  .enum(["normal", "fast", "instant"])
  .describe(
    'Timing preset: "normal" for balanced delays, "fast" for reduced waits, "instant" for minimal delays',
  );

export const cursorBaseSchema = z.object({
  start: z
    .object({
      x: z.number().int().nonnegative().describe("Starting X coordinate"),
      y: z.number().int().nonnegative().describe("Starting Y coordinate"),
    })
    .describe("Initial cursor position on page"),
  persistPosition: z.boolean().describe("Keep cursor position between steps"),
  storageKey: z.string().min(1).optional().describe("Storage key for cursor position"),
});

export const cursorDotSchema = z.object({
  type: z.literal("dot").describe("Dot cursor type"),
  size: z.number().int().positive().describe("Dot size in pixels"),
  borderWidth: z.number().int().positive().describe("Border width in pixels"),
  borderColor: z.string().min(1).describe("Border color (CSS color)"),
  shadowColor: z.string().min(1).describe("Shadow color (CSS color)"),
});

export const cursorSvgSchema = z.object({
  type: z.literal("svg").describe("SVG cursor type"),
  svg: z.object({
    markup: z.string().min(1).describe("SVG markup string"),
    width: z.number().positive().describe("SVG width"),
    height: z.number().positive().describe("SVG height"),
    hotspot: z
      .object({
        x: z.number().min(0).describe("Hotspot X offset"),
        y: z.number().min(0).describe("Hotspot Y offset"),
      })
      .describe("Click hotspot position within SVG"),
  }),
});

export const cursorSchema = cursorBaseSchema.and(
  z.discriminatedUnion("type", [cursorDotSchema, cursorSvgSchema]),
);

export const motionSchema = z
  .object({
    moveDurationMs: z.number().int().positive().describe("Total duration of cursor movement in ms"),
    moveStepsMin: z.number().int().positive().describe("Minimum steps for cursor movement"),
    stepsPerPx: z.number().positive().describe("Steps per pixel (higher = smoother but slower)"),
    clickDelayMs: z.number().int().nonnegative().describe("Delay before/after click in ms"),
    curve: z
      .object({
        offsetRatio: z.number().min(0).max(1).describe("Random offset ratio for natural movement"),
        offsetMin: z.number().min(0).describe("Minimum random offset in pixels"),
        offsetMax: z.number().min(0).describe("Maximum random offset in pixels"),
        easing: z.enum(["easeInOutCubic"]).describe("Easing function for cursor movement"),
      })
      .describe("Bezier curve settings for natural cursor path"),
  })
  .refine((value) => value.curve.offsetMax >= value.curve.offsetMin, {
    message: "curve.offsetMax must be greater than or equal to curve.offsetMin",
  });

export const narrationSyncModeSchema = z
  .enum(["auto", "strict", "off"])
  .describe(
    'Narration sync mode: "auto" pads steps to prevent overlap, "strict" fails on overlap, "off" disables sync',
  );

export const timingSchema = z.object({
  afterGotoDelayMs: z.number().int().min(0).describe("Wait time after navigation in ms"),
  endDelayMs: z.number().int().min(0).describe("Wait time at end of demo in ms"),
  narrationSyncMode: narrationSyncModeSchema
    .optional()
    .default("auto")
    .describe("How to handle narration/visual timing overlaps"),
  narrationGapMs: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(300)
    .describe("Minimum silence gap between narration clips in ms"),
  maxAutoPadMs: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(5000)
    .describe("Maximum padding to add per scene in auto mode (warns if exceeded)"),
  maxSyncPasses: z
    .number()
    .int()
    .min(1)
    .optional()
    .default(2)
    .describe("Maximum correction passes for auto-sync (1 = pre-record only)"),
});

export const typingSchema = z.object({
  baseDelayMs: z.number().int().min(0).describe("Base delay between keystrokes in ms"),
  spaceDelayMs: z.number().int().min(0).describe("Additional delay for space key in ms"),
  punctuationDelayMs: z.number().int().min(0).describe("Additional delay for punctuation in ms"),
  enterDelayMs: z.number().int().min(0).describe("Additional delay for enter key in ms"),
});

export const cursorPresetOrConfigSchema = z.union([cursorPresetSchema, cursorSchema]);
export const motionPresetOrConfigSchema = z.union([motionPresetSchema, motionSchema]);
export const typingPresetOrConfigSchema = z.union([typingPresetSchema, typingSchema]);
export const timingPresetOrConfigSchema = z.union([timingPresetSchema, timingSchema]);

export type CursorConfig = z.infer<typeof cursorSchema>;
export type MotionConfig = z.infer<typeof motionSchema>;
export type TypingConfig = z.infer<typeof typingSchema>;
export type TimingConfig = z.infer<typeof timingSchema>;

export function resolveCursor(val: z.infer<typeof cursorPresetOrConfigSchema>): CursorConfig {
  return typeof val === "string" ? cursorPresets[val as keyof typeof cursorPresets] : val;
}
export function resolveMotion(val: z.infer<typeof motionPresetOrConfigSchema>): MotionConfig {
  return typeof val === "string" ? motionPresets[val as keyof typeof motionPresets] : val;
}
export function resolveTyping(val: z.infer<typeof typingPresetOrConfigSchema>): TypingConfig {
  return typeof val === "string" ? typingPresets[val as keyof typeof typingPresets] : val;
}
export function resolveTiming(val: z.infer<typeof timingPresetOrConfigSchema>): TimingConfig {
  return typeof val === "string" ? timingPresets[val as keyof typeof timingPresets] : val;
}

const resolutionPresets: Record<
  z.infer<typeof resolutionPresetSchema>,
  z.infer<typeof sizeSchema>
> = {
  HD: { width: 1280, height: 720 },
  FHD: { width: 1920, height: 1080 },
  "2K": { width: 2560, height: 1440 },
  "4K": { width: 3840, height: 2160 },
};

export function resolveResolution(
  val: z.infer<typeof resolutionSchema>,
): z.infer<typeof sizeSchema> {
  return typeof val === "string" ? resolutionPresets[val] : val;
}

export type CursorPresetOrConfig = z.infer<typeof cursorPresetOrConfigSchema>;
export type MotionPresetOrConfig = z.infer<typeof motionPresetOrConfigSchema>;
export type TypingPresetOrConfig = z.infer<typeof typingPresetOrConfigSchema>;
export type TimingPresetOrConfig = z.infer<typeof timingPresetOrConfigSchema>;
export type ResolutionPreset = z.infer<typeof resolutionPresetSchema>;
export type ResolutionConfig = z.infer<typeof resolutionSchema>;
export type SizeConfig = z.infer<typeof sizeSchema>;
export type NarrationSyncMode = z.infer<typeof narrationSyncModeSchema>;
