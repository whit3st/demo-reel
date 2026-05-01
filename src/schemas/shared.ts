import { z } from "zod";

export const sizeSchema = z.object({
  width: z.number().int().positive().describe("Width in pixels"),
  height: z.number().int().positive().describe("Height in pixels"),
});

export const resolutionPresetSchema = z.enum(["HD", "FHD", "2K", "4K"]);
export const resolutionSchema = z.union([resolutionPresetSchema, sizeSchema]);

export const selectorStrategySchema = z.enum(["testId", "id", "class", "href", "data-node-id", "custom"]);

export const selectorSchema = z
  .object({
    strategy: selectorStrategySchema,
    value: z.string().min(1),
    index: z.number().int().min(0).optional(),
  })
  .superRefine((value, ctx) => {
    if ((value.strategy === "id" || value.strategy === "class") && (value.value.startsWith("#") || value.value.startsWith("."))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Selector values must be raw names without "#" or "." when using id or class strategy.',
        path: ["value"],
      });
    }
  });

const stepDelaySchema = z.object({
  delayBeforeMs: z.number().int().min(0).optional(),
  delayAfterMs: z.number().int().min(0).optional(),
});

export const gotoStepSchema = z.object({ action: z.literal("goto"), url: z.string().url(), waitUntil: z.enum(["load", "domcontentloaded", "networkidle"]).optional() });
export const clickStepSchema = stepDelaySchema.extend({ action: z.literal("click"), selector: selectorSchema });
export const hoverStepSchema = stepDelaySchema.extend({ action: z.literal("hover"), selector: selectorSchema });
export const typeStepSchema = stepDelaySchema.extend({ action: z.literal("type"), selector: selectorSchema, text: z.string(), delayMs: z.number().int().min(0).optional(), clear: z.boolean().optional() });
export const pressStepSchema = stepDelaySchema.extend({ action: z.literal("press"), selector: selectorSchema, key: z.string().min(1) });
export const scrollStepSchema = stepDelaySchema.extend({ action: z.literal("scroll"), selector: selectorSchema, x: z.number().int(), y: z.number().int() });
export const selectStepSchema = stepDelaySchema.extend({ action: z.literal("select"), selector: selectorSchema, value: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]) });
export const checkStepSchema = stepDelaySchema.extend({ action: z.literal("check"), selector: selectorSchema, checked: z.boolean() });
export const uploadStepSchema = stepDelaySchema.extend({ action: z.literal("upload"), selector: selectorSchema, filePath: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]) });
export const dragStepSchema = stepDelaySchema.extend({ action: z.literal("drag"), source: selectorSchema, target: selectorSchema });
export const waitStepSchema = z.object({ action: z.literal("wait"), ms: z.number().int().min(0) });
export const confirmStepSchema = z.object({ action: z.literal("confirm"), accept: z.boolean(), timeoutMs: z.number().int().min(0).optional() });

export const waitForSelectorStepSchema = z.object({ action: z.literal("waitFor"), kind: z.literal("selector"), selector: selectorSchema, state: z.enum(["attached", "detached", "visible", "hidden"]).optional(), timeoutMs: z.number().int().min(0).optional() });
export const waitForURLStepSchema = z.object({ action: z.literal("waitFor"), kind: z.literal("url"), url: z.union([z.string().url(), z.instanceof(RegExp)]), waitUntil: z.enum(["load", "domcontentloaded", "networkidle"]).optional(), timeoutMs: z.number().int().min(0).optional() });
export const waitForLoadStateStepSchema = z.object({ action: z.literal("waitFor"), kind: z.literal("loadState"), state: z.enum(["load", "domcontentloaded", "networkidle"]).optional(), timeoutMs: z.number().int().min(0).optional() });
export const waitForRequestStepSchema = z.object({ action: z.literal("waitFor"), kind: z.literal("request"), url: z.union([z.string().min(1), z.instanceof(RegExp)]), timeoutMs: z.number().int().min(0).optional() });
export const waitForResponseStepSchema = z.object({ action: z.literal("waitFor"), kind: z.literal("response"), url: z.union([z.string().min(1), z.instanceof(RegExp)]), timeoutMs: z.number().int().min(0).optional() });
export const waitForFunctionStepSchema = z.object({ action: z.literal("waitFor"), kind: z.literal("function"), expression: z.string().min(1), arg: z.unknown().optional(), polling: z.union([z.literal("raf"), z.number().int().positive()]).optional(), timeoutMs: z.number().int().min(0).optional() });

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

export const storageTypeSchema = z.enum(["cookies", "localStorage"]);
export const authStorageConfigSchema = z.object({ name: z.string().min(1), types: z.array(storageTypeSchema).min(1), file: z.string().min(1).optional() });
export const authValidateConfigSchema = z.object({ protectedUrl: z.string().url(), successIndicator: selectorSchema });
export const authBehaviorConfigSchema = z.object({ autoReauth: z.boolean().optional(), forceReauth: z.boolean().optional(), clearInvalid: z.boolean().optional() });
export const authConfigSchema = z.object({ loginSteps: z.array(stepSchema).min(1), validate: authValidateConfigSchema, storage: authStorageConfigSchema, behavior: authBehaviorConfigSchema.optional() });

export const randomizationSchema = z.object({ seed: z.union([z.string().min(1), z.number().int()]).optional() }).optional();

export const sharedConfigSchema = z.object({
  name: z.string().min(1).optional(),
  steps: z.array(stepSchema).min(1).optional(),
  setup: z.array(stepSchema).optional(),
  cleanup: z.array(stepSchema).optional(),
  tags: z.array(z.string().min(1)).optional(),
  randomization: randomizationSchema,
  timestamp: z.boolean().optional(),
  auth: authConfigSchema.optional(),
  outputPath: z.string().min(1).optional(),
  outputDir: z.string().min(1).optional(),
}).strict();

export const runtimeSceneSchema = z.object({
  narration: z.string(),
  stepIndex: z.number().int().min(0),
  isIntro: z.boolean().optional(),
});

export type SizeConfig = z.infer<typeof sizeSchema>;
export type ResolutionPreset = z.infer<typeof resolutionPresetSchema>;
export type ResolutionConfig = z.infer<typeof resolutionSchema>;
export type SelectorStrategy = z.infer<typeof selectorStrategySchema>;
export type SelectorConfig = z.infer<typeof selectorSchema>;
export type Step = z.infer<typeof stepSchema>;
export type StorageType = z.infer<typeof storageTypeSchema>;
export type AuthStorageConfig = z.infer<typeof authStorageConfigSchema>;
export type AuthValidateConfig = z.infer<typeof authValidateConfigSchema>;
export type AuthBehaviorConfig = z.infer<typeof authBehaviorConfigSchema>;
export type AuthConfig = z.infer<typeof authConfigSchema>;
export type RandomizationConfig = z.infer<typeof randomizationSchema>;
export type RuntimeScene = z.infer<typeof runtimeSceneSchema>;
