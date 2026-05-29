import { z } from "zod";
import { voiceConfigSchema } from "../voice-config.js";
import {
  cursorPresetOrConfigSchema,
  motionPresetOrConfigSchema,
  typingPresetOrConfigSchema,
  timingPresetOrConfigSchema,
} from "./primitives.js";
import { stepSchema } from "./steps.js";
import {
  videoConfigSchema,
  outputFormatSchema,
  audioConfigSchema,
  randomizationSchema,
  authConfigSchema,
} from "./config.js";

export const legacySceneInputSchema = z.object({
  narration: z.string().describe("Voiceover narration text for this scene"),
  stepIndex: z.number().int().min(0).describe("Index of the first step in this scene"),
  isIntro: z.boolean().optional().describe("Whether this scene is the intro/context scene"),
});

export const sceneOwnedSceneInputSchema = z.object({
  narration: z.string().describe("Voiceover narration text for this scene"),
  steps: z.array(stepSchema).min(1).describe("Steps belonging to this scene"),
  isIntro: z.boolean().optional().describe("Whether this scene is the intro/context scene"),
});

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
    steps: z
      .array(stepSchema)
      .min(1)
      .optional()
      .describe("Demo scenario steps to execute (required in legacy mode)"),
    setup: z
      .array(stepSchema)
      .optional()
      .describe("Steps to run before recording (e.g., create tenant, navigate)"),
    cleanup: z
      .array(stepSchema)
      .optional()
      .describe("Steps to run after recording (e.g., delete tenant)"),
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
      .array(z.union([legacySceneInputSchema, sceneOwnedSceneInputSchema]))
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

    if (hasScenes) {
      const firstScene = value.scenes![0];
      const isSceneOwned = "steps" in firstScene;

      for (let i = 0; i < value.scenes!.length; i++) {
        const scene = value.scenes![i];
        const sceneIsOwned = "steps" in scene;
        if (sceneIsOwned !== isSceneOwned) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "All scenes must use the same format (either all stepIndex or all steps). Scene 0 and scene " +
              i +
              " are inconsistent.",
            path: ["scenes", i],
          });
          return;
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
        const stepIndices = legacyScenes.map((s) => s.stepIndex);

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
    }
  });
