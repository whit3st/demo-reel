import { z } from "zod";
import { voiceConfigSchema } from "./voice-config.js";
import { cursorPresets, motionPresets, typingPresets, timingPresets } from "./presets.js";

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

export const timingSchema = z.object({
  afterGotoDelayMs: z.number().int().min(0).describe("Wait time after navigation in ms"),
  endDelayMs: z.number().int().min(0).describe("Wait time at end of demo in ms"),
});

export const typingSchema = z.object({
  baseDelayMs: z.number().int().min(0).describe("Base delay between keystrokes in ms"),
  spaceDelayMs: z.number().int().min(0).describe("Additional delay for space key in ms"),
  punctuationDelayMs: z.number().int().min(0).describe("Additional delay for punctuation in ms"),
  enterDelayMs: z.number().int().min(0).describe("Additional delay for enter key in ms"),
});

export const selectorStrategySchema = z
  .enum(["testId", "id", "class", "href", "data-node-id", "custom"])
  .describe("Element selection strategy");

export const selectorSchema = z
  .object({
    strategy: selectorStrategySchema.describe("How to locate the element"),
    value: z.string().min(1).describe("Selector value (without # or . for id/class)"),
    index: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Index of element to select when multiple elements match (0-based)"),
  })
  .superRefine((value, ctx) => {
    if (value.strategy === "id" || value.strategy === "class") {
      if (value.value.startsWith("#") || value.value.startsWith(".")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Selector values must be raw names without "#" or "." when using id or class strategy.',
          path: ["value"],
        });
      }
    }
  });

export const stepDelaySchema = z.object({
  delayBeforeMs: z.number().int().min(0).optional().describe("Delay before step executes in ms"),
  delayAfterMs: z.number().int().min(0).optional().describe("Delay after step completes in ms"),
});

export const gotoStepSchema = z.object({
  action: z.literal("goto").describe("Navigate to URL"),
  url: z.string().url().describe("Target URL"),
  waitUntil: z
    .enum(["load", "domcontentloaded", "networkidle"])
    .optional()
    .describe("When to consider navigation complete"),
});

export const clickStepSchema = stepDelaySchema.extend({
  action: z.literal("click").describe("Click on element"),
  selector: selectorSchema.describe("Element to click"),
});

export const hoverStepSchema = stepDelaySchema.extend({
  action: z.literal("hover").describe("Hover over element"),
  selector: selectorSchema.describe("Element to hover"),
});

export const typeStepSchema = stepDelaySchema.extend({
  action: z.literal("type").describe("Type text into element"),
  selector: selectorSchema.describe("Input element to type into"),
  text: z.string().describe("Text to type"),
  delayMs: z.number().int().min(0).optional().describe("Delay between keystrokes in ms"),
  clear: z.boolean().optional().describe("Clear existing value before typing"),
});

export const pressStepSchema = stepDelaySchema.extend({
  action: z.literal("press").describe("Press a keyboard key"),
  selector: selectorSchema.describe("Element to focus before pressing"),
  key: z.string().min(1).describe('Key name (e.g., "Enter", "Tab", "Escape")'),
});

export const scrollStepSchema = stepDelaySchema.extend({
  action: z.literal("scroll").describe("Scroll element/window"),
  selector: selectorSchema.describe("Element or window to scroll"),
  x: z.number().int().describe("Horizontal scroll position"),
  y: z.number().int().describe("Vertical scroll position"),
});

export const selectStepSchema = stepDelaySchema.extend({
  action: z.literal("select").describe("Select option(s) in dropdown"),
  selector: selectorSchema.describe("Select element"),
  value: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe("Option value(s) to select"),
});

export const checkStepSchema = stepDelaySchema.extend({
  action: z.literal("check").describe("Check or uncheck checkbox"),
  selector: selectorSchema.describe("Checkbox element"),
  checked: z.boolean().describe("True to check, false to uncheck"),
});

export const uploadStepSchema = stepDelaySchema.extend({
  action: z.literal("upload").describe("Upload files"),
  selector: selectorSchema.describe("File input element"),
  filePath: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe("File path(s) to upload"),
});

export const dragStepSchema = stepDelaySchema.extend({
  action: z.literal("drag").describe("Drag element to target"),
  source: selectorSchema.describe("Element to drag"),
  target: selectorSchema.describe("Target element"),
});

export const waitStepSchema = z.object({
  action: z.literal("wait").describe("Wait for duration"),
  ms: z.number().int().min(0).describe("Duration to wait in ms"),
});

export const confirmStepSchema = z.object({
  action: z.literal("confirm").describe("Handle the next browser confirm/dialog"),
  accept: z.boolean().describe("True to accept the dialog, false to dismiss it"),
  timeoutMs: z.number().int().min(0).optional().describe("Timeout in ms (0 = no timeout)"),
});

export const waitForSelectorStepSchema = z.object({
  action: z.literal("waitFor").describe("Wait for element"),
  kind: z.literal("selector").describe("Wait for selector"),
  selector: selectorSchema.describe("Element to wait for"),
  state: z
    .enum(["attached", "detached", "visible", "hidden"])
    .optional()
    .describe("Expected element state"),
  timeoutMs: z.number().int().min(0).optional().describe("Timeout in ms (0 = no timeout)"),
});

export const waitForURLStepSchema = z.object({
  action: z.literal("waitFor").describe("Wait for URL"),
  kind: z.literal("url").describe("Wait for URL pattern"),
  url: z.union([z.string().url(), z.instanceof(RegExp)]).describe("URL pattern or regex to match"),
  waitUntil: z
    .enum(["load", "domcontentloaded", "networkidle"])
    .optional()
    .describe("When to consider navigation complete"),
  timeoutMs: z.number().int().min(0).optional().describe("Timeout in ms (0 = no timeout)"),
});

export const waitForLoadStateStepSchema = z.object({
  action: z.literal("waitFor").describe("Wait for load state"),
  kind: z.literal("loadState").describe("Wait for page load state"),
  state: z
    .enum(["load", "domcontentloaded", "networkidle"])
    .optional()
    .describe("Load state to wait for"),
  timeoutMs: z.number().int().min(0).optional().describe("Timeout in ms (0 = no timeout)"),
});

export const waitForRequestStepSchema = z.object({
  action: z.literal("waitFor").describe("Wait for network request"),
  kind: z.literal("request").describe("Wait for request"),
  url: z.union([z.string().min(1), z.instanceof(RegExp)]).describe("URL pattern or regex to match"),
  timeoutMs: z.number().int().min(0).optional().describe("Timeout in ms (0 = no timeout)"),
});

export const waitForResponseStepSchema = z.object({
  action: z.literal("waitFor").describe("Wait for network response"),
  kind: z.literal("response").describe("Wait for response"),
  url: z.union([z.string().min(1), z.instanceof(RegExp)]).describe("URL pattern or regex to match"),
  timeoutMs: z.number().int().min(0).optional().describe("Timeout in ms (0 = no timeout)"),
});

export const waitForFunctionStepSchema = z.object({
  action: z.literal("waitFor").describe("Wait for function"),
  kind: z.literal("function").describe("Wait for JS function to return truthy"),
  expression: z.string().min(1).describe("JavaScript expression to evaluate"),
  arg: z.unknown().optional().describe("Argument to pass to function"),
  polling: z
    .union([z.literal("raf"), z.number().int().positive()])
    .optional()
    .describe("Polling interval (raf = animation frames)"),
  timeoutMs: z.number().int().min(0).optional().describe("Timeout in ms (0 = no timeout)"),
});

export const waitForStepSchema = z.discriminatedUnion("kind", [
  waitForSelectorStepSchema,
  waitForURLStepSchema,
  waitForLoadStateStepSchema,
  waitForRequestStepSchema,
  waitForResponseStepSchema,
  waitForFunctionStepSchema,
]);

// Use regular union for waitFor variants since they share the same action value
const waitForStepUnion = z.union([
  waitForSelectorStepSchema,
  waitForURLStepSchema,
  waitForLoadStateStepSchema,
  waitForRequestStepSchema,
  waitForResponseStepSchema,
  waitForFunctionStepSchema,
]);

export const stepSchema = z
  .discriminatedUnion("action", [
    gotoStepSchema,
    clickStepSchema,
    hoverStepSchema,
    typeStepSchema,
    pressStepSchema,
    scrollStepSchema,
    selectStepSchema,
    checkStepSchema,
    uploadStepSchema,
    dragStepSchema,
    waitStepSchema,
    confirmStepSchema,
  ])
  .or(waitForStepUnion);

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

export const cursorPresetOrConfigSchema = z.union([cursorPresetSchema, cursorSchema]);
export const motionPresetOrConfigSchema = z.union([motionPresetSchema, motionSchema]);
export const typingPresetOrConfigSchema = z.union([typingPresetSchema, typingSchema]);
export const timingPresetOrConfigSchema = z.union([timingPresetSchema, timingSchema]);

function resolveCursor(val: z.infer<typeof cursorPresetOrConfigSchema>): CursorConfig {
  return typeof val === "string" ? cursorPresets[val as keyof typeof cursorPresets] : val;
}
function resolveMotion(val: z.infer<typeof motionPresetOrConfigSchema>): MotionConfig {
  return typeof val === "string" ? motionPresets[val as keyof typeof motionPresets] : val;
}
function resolveTyping(val: z.infer<typeof typingPresetOrConfigSchema>): TypingConfig {
  return typeof val === "string" ? typingPresets[val as keyof typeof typingPresets] : val;
}
function resolveTiming(val: z.infer<typeof timingPresetOrConfigSchema>): TimingConfig {
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

function resolveResolution(val: z.infer<typeof resolutionSchema>): z.infer<typeof sizeSchema> {
  return typeof val === "string" ? resolutionPresets[val] : val;
}

export const demoReelConfigInputSchema = z
  .object({
    video: videoConfigSchema.describe("Video recording settings"),
    cursor: cursorPresetOrConfigSchema.describe(
      "Cursor preset name or custom cursor configuration",
    ),
    motion: motionPresetOrConfigSchema.describe(
      "Motion preset name or custom motion configuration",
    ),
    typing: typingPresetOrConfigSchema.describe(
      "Typing preset name or custom typing configuration",
    ),
    timing: timingPresetOrConfigSchema.describe(
      "Timing preset name or custom timing configuration",
    ),
    steps: z.array(stepSchema).min(1).describe("Demo scenario steps to execute"),
    setup: z
      .array(stepSchema)
      .optional()
      .describe("Steps to run before recording (e.g., create tenant, navigate)"),
    cleanup: z
      .array(stepSchema)
      .optional()
      .describe("Steps to run after recording (e.g., delete tenant)"),
    // Aliases for backward compatibility
    preSteps: z.array(stepSchema).optional().describe("Alias for setup"),
    postSteps: z.array(stepSchema).optional().describe("Alias for cleanup"),
    name: z.string().min(1).optional().describe("Output file name without extension"),
    outputDir: z.string().min(1).optional().describe("Output directory for video files"),
    outputPath: z
      .string()
      .min(1)
      .optional()
      .describe("Full output file path (overrides name/outputDir)"),
    tags: z.array(z.string().min(1)).optional().describe("Tags for filtering scenarios"),
    outputFormat: outputFormatSchema
      .optional()
      .describe("Output file format (default: webm, or mp4 when audio is used)"),
    concurrency: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Number of videos to generate concurrently"),
    audio: audioConfigSchema.optional().describe("Audio/narration settings"),
    randomization: randomizationSchema.optional().describe("Randomization settings"),
    timestamp: z.boolean().optional().describe("Add timestamp to output filename"),
    auth: authConfigSchema.optional().describe("Authentication/session persistence settings"),
    voice: voiceConfigSchema
      .optional()
      .describe("Voice/TTS configuration for narration generation"),
    scenes: z
      .array(
        z.object({
          narration: z.string().describe("Voiceover narration text for this scene"),
          stepIndex: z.number().int().min(0).describe("Index of the first step in this scene"),
          isIntro: z.boolean().optional().describe("Whether this scene is the intro/context scene"),
        }),
      )
      .optional()
      .describe("Scene markers for timeline tracking and subtitle generation"),
  })
  .superRefine((value, ctx) => {
    if (value.outputFormat === "webm" && (value.audio?.narration || value.audio?.background)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Audio output requires outputFormat to be mp4",
        path: ["outputFormat"],
      });
    }
  });

export const demoReelConfigSchema = demoReelConfigInputSchema.transform((val) => ({
  ...val,
  video: {
    ...val.video,
    resolution: resolveResolution(val.video.resolution),
  },
  cursor: resolveCursor(val.cursor),
  motion: resolveMotion(val.motion),
  typing: resolveTyping(val.typing),
  timing: resolveTiming(val.timing),
  // Resolve setup/cleanup aliases
  preSteps: val.setup || val.preSteps,
  postSteps: val.cleanup || val.postSteps,
}));

export type CursorPresetOrConfig = z.infer<typeof cursorPresetOrConfigSchema>;
export type MotionPresetOrConfig = z.infer<typeof motionPresetOrConfigSchema>;
export type TypingPresetOrConfig = z.infer<typeof typingPresetOrConfigSchema>;
export type TimingPresetOrConfig = z.infer<typeof timingPresetOrConfigSchema>;
export type ResolutionPreset = z.infer<typeof resolutionPresetSchema>;
export type ResolutionConfig = z.infer<typeof resolutionSchema>;
export type RandomizationConfig = z.infer<typeof randomizationSchema>;
export type DemoReelConfigInput = z.infer<typeof demoReelConfigInputSchema>;

// Export types
export type SizeConfig = z.infer<typeof sizeSchema>;
export type CursorConfig = z.infer<typeof cursorSchema>;
export type MotionConfig = z.infer<typeof motionSchema>;
export type TimingConfig = z.infer<typeof timingSchema>;
export type TypingConfig = z.infer<typeof typingSchema>;
export type VideoConfig = z.infer<typeof videoConfigSchema>;
export type AudioConfig = z.infer<typeof audioConfigSchema>;
export type StorageType = z.infer<typeof storageTypeSchema>;
export type AuthStorageConfig = z.infer<typeof authStorageConfigSchema>;
export type AuthValidateConfig = z.infer<typeof authValidateConfigSchema>;
export type AuthBehaviorConfig = z.infer<typeof authBehaviorConfigSchema>;
export type AuthConfig = z.infer<typeof authConfigSchema>;
export type SelectorStrategy = z.infer<typeof selectorStrategySchema>;
export type SelectorConfig = z.infer<typeof selectorSchema>;
export type Step = z.infer<typeof stepSchema>;
export type DemoReelConfig = z.infer<typeof demoReelConfigSchema>;
