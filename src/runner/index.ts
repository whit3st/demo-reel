import type { Page } from "playwright";
import {
  demoReelConfigSchema,
  type DemoReelConfig,
  type DemoReelConfigInput,
  type Step,
} from "../schemas.js";
import { createRandom } from "../random.js";
import type { SceneTimestamp, MouseState } from "./types.js";
import { isConfirmStep } from "./utils.js";
import { installCursorOverlay, ensureCursorOverlay } from "./cursor.js";
import { handleDialogForConfirmStep, runWithConfirmSimple, runStepSimple } from "./step-simple.js";
import { runStep, runWithConfirm } from "./steps.js";
import { buildSceneBoundaries } from "./scene-tracking.js";

export const formatStepForLog = (step: Step): string => {
  if (step.action === "goto") return `goto ${step.url}`;
  if (step.action === "wait") return `wait ${step.ms}ms`;
  if (step.action === "waitFor") return `waitFor ${step.kind}`;
  if (step.action === "confirm") return `confirm ${step.accept ? "accept" : "dismiss"}`;
  if (
    step.action === "click" ||
    step.action === "hover" ||
    step.action === "type" ||
    step.action === "press" ||
    step.action === "scroll" ||
    step.action === "select" ||
    step.action === "check" ||
    step.action === "upload"
  ) {
    return `${step.action} ${JSON.stringify(step.selector)}`;
  }
  if (step.action === "drag") {
    return `drag ${JSON.stringify(step.source)} -> ${JSON.stringify(step.target)}`;
  }
  if (step.action === "assertText") {
    return `assertText ${JSON.stringify(step.selector)} ${step.text instanceof RegExp ? step.text.toString() : JSON.stringify(step.text)}`;
  }
  if (step.action === "assertVisible") {
    return `assertVisible ${JSON.stringify(step.selector)} ${step.visible === false ? "hidden" : "visible"}`;
  }
  if (step.action === "assertUrl") {
    return `assertUrl ${step.url instanceof RegExp ? step.url.toString() : JSON.stringify(step.url)}`;
  }
  if (step.action === "assertCount") {
    return `assertCount ${JSON.stringify(step.selector)} ${step.count}`;
  }
  return "unknown-step";
};

export interface RunScenarioForTestOptions {
  verbose?: boolean;
  runAuth?: boolean;
  skipCleanup?: boolean;
}

const collectMainSteps = (config: DemoReelConfig): Step[] => {
  return config.steps ?? [];
};

export const runScenarioForTest = async (
  page: Page,
  config: DemoReelConfig | DemoReelConfigInput,
  options: RunScenarioForTestOptions = {},
): Promise<void> => {
  const { verbose = false, runAuth = false, skipCleanup = false } = options;
  const parsed = demoReelConfigSchema.parse(config);

  if (runAuth && parsed.auth) {
    await runSteps(page, parsed.auth.loginSteps, { verbose, label: "auth" });
  }

  const setup = parsed.setup ?? parsed.preSteps;
  if (setup && setup.length > 0) {
    await runSteps(page, setup, { verbose, label: "setup" });
  }

  const mainSteps = collectMainSteps(parsed);
  if (mainSteps.length > 0) {
    await runSteps(page, mainSteps, { verbose, label: "main" });
  }

  const cleanup = parsed.cleanup ?? parsed.postSteps;
  if (!skipCleanup && cleanup && cleanup.length > 0) {
    await runSteps(page, cleanup, { tolerant: true, verbose, label: "cleanup" });
  }
};

export const runSteps = async (
  page: Page,
  preSteps: Step[],
  options?: { tolerant?: boolean; verbose?: boolean; label?: string },
) => {
  for (let index = 0; index < preSteps.length; index++) {
    const step = preSteps[index];
    const nextStep = preSteps[index + 1];
    const prefix = options?.label ? `${options.label} ` : "";

    if (options?.verbose) {
      console.log(`  ↳ ${prefix}step ${index + 1}/${preSteps.length}: ${formatStepForLog(step)}`);
    }

    if (options?.tolerant) {
      try {
        if (step.action === "confirm") {
          await handleDialogForConfirmStep(page, step);
        } else if (isConfirmStep(nextStep)) {
          await runWithConfirmSimple(page, step, nextStep);
          index += 1;
          if (options?.verbose) {
            console.log(
              `  ↳ ${prefix}step ${index + 1}/${preSteps.length}: ${formatStepForLog(nextStep)}`,
            );
          }
        } else {
          await runStepSimple(page, step);
        }
      } catch (error) {
        if (options?.verbose) {
          console.log(
            `  ↳ ${prefix}step ${index + 1} skipped: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    } else {
      if (step.action === "confirm") {
        await handleDialogForConfirmStep(page, step);
      } else if (isConfirmStep(nextStep)) {
        await runWithConfirmSimple(page, step, nextStep);
        index += 1;
        if (options?.verbose) {
          console.log(
            `  ↳ ${prefix}step ${index + 1}/${preSteps.length}: ${formatStepForLog(nextStep)}`,
          );
        }
      } else {
        await runStepSimple(page, step);
      }
    }
  }
};

export const runDemo = async (page: Page, config: DemoReelConfig): Promise<SceneTimestamp[]> => {
  const resolvedCursor = await installCursorOverlay(page, config.cursor);
  const mouseState: MouseState = {
    initialized: false,
    position: { x: 0, y: 0 },
  };
  let startDelayApplied = false;
  const rng = config.randomization ? createRandom(config.randomization.seed) : undefined;

  const sceneBoundaries = buildSceneBoundaries(config.scenes);

  const timestamps: SceneTimestamp[] = [];
  const recordingStart = Date.now();
  let currentScene: { index: number; startMs: number } | null = null;

  for (let stepIdx = 0; stepIdx < config.steps.length; stepIdx++) {
    const step = config.steps[stepIdx];
    const nextStep = config.steps[stepIdx + 1];

    await ensureCursorOverlay(page, resolvedCursor);

    const sceneIdx = sceneBoundaries.get(stepIdx);
    if (sceneIdx !== undefined && config.scenes) {
      const now = Date.now() - recordingStart;

      if (currentScene !== null) {
        const prevScene = config.scenes[currentScene.index];
        timestamps.push({
          sceneIndex: currentScene.index,
          narration: prevScene.narration,
          isIntro: prevScene.isIntro ?? false,
          startMs: currentScene.startMs,
          endMs: now,
        });
      }

      currentScene = { index: sceneIdx, startMs: now };
    }

    try {
      if (step.action === "confirm") {
        await handleDialogForConfirmStep(page, step);
      } else if (isConfirmStep(nextStep)) {
        startDelayApplied = await runWithConfirm(
          page,
          step,
          nextStep,
          config,
          mouseState,
          resolvedCursor.start,
          resolvedCursor,
          startDelayApplied,
          rng,
        );
        stepIdx += 1;
      } else {
        startDelayApplied = await runStep(
          page,
          step,
          config,
          mouseState,
          resolvedCursor.start,
          resolvedCursor,
          startDelayApplied,
          rng,
        );
      }
    } catch (error) {
      try {
        const debugDir = "output/debug";
        const { mkdirSync } = await import("fs");
        mkdirSync(debugDir, { recursive: true });
        const screenshotPath = `${debugDir}/step-${stepIdx}-failure.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        const url = page.url();
        console.error(`\n✗ Step ${stepIdx} failed: ${(step as Step).action}`);
        console.error(`  URL: ${url}`);
        console.error(`  Screenshot: ${screenshotPath}`);
      } catch {
        // Ignore screenshot errors
      }
      throw error;
    }
  }

  if (config.timing.endDelayMs > 0) {
    await page.waitForTimeout(config.timing.endDelayMs);
  }

  if (currentScene !== null && config.scenes) {
    const finalScene = config.scenes[currentScene.index];
    timestamps.push({
      sceneIndex: currentScene.index,
      narration: finalScene.narration,
      isIntro: finalScene.isIntro ?? false,
      startMs: currentScene.startMs,
      endMs: Date.now() - recordingStart,
    });
  }

  return timestamps;
};
