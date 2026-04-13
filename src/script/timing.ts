import type { Step } from "../schemas.js";
import type { DemoScript, TimedScene, TimedScript } from "./types.js";

// --- Step duration estimation ---

// Average ms per character when typing with "humanlike" preset
const TYPING_MS_PER_CHAR = 100;
// Average movement + click duration
const CLICK_DURATION_MS = 700;
// Goto + page load
const GOTO_DURATION_MS = 2000;
// Default step duration for steps we can't estimate
const DEFAULT_STEP_DURATION_MS = 500;
// Minimum padding between narration end and next scene
const SCENE_LEAD_IN_MS = 300;

/**
 * Estimate how long a step takes to execute in milliseconds.
 */
function estimateStepDuration(step: Step): number {
  const delayBefore = ("delayBeforeMs" in step && step.delayBeforeMs) || 0;
  const delayAfter = ("delayAfterMs" in step && step.delayAfterMs) || 0;
  const base = delayBefore + delayAfter;

  switch (step.action) {
    case "goto":
      return base + GOTO_DURATION_MS;
    case "click":
    case "hover":
      return base + CLICK_DURATION_MS;
    case "type":
      return base + step.text.length * TYPING_MS_PER_CHAR;
    case "press":
      return base + 200;
    case "scroll":
      return base + 400;
    case "select":
    case "check":
    case "upload":
      return base + 300;
    case "drag":
      return base + 1000;
    case "wait":
      return base + step.ms;
    case "waitFor":
      return base + DEFAULT_STEP_DURATION_MS;
    default:
      return base + DEFAULT_STEP_DURATION_MS;
  }
}

/**
 * Estimate total duration of a sequence of steps.
 */
function estimateStepsDuration(steps: Step[]): number {
  return steps.reduce((total, step) => total + estimateStepDuration(step), 0);
}

/**
 * Apply timing adjustments to steps so they fill a target duration.
 *
 * Strategy:
 * - Calculate total estimated step time
 * - If steps are shorter than audio: distribute extra time as delays
 * - If steps are longer than audio: no changes (the audio gap will handle it)
 */
function fitStepsToAudioDuration(steps: Step[], audioDurationMs: number): Step[] {
  if (steps.length === 0) return steps;

  const estimatedTotal = estimateStepsDuration(steps);
  const targetDuration = audioDurationMs + SCENE_LEAD_IN_MS;

  if (estimatedTotal >= targetDuration) {
    // Steps already fill the time, no adjustments needed
    return steps;
  }

  // Distribute extra time across steps
  const extraMs = targetDuration - estimatedTotal;

  // Find good insertion points for delays:
  // After goto (viewer absorbs the page), after click (viewer sees result), before type (viewer reads narration)
  const delayPoints: number[] = [];
  for (let i = 0; i < steps.length; i++) {
    const action = steps[i].action;
    if (action === "goto" || action === "click" || action === "type") {
      delayPoints.push(i);
    }
  }

  // If no good delay points, distribute evenly after each step
  if (delayPoints.length === 0) {
    delayPoints.push(...steps.map((_, i) => i));
  }

  const delayPerPoint = Math.round(extraMs / delayPoints.length);

  return steps.map((step, i) => {
    if (!delayPoints.includes(i)) return step;

    const action = step.action;

    // Add delay after the step for goto/click, before the step for type
    if (action === "type") {
      return {
        ...step,
        delayBeforeMs: ((step as { delayBeforeMs?: number }).delayBeforeMs || 0) + delayPerPoint,
      } as Step;
    }

    return {
      ...step,
      delayAfterMs: ((step as { delayAfterMs?: number }).delayAfterMs || 0) + delayPerPoint,
    } as Step;
  });
}

/**
 * Build a TimedScript from a DemoScript and timed scenes (with audio durations).
 *
 * This is the main timing engine: it takes the raw script + audio duration info
 * and produces steps with delays adjusted for narration sync.
 */
export function synchronizeTiming(
  script: DemoScript,
  timedScenes: TimedScene[],
  audioPath: string,
): TimedScript {
  const syncedScenes: TimedScene[] = [];
  let totalDurationMs = 0;

  for (let i = 0; i < script.scenes.length; i++) {
    const scene = script.scenes[i];
    const timed = timedScenes[i];

    if (!timed) {
      throw new Error(`Missing timed scene data for scene ${i + 1}`);
    }

    // Fit the original steps to match the audio duration
    const adjustedSteps = fitStepsToAudioDuration(scene.steps as Step[], timed.audioDurationMs);

    const syncedScene: TimedScene = {
      narration: scene.narration,
      steps: adjustedSteps,
      emphasis: scene.emphasis,
      stepIndex: timed.stepIndex ?? scene.stepIndex,
      sourceSceneIndex: timed.sourceSceneIndex ?? scene.sourceSceneIndex,
      audioDurationMs: timed.audioDurationMs,
      audioOffsetMs: timed.audioOffsetMs,
      gapAfterMs: timed.gapAfterMs,
    };

    syncedScenes.push(syncedScene);
    totalDurationMs = timed.audioOffsetMs + timed.audioDurationMs + timed.gapAfterMs;
  }

  return {
    title: script.title,
    description: script.description,
    url: script.url,
    scenes: syncedScenes,
    audioPath,
    totalDurationMs,
  };
}
