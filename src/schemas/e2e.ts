import { z } from "zod";
import { sharedConfigSchema, selectorSchema } from "./shared.js";

const checkpointAssertionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("expectVisible"), selector: selectorSchema }),
  z.object({ type: z.literal("expectHidden"), selector: selectorSchema }),
  z.object({ type: z.literal("expectText"), selector: selectorSchema, text: z.string(), contains: z.boolean().optional().default(true) }),
  z.object({ type: z.literal("expectUrl"), url: z.union([z.string().url(), z.instanceof(RegExp)]) }),
]);

const checkpointSchema = z.object({
  atStep: z.number().int().min(0).optional(),
  label: z.string().min(1).optional(),
  expect: z.array(checkpointAssertionSchema).min(1),
}).superRefine((value, ctx) => {
  if (value.atStep === undefined && !value.label) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Checkpoint requires either atStep or label.",
      path: ["atStep"],
    });
  }
});

const reportSchema = z.object({
  formats: z.array(z.enum(["dot", "json", "junit"])).min(1),
  outputDir: z.string().min(1),
  includeStepLogs: z.boolean().optional().default(true),
});

const executionSchema = z.object({
  retries: z.number().int().min(0).optional().default(0),
  repeat: z.number().int().min(1).optional().default(1),
  failFast: z.boolean().optional().default(false),
  parallel: z.number().int().min(1).optional().default(1),
});

const qualityGatesSchema = z.object({
  failOnConsoleError: z.boolean().optional().default(false),
  failOnNetwork4xx: z.boolean().optional().default(false),
  failOnNetwork5xx: z.boolean().optional().default(true),
});

export const e2eConfigInputSchema = sharedConfigSchema
  .extend({
    mode: z.literal("e2e"),
    checkpoints: z.array(checkpointSchema).optional(),
    report: reportSchema,
    execution: executionSchema.optional(),
    qualityGates: qualityGatesSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.steps || value.steps.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "E2E mode requires top-level steps.",
        path: ["steps"],
      });
    }
  });

export type DemoReelE2EConfigInput = z.infer<typeof e2eConfigInputSchema>;
export type DemoReelE2EConfig = DemoReelE2EConfigInput & { mode: "e2e" };
export type E2ECheckpoint = z.infer<typeof checkpointSchema>;
export type E2EAssertion = z.infer<typeof checkpointAssertionSchema>;
