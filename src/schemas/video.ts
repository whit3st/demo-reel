import { z } from "zod";
import { voiceConfigSchema } from "../voice-config.js";
import { cursorPresets, motionPresets, timingPresets, typingPresets } from "../presets.js";
import {
  resolutionSchema,
  sharedConfigSchema,
  stepSchema,
  type SizeConfig,
  type Step,
  type RuntimeScene,
} from "./shared.js";

export const cursorPresetSchema = z.enum(["dot", "arrow", "none"]);
export const motionPresetSchema = z.enum(["smooth", "snappy", "instant"]);
export const typingPresetSchema = z.enum(["humanlike", "fast", "instant"]);
export const timingPresetSchema = z.enum(["normal", "fast", "instant"]);

export const cursorBaseSchema = z.object({
  start: z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative() }),
  persistPosition: z.boolean(),
  storageKey: z.string().min(1).optional(),
});

export const cursorDotSchema = z.object({
  type: z.literal("dot"),
  size: z.number().int().nonnegative(),
  borderWidth: z.number().int().nonnegative(),
  borderColor: z.string().min(1),
  shadowColor: z.string().min(1),
});

export const cursorSvgSchema = z.object({
  type: z.literal("svg"),
  svg: z.object({
    markup: z.string().min(1),
    width: z.number().positive(),
    height: z.number().positive(),
    hotspot: z.object({ x: z.number().min(0), y: z.number().min(0) }),
  }),
});

export const cursorSchema = cursorBaseSchema.and(z.discriminatedUnion("type", [cursorDotSchema, cursorSvgSchema]));

export const motionSchema = z
  .object({
    moveDurationMs: z.number().int().nonnegative(),
    moveStepsMin: z.number().int().positive(),
    stepsPerPx: z.number().positive(),
    clickDelayMs: z.number().int().nonnegative(),
    curve: z.object({
      offsetRatio: z.number().min(0).max(1),
      offsetMin: z.number().min(0),
      offsetMax: z.number().min(0),
      easing: z.enum(["easeInOutCubic"]),
    }),
  })
  .refine((value) => value.curve.offsetMax >= value.curve.offsetMin, {
    message: "curve.offsetMax must be greater than or equal to curve.offsetMin",
  });

export const narrationSyncModeSchema = z.enum(["auto", "strict", "off"]);

export const timingSchema = z.object({
  afterGotoDelayMs: z.number().int().min(0),
  endDelayMs: z.number().int().min(0),
  narrationSyncMode: narrationSyncModeSchema.optional().default("auto"),
  narrationGapMs: z.number().int().min(0).optional().default(300),
  maxAutoPadMs: z.number().int().min(0).optional().default(5000),
  maxSyncPasses: z.number().int().min(1).optional().default(2),
});

export const typingSchema = z.object({
  baseDelayMs: z.number().int().min(0),
  spaceDelayMs: z.number().int().min(0),
  punctuationDelayMs: z.number().int().min(0),
  enterDelayMs: z.number().int().min(0),
});

export const videoConfigSchema = z.object({
  resolution: resolutionSchema,
});

export const outputFormatSchema = z.enum(["webm", "mp4"]);

export const audioConfigSchema = z.object({
  narration: z.string().min(1).optional(),
  narrationManifest: z.string().min(1).optional(),
  narrationDelay: z.number().min(0).optional(),
  background: z.string().min(1).optional(),
  backgroundVolume: z.number().min(0).max(1).optional(),
});

const legacySceneInputSchema = z.object({
  narration: z.string(),
  stepIndex: z.number().int().min(0),
  isIntro: z.boolean().optional(),
});

const sceneOwnedSceneInputSchema = z.object({
  narration: z.string(),
  steps: z.array(stepSchema).min(1),
  isIntro: z.boolean().optional(),
});

export const videoConfigInputSchema = sharedConfigSchema
  .extend({
    mode: z.literal("video"),
    video: videoConfigSchema,
    cursor: z.union([cursorPresetSchema, cursorSchema]),
    motion: z.union([motionPresetSchema, motionSchema]),
    typing: z.union([typingPresetSchema, typingSchema]),
    timing: z.union([timingPresetSchema, timingSchema]),
    outputFormat: outputFormatSchema.optional(),
    concurrency: z.number().int().min(1).optional(),
    audio: audioConfigSchema.optional(),
    voice: voiceConfigSchema.optional(),
    scenes: z.array(z.union([legacySceneInputSchema, sceneOwnedSceneInputSchema])).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.outputFormat === "webm" && (value.audio?.narration || value.audio?.background)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Audio output requires outputFormat to be mp4",
        path: ["outputFormat"],
      });
    }

    const hasTopLevelSteps = value.steps !== undefined && value.steps.length > 0;
    const hasScenes = value.scenes !== undefined && value.scenes.length > 0;
    if (!hasTopLevelSteps && !hasScenes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Config must have either top-level steps or scenes with steps",
        path: ["steps"],
      });
      return;
    }
    if (!hasScenes) {
      return;
    }

    const firstScene = value.scenes![0];
    const isSceneOwned = "steps" in firstScene;

    for (let i = 0; i < value.scenes!.length; i++) {
      const scene = value.scenes![i];
      const sceneIsOwned = "steps" in scene;
      if (sceneIsOwned !== isSceneOwned) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "All scenes must use the same format (either all stepIndex or all steps).",
          path: ["scenes", i],
        });
      }
    }

    if (isSceneOwned && hasTopLevelSteps) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cannot use top-level steps with scene-owned steps. Use one or the other.",
        path: ["steps"],
      });
      return;
    }

    if (!isSceneOwned) {
      const legacyScenes = value.scenes as z.infer<typeof legacySceneInputSchema>[];
      const stepIndices = legacyScenes.map((scene) => scene.stepIndex);

      for (let i = 1; i < stepIndices.length; i++) {
        if (stepIndices[i] <= stepIndices[i - 1]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Scene stepIndex values must be strictly increasing. Found ${stepIndices[i - 1]} followed by ${stepIndices[i]}`,
            path: ["scenes", i, "stepIndex"],
          });
        }
      }

      if (hasTopLevelSteps && value.steps) {
        const maxStepIndex = Math.max(...stepIndices);
        if (maxStepIndex >= value.steps.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Scene stepIndex ${maxStepIndex} exceeds top-level steps length ${value.steps.length}`,
            path: ["scenes"],
          });
        }
      }
    }
  });

function resolveCursor(val: z.infer<typeof videoConfigInputSchema>["cursor"]): CursorConfig {
  return typeof val === "string" ? cursorPresets[val as keyof typeof cursorPresets] : val;
}
function resolveMotion(val: z.infer<typeof videoConfigInputSchema>["motion"]): MotionConfig {
  return typeof val === "string" ? motionPresets[val as keyof typeof motionPresets] : val;
}
function resolveTyping(val: z.infer<typeof videoConfigInputSchema>["typing"]): TypingConfig {
  return typeof val === "string" ? typingPresets[val as keyof typeof typingPresets] : val;
}
function resolveTiming(val: z.infer<typeof videoConfigInputSchema>["timing"]): TimingConfig {
  return typeof val === "string" ? timingPresets[val as keyof typeof timingPresets] : val;
}

const resolutionPresets = {
  HD: { width: 1280, height: 720 },
  FHD: { width: 1920, height: 1080 },
  "2K": { width: 2560, height: 1440 },
  "4K": { width: 3840, height: 2160 },
} as const;

function resolveResolution(val: z.infer<typeof resolutionSchema>): SizeConfig {
  return typeof val === "string" ? resolutionPresets[val] : val;
}

export type DemoReelVideoConfigInput = z.infer<typeof videoConfigInputSchema>;

export interface DemoReelVideoConfig
  extends Omit<DemoReelVideoConfigInput, "steps" | "scenes" | "video" | "cursor" | "motion" | "typing" | "timing"> {
  mode: "video";
  steps: Step[];
  scenes?: RuntimeScene[];
  video: { resolution: SizeConfig };
  cursor: CursorConfig;
  motion: MotionConfig;
  typing: TypingConfig;
  timing: TimingConfig;
}

export const demoReelVideoConfigSchema = videoConfigInputSchema.transform((val): DemoReelVideoConfig => {
  let normalizedSteps = val.steps;
  let normalizedScenes = val.scenes;

  if (val.scenes && val.scenes.length > 0 && "steps" in val.scenes[0]) {
    const sceneOwnedScenes = val.scenes as z.infer<typeof sceneOwnedSceneInputSchema>[];
    const flattenedSteps: Step[] = [];
    const runtimeScenes: RuntimeScene[] = [];
    let stepIndex = 0;

    for (const scene of sceneOwnedScenes) {
      runtimeScenes.push({ narration: scene.narration, stepIndex, isIntro: scene.isIntro });
      flattenedSteps.push(...scene.steps);
      stepIndex += scene.steps.length;
    }

    normalizedSteps = flattenedSteps;
    normalizedScenes = runtimeScenes;
  }

  return {
    ...val,
    mode: "video",
    steps: normalizedSteps!,
    scenes: normalizedScenes as RuntimeScene[] | undefined,
    video: { ...val.video, resolution: resolveResolution(val.video.resolution) },
    cursor: resolveCursor(val.cursor),
    motion: resolveMotion(val.motion),
    typing: resolveTyping(val.typing),
    timing: resolveTiming(val.timing),
  };
});

export type CursorPresetOrConfig = z.infer<typeof videoConfigInputSchema>["cursor"];
export type MotionPresetOrConfig = z.infer<typeof videoConfigInputSchema>["motion"];
export type TypingPresetOrConfig = z.infer<typeof videoConfigInputSchema>["typing"];
export type TimingPresetOrConfig = z.infer<typeof videoConfigInputSchema>["timing"];
export type CursorConfig = z.infer<typeof cursorSchema>;
export type MotionConfig = z.infer<typeof motionSchema>;
export type TimingConfig = z.infer<typeof timingSchema>;
export type TypingConfig = z.infer<typeof typingSchema>;
export type VideoConfig = z.infer<typeof videoConfigSchema>;
export type AudioConfig = z.infer<typeof audioConfigSchema>;
export type NarrationSyncMode = z.infer<typeof narrationSyncModeSchema>;
