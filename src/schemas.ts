import { z } from 'zod';

export const sizeSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const cursorBaseSchema = z.object({
  start: z.object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
  }),
  persistPosition: z.boolean(),
  storageKey: z.string().min(1).optional(),
});

export const cursorDotSchema = z.object({
  type: z.literal('dot'),
  size: z.number().int().positive(),
  borderWidth: z.number().int().positive(),
  borderColor: z.string().min(1),
  shadowColor: z.string().min(1),
});

export const cursorSvgSchema = z.object({
  type: z.literal('svg'),
  svg: z.object({
    markup: z.string().min(1),
    width: z.number().positive(),
    height: z.number().positive(),
    hotspot: z.object({
      x: z.number().min(0),
      y: z.number().min(0),
    }),
  }),
});

export const cursorSchema = cursorBaseSchema.and(
  z.discriminatedUnion('type', [cursorDotSchema, cursorSvgSchema]),
);

export const motionSchema = z
  .object({
    moveDurationMs: z.number().int().positive(),
    moveStepsMin: z.number().int().positive(),
    stepsPerPx: z.number().positive(),
    clickDelayMs: z.number().int().nonnegative(),
    curve: z.object({
      offsetRatio: z.number().min(0).max(1),
      offsetMin: z.number().min(0),
      offsetMax: z.number().min(0),
      easing: z.enum(['easeInOutCubic']),
    }),
  })
  .refine((value) => value.curve.offsetMax >= value.curve.offsetMin, {
    message: 'curve.offsetMax must be greater than or equal to curve.offsetMin',
  });

export const timingSchema = z.object({
  afterGotoDelayMs: z.number().int().min(0),
  endDelayMs: z.number().int().min(0),
});

export const typingSchema = z.object({
  baseDelayMs: z.number().int().min(0),
  spaceDelayMs: z.number().int().min(0),
  punctuationDelayMs: z.number().int().min(0),
  enterDelayMs: z.number().int().min(0),
});

export const selectorStrategySchema = z.enum(['testId', 'id', 'class', 'href']);

export const selectorSchema = z
  .object({
    strategy: selectorStrategySchema,
    value: z.string().min(1),
  })
  .superRefine((value, ctx) => {
    if (value.strategy === 'id' || value.strategy === 'class') {
      if (value.value.startsWith('#') || value.value.startsWith('.')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Selector values must be raw names without "#" or "." when using id or class strategy.',
          path: ['value'],
        });
      }
    }
  });

export const stepDelaySchema = z.object({
  delayBeforeMs: z.number().int().min(0).optional(),
  delayAfterMs: z.number().int().min(0).optional(),
});

export const gotoStepSchema = z.object({
  action: z.literal('goto'),
  url: z.string().url(),
  waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle']).optional(),
});

export const clickStepSchema = stepDelaySchema.extend({
  action: z.literal('click'),
  selector: selectorSchema,
});

export const hoverStepSchema = stepDelaySchema.extend({
  action: z.literal('hover'),
  selector: selectorSchema,
});

export const typeStepSchema = stepDelaySchema.extend({
  action: z.literal('type'),
  selector: selectorSchema,
  text: z.string(),
  delayMs: z.number().int().min(0).optional(),
});

export const pressStepSchema = stepDelaySchema.extend({
  action: z.literal('press'),
  selector: selectorSchema,
  key: z.string().min(1),
});

export const scrollStepSchema = stepDelaySchema.extend({
  action: z.literal('scroll'),
  selector: selectorSchema,
  x: z.number().int(),
  y: z.number().int(),
});

export const selectStepSchema = stepDelaySchema.extend({
  action: z.literal('select'),
  selector: selectorSchema,
  value: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
});

export const checkStepSchema = stepDelaySchema.extend({
  action: z.literal('check'),
  selector: selectorSchema,
  checked: z.boolean(),
});

export const uploadStepSchema = stepDelaySchema.extend({
  action: z.literal('upload'),
  selector: selectorSchema,
  filePath: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
});

export const dragStepSchema = stepDelaySchema.extend({
  action: z.literal('drag'),
  source: selectorSchema,
  target: selectorSchema,
});

export const waitStepSchema = z.object({
  action: z.literal('wait'),
  ms: z.number().int().min(0),
});

export const waitForSelectorStepSchema = z.object({
  action: z.literal('waitFor'),
  kind: z.literal('selector'),
  selector: selectorSchema,
  state: z.enum(['attached', 'detached', 'visible', 'hidden']).optional(),
  timeoutMs: z.number().int().min(0).optional(),
});

export const waitForURLStepSchema = z.object({
  action: z.literal('waitFor'),
  kind: z.literal('url'),
  url: z.union([z.string().url(), z.instanceof(RegExp)]),
  waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle']).optional(),
  timeoutMs: z.number().int().min(0).optional(),
});

export const waitForLoadStateStepSchema = z.object({
  action: z.literal('waitFor'),
  kind: z.literal('loadState'),
  state: z.enum(['load', 'domcontentloaded', 'networkidle']).optional(),
  timeoutMs: z.number().int().min(0).optional(),
});

export const waitForRequestStepSchema = z.object({
  action: z.literal('waitFor'),
  kind: z.literal('request'),
  url: z.union([z.string().min(1), z.instanceof(RegExp)]),
  timeoutMs: z.number().int().min(0).optional(),
});

export const waitForResponseStepSchema = z.object({
  action: z.literal('waitFor'),
  kind: z.literal('response'),
  url: z.union([z.string().min(1), z.instanceof(RegExp)]),
  timeoutMs: z.number().int().min(0).optional(),
});

export const waitForFunctionStepSchema = z.object({
  action: z.literal('waitFor'),
  kind: z.literal('function'),
  expression: z.string().min(1),
  arg: z.unknown().optional(),
  polling: z.union([z.literal('raf'), z.number().int().positive()]).optional(),
  timeoutMs: z.number().int().min(0).optional(),
});

export const waitForStepSchema = z.discriminatedUnion('kind', [
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

export const stepSchema = z.discriminatedUnion('action', [
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
]).or(waitForStepUnion);

export const videoConfigSchema = z.object({
  enabled: z.boolean(),
  size: sizeSchema,
});

export const audioConfigSchema = z.object({
  narration: z.string().min(1).optional(),        // Path to MP3 file
  narrationDelay: z.number().min(0).optional(),  // Delay in milliseconds before narration starts
  background: z.string().min(1).optional(),       // Path to MP3 file
  backgroundVolume: z.number().min(0).max(1).optional(), // 0.0 to 1.0
});

export const authConfigSchema = z.object({
  persistCookies: z.boolean().optional(),  // Save and restore cookies between runs
  cookieFile: z.string().min(1).optional(), // Custom cookie file path (default: .demo-reel-cookies.json)
  loginUrl: z.string().url().optional(),   // URL to check if authenticated (if not, login steps run)
  successUrl: z.string().url().optional(), // URL indicating successful login
});

export const demoReelConfigSchema = z.object({
  viewport: sizeSchema,
  video: videoConfigSchema,
  cursor: cursorSchema,
  motion: motionSchema,
  typing: typingSchema,
  timing: timingSchema,
  steps: z.array(stepSchema).min(1),
  // Output-related fields
  name: z.string().min(1).optional(),
  outputDir: z.string().min(1).optional(),
  outputPath: z.string().min(1).optional(),
  concurrency: z.number().int().min(1).optional(),
  // Audio support
  audio: audioConfigSchema.optional(),
  // Timestamp option for output filename (default: false for CI/CD compatibility)
  timestamp: z.boolean().optional(),
  // Authentication persistence
  auth: authConfigSchema.optional(),
});

// Export types
export type SizeConfig = z.infer<typeof sizeSchema>;
export type CursorConfig = z.infer<typeof cursorSchema>;
export type MotionConfig = z.infer<typeof motionSchema>;
export type TimingConfig = z.infer<typeof timingSchema>;
export type TypingConfig = z.infer<typeof typingSchema>;
export type VideoConfig = z.infer<typeof videoConfigSchema>;
export type AudioConfig = z.infer<typeof audioConfigSchema>;
export type AuthConfig = z.infer<typeof authConfigSchema>;
export type SelectorStrategy = z.infer<typeof selectorStrategySchema>;
export type SelectorConfig = z.infer<typeof selectorSchema>;
export type Step = z.infer<typeof stepSchema>;
export type DemoReelConfig = z.infer<typeof demoReelConfigSchema>;
