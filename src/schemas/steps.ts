import { z } from "zod";
import { selectorSchema } from "./selector.js";

export const stepDelaySchema = z.object({
  delayBeforeMs: z.number().int().min(0).optional().describe("Delay before step executes in ms"),
  delayAfterMs: z.number().int().min(0).optional().describe("Delay after step completes in ms"),
});

export const waitableStepSchema = stepDelaySchema.extend({
  waitFor: z
    .boolean()
    .optional()
    .describe("Wait for selector to be visible before executing the step"),
});

export const gotoStepSchema = z.object({
  action: z.literal("goto").describe("Navigate to URL"),
  url: z.string().url().describe("Target URL"),
  waitUntil: z
    .enum(["load", "domcontentloaded", "networkidle"])
    .optional()
    .describe("When to consider navigation complete"),
});

export const clickStepSchema = waitableStepSchema.extend({
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

export const waitForStepUnion = z.union([
  waitForSelectorStepSchema,
  waitForURLStepSchema,
  waitForLoadStateStepSchema,
  waitForRequestStepSchema,
  waitForResponseStepSchema,
  waitForFunctionStepSchema,
]);

export const assertTextStepSchema = stepDelaySchema.extend({
  action: z.literal("assertText").describe("Assert element text matches expected"),
  selector: selectorSchema.describe("Element whose text is checked"),
  text: z.union([z.string(), z.instanceof(RegExp)]).describe("Expected text (string) or regex"),
  exact: z
    .boolean()
    .optional()
    .describe("When true, require exact match; otherwise substring (default false)"),
  timeoutMs: z.number().int().min(0).optional().describe("Timeout in ms (default: 5000)"),
});

export const assertVisibleStepSchema = stepDelaySchema.extend({
  action: z.literal("assertVisible").describe("Assert element is visible (or hidden)"),
  selector: selectorSchema.describe("Element to check"),
  visible: z.boolean().optional().describe("Expected visibility — true (default) or false"),
  timeoutMs: z.number().int().min(0).optional().describe("Timeout in ms (default: 5000)"),
});

export const assertUrlStepSchema = stepDelaySchema.extend({
  action: z.literal("assertUrl").describe("Assert the page URL matches expected"),
  url: z
    .union([z.string().min(1), z.instanceof(RegExp)])
    .describe("Expected URL substring or regex"),
  exact: z
    .boolean()
    .optional()
    .describe("When true, require exact match; otherwise substring (default true)"),
  timeoutMs: z.number().int().min(0).optional().describe("Timeout in ms (default: 5000)"),
});

export const assertCountStepSchema = stepDelaySchema.extend({
  action: z.literal("assertCount").describe("Assert the number of matching elements"),
  selector: selectorSchema.describe("Selector to count"),
  count: z.number().int().min(0).describe("Expected number of matching elements"),
  timeoutMs: z.number().int().min(0).optional().describe("Timeout in ms (default: 5000)"),
});

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
    assertTextStepSchema,
    assertVisibleStepSchema,
    assertUrlStepSchema,
    assertCountStepSchema,
  ])
  .or(waitForStepUnion);

export type Step = z.infer<typeof stepSchema>;
