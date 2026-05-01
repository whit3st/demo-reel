import { chromium, type Page } from "playwright";
import { runSteps } from "../runner.js";
import type { Step } from "../schemas.js";
import type { RuntimeContext, RuntimeResult } from "./types.js";

export interface CoreRunOptions {
  headed?: boolean;
  verbose?: boolean;
  label?: string;
  tolerant?: boolean;
  baseUrl?: string;
  timeoutMs?: number;
}

export async function createRuntimeContext(options: CoreRunOptions = {}): Promise<RuntimeContext> {
  const browser = await chromium.launch({ headless: !options.headed });
  const context = await browser.newContext();
  if (options.timeoutMs && options.timeoutMs > 0) {
    context.setDefaultTimeout(options.timeoutMs);
  }
  const page = await context.newPage();
  if (options.baseUrl) {
    await page.goto(options.baseUrl);
  }
  return { browser, context, page };
}

export async function closeRuntimeContext(runtime: RuntimeContext): Promise<void> {
  await runtime.context.close().catch(() => {});
  await runtime.browser.close().catch(() => {});
}

export async function runStepSequence(
  page: Page,
  steps: Step[],
  options: CoreRunOptions = {},
): Promise<void> {
  await runSteps(page, steps, {
    tolerant: options.tolerant,
    verbose: options.verbose,
    label: options.label,
  });
}

export async function runHooks(
  page: Page,
  hooks: { setup?: Step[]; cleanup?: Step[] },
  options: CoreRunOptions = {},
): Promise<void> {
  if (hooks.setup && hooks.setup.length > 0) {
    await runStepSequence(page, hooks.setup, {
      ...options,
      label: options.label ?? "setup",
      tolerant: options.tolerant ?? true,
    });
  }

  if (hooks.cleanup && hooks.cleanup.length > 0) {
    await runStepSequence(page, hooks.cleanup, {
      ...options,
      label: options.label ?? "cleanup",
      tolerant: options.tolerant ?? true,
    });
  }
}

export function toRuntimeResult(startedAt: number, error?: unknown): RuntimeResult {
  if (!error) {
    return {
      ok: true,
      durationMs: Date.now() - startedAt,
    };
  }

  const err = error instanceof Error ? error : new Error(String(error));
  return {
    ok: false,
    durationMs: Date.now() - startedAt,
    failure: {
      message: err.message,
      stack: err.stack,
    },
  };
}

export type { RuntimeContext, RuntimeResult } from "./types.js";
