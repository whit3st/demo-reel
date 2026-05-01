import { z } from "zod";
import { demoReelVideoConfigSchema, videoConfigInputSchema, type DemoReelVideoConfig, type DemoReelVideoConfigInput } from "./video.js";
import { e2eConfigInputSchema, type DemoReelE2EConfig, type DemoReelE2EConfigInput } from "./e2e.js";

export const demoReelConfigInputSchema = z.discriminatedUnion("mode", [videoConfigInputSchema, e2eConfigInputSchema]);

export type DemoReelConfigInput = DemoReelVideoConfigInput | DemoReelE2EConfigInput;
export type DemoReelConfig = DemoReelVideoConfig | DemoReelE2EConfig;

export const demoReelConfigSchema = demoReelConfigInputSchema.transform((value): DemoReelConfig => {
  if (value.mode === "video") {
    return demoReelVideoConfigSchema.parse(value);
  }
  return value;
});

export const demoReelVideoOnlySchema = demoReelConfigInputSchema.superRefine((value, ctx) => {
  if (value.mode !== "video") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'This command only supports mode="video" for now.',
      path: ["mode"],
    });
  }
}).transform((value) => demoReelVideoConfigSchema.parse(value as DemoReelVideoConfigInput));
