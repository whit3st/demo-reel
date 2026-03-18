import { z } from "zod";

const sizeSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const cursorBaseSchema = z.object({
  start: z.object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
  }),
  persistPosition: z.boolean(),
  storageKey: z.string().min(1).optional(),
});

const cursorDotSchema = z.object({
  type: z.literal("dot"),
  size: z.number().int().positive(),
  borderWidth: z.number().int().positive(),
  borderColor: z.string().min(1),
  shadowColor: z.string().min(1),
});

const cursorSvgSchema = z.object({
  type: z.literal("svg"),
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

const cursorSchema = cursorBaseSchema.and(
  z.discriminatedUnion("type", [cursorDotSchema, cursorSvgSchema]),
);

const motionSchema = z
  .object({
    moveDurationMs: z.number().int().positive(),
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

const timingSchema = z.object({
  afterGotoDelayMs: z.number().int().min(0),
  endDelayMs: z.number().int().min(0),
});

const typingSchema = z.object({
  baseDelayMs: z.number().int().min(0),
  spaceDelayMs: z.number().int().min(0),
  punctuationDelayMs: z.number().int().min(0),
  enterDelayMs: z.number().int().min(0),
});

const selectorStrategySchema = z.enum(["testId", "id", "class", "href"]);
const selectorSchema = z
  .object({
    strategy: selectorStrategySchema,
    value: z.string().min(1),
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

const stepDelaySchema = z.object({
  delayBeforeMs: z.number().int().min(0).optional(),
  delayAfterMs: z.number().int().min(0).optional(),
});

const gotoStepSchema = z.object({
  action: z.literal("goto"),
  url: z.string().url(),
  waitUntil: z.enum(["load", "domcontentloaded", "networkidle"]).optional(),
});

const clickStepSchema = stepDelaySchema.extend({
  action: z.literal("click"),
  selector: selectorSchema,
});

const hoverStepSchema = stepDelaySchema.extend({
  action: z.literal("hover"),
  selector: selectorSchema,
});

const typeStepSchema = stepDelaySchema.extend({
  action: z.literal("type"),
  selector: selectorSchema,
  text: z.string(),
  delayMs: z.number().int().min(0).optional(),
});

const pressStepSchema = stepDelaySchema.extend({
  action: z.literal("press"),
  selector: selectorSchema,
  key: z.string().min(1),
});

const scrollStepSchema = stepDelaySchema.extend({
  action: z.literal("scroll"),
  selector: selectorSchema,
  x: z.number().int(),
  y: z.number().int(),
});

const selectStepSchema = stepDelaySchema.extend({
  action: z.literal("select"),
  selector: selectorSchema,
  value: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
});

const checkStepSchema = stepDelaySchema.extend({
  action: z.literal("check"),
  selector: selectorSchema,
  checked: z.boolean(),
});

const uploadStepSchema = stepDelaySchema.extend({
  action: z.literal("upload"),
  selector: selectorSchema,
  filePath: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
});

const dragStepSchema = stepDelaySchema.extend({
  action: z.literal("drag"),
  source: selectorSchema,
  target: selectorSchema,
});

const waitStepSchema = z.object({
  action: z.literal("wait"),
  ms: z.number().int().min(0),
});

const waitForSelectorStepSchema = z.object({
  action: z.literal("waitFor"),
  kind: z.literal("selector"),
  selector: selectorSchema,
  state: z.enum(["attached", "detached", "visible", "hidden"]).optional(),
  timeoutMs: z.number().int().min(0).optional(),
});

const waitForURLStepSchema = z.object({
  action: z.literal("waitFor"),
  kind: z.literal("url"),
  url: z.union([z.string().url(), z.instanceof(RegExp)]),
  waitUntil: z.enum(["load", "domcontentloaded", "networkidle"]).optional(),
  timeoutMs: z.number().int().min(0).optional(),
});

const waitForLoadStateStepSchema = z.object({
  action: z.literal("waitFor"),
  kind: z.literal("loadState"),
  state: z.enum(["load", "domcontentloaded", "networkidle"]).optional(),
  timeoutMs: z.number().int().min(0).optional(),
});

const waitForRequestStepSchema = z.object({
  action: z.literal("waitFor"),
  kind: z.literal("request"),
  url: z.union([z.string().min(1), z.instanceof(RegExp)]),
  timeoutMs: z.number().int().min(0).optional(),
});

const waitForResponseStepSchema = z.object({
  action: z.literal("waitFor"),
  kind: z.literal("response"),
  url: z.union([z.string().min(1), z.instanceof(RegExp)]),
  timeoutMs: z.number().int().min(0).optional(),
});

const waitForFunctionStepSchema = z.object({
  action: z.literal("waitFor"),
  kind: z.literal("function"),
  expression: z.string().min(1),
  arg: z.unknown().optional(),
  polling: z.union([z.literal("raf"), z.number().int().positive()]).optional(),
  timeoutMs: z.number().int().min(0).optional(),
});

const waitForStepSchema = z.discriminatedUnion("kind", [
  waitForSelectorStepSchema,
  waitForURLStepSchema,
  waitForLoadStateStepSchema,
  waitForRequestStepSchema,
  waitForResponseStepSchema,
  waitForFunctionStepSchema,
]);

const stepSchema = z.discriminatedUnion("action", [
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
  waitForStepSchema,
  waitStepSchema,
]);

export const e2eConfigSchema = z.object({
  viewport: sizeSchema,
  video: z.object({
    enabled: z.boolean(),
    size: sizeSchema,
  }),
  cursor: cursorSchema,
  motion: motionSchema,
  typing: typingSchema,
  timing: timingSchema,
  steps: z.array(stepSchema).min(1),
});

export type E2EConfig = z.infer<typeof e2eConfigSchema>;
export type E2EStep = E2EConfig["steps"][number];
export type CursorConfig = E2EConfig["cursor"];
export type MotionConfig = E2EConfig["motion"];
export type TypingConfig = E2EConfig["typing"];
export type TimingConfig = E2EConfig["timing"];
export type VideoConfig = E2EConfig["video"];
export type ViewportConfig = E2EConfig["viewport"];
export type SelectorStrategy = z.infer<typeof selectorStrategySchema>;
export type SelectorConfig = z.infer<typeof selectorSchema>;

export const e2eConfig = e2eConfigSchema.parse({
  // Use raw names for id/class strategies (no '#' or '.').
  viewport: { width: 1920, height: 1080 },
  video: {
    enabled: true,
    size: { width: 1920, height: 1080 },
  },
  cursor: {
    start: { x: 160, y: 160 },
    persistPosition: true,
    storageKey: "demo-reel.cursor-position",
    type: "svg",
    svg: {
      markup:
        '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 94.85 122.88" style="enable-background:new 0 0 94.85 122.88" xml:space="preserve"><g><path d="M60.56,122.49c-1.63,0.83-3.68,0.29-4.56-1.22L38.48,91.1l-17.38,19.51c-5.24,5.88-12.16,7.34-12.85-1.57L0,1.59h0 C-0.04,1.03,0.2,0.46,0.65,0.13C1.17-0.1,1.78-0.02,2.24,0.3l0,0l88.92,60.87c7.37,5.05,2.65,10.31-5.06,11.91l-25.58,5.3 l17.37,30.26c0.86,1.51,0.31,3.56-1.22,4.55L60.56,122.49L60.56,122.49L60.56,122.49z"/></g></svg>',
      width: 18,
      height: 23,
      hotspot: { x: 0, y: 0 },
    },
  },
  motion: {
    moveDurationMs: 600,
    moveStepsMin: 25,
    stepsPerPx: 12,
    clickDelayMs: 60,
    curve: {
      offsetRatio: 0.1,
      offsetMin: 4,
      offsetMax: 80,
      easing: "easeInOutCubic",
    },
  },
  typing: {
    baseDelayMs: 70,
    spaceDelayMs: 120,
    punctuationDelayMs: 180,
    enterDelayMs: 200,
  },
  timing: {
    afterGotoDelayMs: 2000,
    endDelayMs: 2000,
  },
  steps: [
    { action: "goto", url: "https://demo.epistola.app/login" },
    {
      action: "click",
      selector: { strategy: "class", value: "btn-primary" },
    },
    { action: "wait", ms: 400 },
    {
      action: "click",
      selector: { strategy: "id", value: "username" },
    },
    {
      action: "type",
      selector: { strategy: "id", value: "username" },
      text: "admin@local",
    },
    {
      action: "click",
      selector: { strategy: "id", value: "password" },
    },
    {
      action: "type",
      selector: { strategy: "id", value: "password" },
      text: "admin",
    },
    {
      action: "click",
      selector: { strategy: "class", value: "btn-primary" },
    },
    {
      action: "waitFor",
      kind: "selector",
      selector: { strategy: "href", value: "/tenants/my-test" },
      state: "visible",
    },
    {
      action: "click",
      selector: { strategy: "href", value: "/tenants/my-test" },
    },
    { action: "wait", ms: 2000 },
  ],
});
