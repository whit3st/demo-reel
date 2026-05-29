import { z } from "zod";

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

export type SelectorStrategy = z.infer<typeof selectorStrategySchema>;
export type SelectorConfig = z.infer<typeof selectorSchema>;
