/**
 * Narration-auto-sync engine for demo-reel.
 *
 * Uses a "scene window" model: each scene owns all steps from its stepIndex
 * up to (exclusive) the next scene's stepIndex. Narration timing is validated
 * against the full window, not just the anchor step.
 *
 * Example: scenes at [4, 6] with 10 total steps.
 *   Scene 0 window: steps 4..5  (stepIndex 4, endStep 6)
 *   Scene 1 window: steps 6..9  (stepIndex 6, endStep 10)
 */
import type { Step } from "./schemas.js";

// --- Types ---

export interface NarrationClipInfo {
  sceneIndex: number;
  narration: string;
  audioDurationMs: number;
  gapAfterMs: number;
}

export interface SceneWindow {
  sceneIndex: number;
  startStep: number;
  endStep: number;
  steps: Step[];
  estimatedDurationMs: number;
  narrationDurationMs: number;
  requiredMs: number;
  deficitMs: number;
}

export interface SyncReport {
  windows: SceneWindow[];
  totalDeficitMs: number;
  maxDeficitMs: number;
  overflowScenes: number[];
  appliedPadMs: number;
}

export interface SyncConfig {
  narrationSyncMode: "auto" | "strict" | "off";
  narrationGapMs: number;
  maxAutoPadMs: number;
  maxSyncPasses: number;
}

// --- Step duration estimation (mirrors script/timing.ts) ---

const TYPING_MS_PER_CHAR = 100;
const CLICK_DURATION_MS = 700;
const GOTO_DURATION_MS = 2000;
const DEFAULT_STEP_DURATION_MS = 500;

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

function estimateStepsDuration(steps: Step[]): number {
  return steps.reduce((total, step) => total + estimateStepDuration(step), 0);
}

// --- Scene window building ---

export function buildSceneWindows(
  steps: Step[],
  clips: NarrationClipInfo[],
  configScenes: ReadonlyArray<{ narration: string; stepIndex: number; isIntro?: boolean }>,
  gapMs: number,
): SceneWindow[] {
  if (clips.length === 0) return [];

  // Sort clips by sceneIndex to ensure correct ordering
  const sorted = [...clips].sort((a, b) => a.sceneIndex - b.sceneIndex);

  return sorted.map((clip, i) => {
    // clip.sceneIndex is the original config scene position.
    // Look up the actual stepIndex from the config scenes.
    const scene = configScenes[clip.sceneIndex];
    if (!scene) {
      throw new Error(
        `Narration clip references scene ${clip.sceneIndex} but config only has ${configScenes.length} scene(s)`,
      );
    }
    const startStep = scene.stepIndex;

    const nextClip = i < sorted.length - 1 ? sorted[i + 1] : undefined;
    const endStep = nextClip ? configScenes[nextClip.sceneIndex].stepIndex : steps.length;

    const windowSteps = steps.slice(startStep, endStep);
    const estimatedDurationMs = estimateStepsDuration(windowSteps);
    const gap = Math.max(gapMs, clip.gapAfterMs);
    const narrationDurationMs = clip.audioDurationMs;
    const requiredMs = narrationDurationMs + gap;
    const deficitMs = Math.max(0, requiredMs - estimatedDurationMs);

    return {
      sceneIndex: clip.sceneIndex,
      startStep,
      endStep,
      steps: windowSteps,
      estimatedDurationMs,
      narrationDurationMs,
      requiredMs,
      deficitMs,
    };
  });
}

// --- Step padding ---

/**
 * Pad the last step in a scene window by adding delayAfterMs.
 * If the last step doesn't support delayAfterMs (e.g., "wait" already is a delay),
 * we prefer to add an explicit wait step.
 */
function padLastStep(steps: Step[], padMs: number): Step[] {
  if (steps.length === 0) return steps;
  const result = [...steps];
  const lastIdx = result.length - 1;
  const last = result[lastIdx];

  // For "wait" steps, just increase the ms directly
  if (last.action === "wait") {
    (result[lastIdx] as Extract<Step, { action: "wait" }>).ms += padMs;
    return result;
  }

  // For steps that support delayAfterMs, add to it
  if ("delayAfterMs" in last) {
    const current = (last as { delayAfterMs?: number }).delayAfterMs || 0;
    (result[lastIdx] as { delayAfterMs: number }).delayAfterMs = current + padMs;
    return result;
  }

  // Fallback: insert a wait step after the last step
  result.push({ action: "wait", ms: padMs } as Step);
  return result;
}

/**
 * Inject padding into steps and shift downstream scene stepIndex values.
 * Returns the full adjusted steps array and new scene stepIndex values.
 */
export function injectPadding(
  allSteps: Step[],
  windows: SceneWindow[],
): {
  steps: Step[];
  sceneStepIndices: number[];
} {
  const steps = [...allSteps];
  let cumulativeShift = 0;
  const sceneStepIndices: number[] = [];

  for (let i = 0; i < windows.length; i++) {
    const window = windows[i];
    const originalStartStep = window.startStep;
    const adjustedStartStep = originalStartStep + cumulativeShift;

    sceneStepIndices.push(adjustedStartStep);

    if (window.deficitMs <= 0) continue;

    // Pad the last step in the window
    const paddedSteps = padLastStep(
      steps.slice(adjustedStartStep, adjustedStartStep + window.steps.length),
      window.deficitMs,
    );

    // Replace the window steps
    steps.splice(
      adjustedStartStep,
      window.steps.length,
      ...paddedSteps,
    );

    // Track cumulative shift for downstream scenes
    cumulativeShift += paddedSteps.length - window.steps.length;
  }

  return { steps, sceneStepIndices };
}

// --- Main sync engine ---

export interface SyncInput {
  steps: Step[];
  scenes: ReadonlyArray<{ narration: string; stepIndex: number; isIntro?: boolean }>;
  clips: NarrationClipInfo[];
  config: SyncConfig;
}

export interface SyncOutput {
  steps: Step[];
  sceneStepIndices: number[];
  report: SyncReport;
  hasOverflow: boolean;
}

/**
 * Run the narration-auto-sync engine.
 *
 * 1. Build scene windows from clips + steps.
 * 2. Compute deficits using the window model.
 * 3. Inject padding to close deficits (auto mode).
 * 4. Return adjusted steps + scene indices + diagnostic report.
 */
export function syncNarration(input: SyncInput): SyncOutput {
  const { steps, scenes, clips, config } = input;
  const { narrationSyncMode, narrationGapMs, maxAutoPadMs } = config;

  // Build initial windows
  const windows = buildSceneWindows(steps, clips, scenes, narrationGapMs);

  // Build report
  const totalDeficitMs = windows.reduce((sum, w) => sum + w.deficitMs, 0);
  const maxDeficitMs = Math.max(0, ...windows.map((w) => w.deficitMs));
  const overflowScenes = windows
    .filter((w) => w.deficitMs > maxAutoPadMs)
    .map((w) => w.sceneIndex);

  const report: SyncReport = {
    windows,
    totalDeficitMs,
    maxDeficitMs,
    overflowScenes,
    appliedPadMs: 0,
  };

  // Off mode: return as-is with report only
  if (narrationSyncMode === "off") {
    const sceneStepIndices = scenes.map((s) => s.stepIndex);
    return { steps, sceneStepIndices, report, hasOverflow: totalDeficitMs > 0 };
  }

  // Strict mode: fail if any deficit exists
  if (narrationSyncMode === "strict" && totalDeficitMs > 0) {
    const details = windows
      .filter((w) => w.deficitMs > 0)
      .map(
        (w) =>
          `  Scene ${w.sceneIndex}: needs ${w.requiredMs}ms, has ${w.estimatedDurationMs}ms (deficit ${w.deficitMs}ms)`,
      )
      .join("\n");
    throw new Error(
      `Narration sync failed (strict mode): ${totalDeficitMs}ms total deficit.\n${details}`,
    );
  }

  // Auto mode: inject padding
  const { steps: adjustedSteps, sceneStepIndices } = injectPadding(
    steps,
    windows,
  );

  report.appliedPadMs = totalDeficitMs;

  const hasOverflow = overflowScenes.length > 0;

  return {
    steps: adjustedSteps,
    sceneStepIndices,
    report,
    hasOverflow,
  };
}

/**
 * Log a human-readable sync report to console.
 */
export function logSyncReport(report: SyncReport, verbose: boolean = false): void {
  if (report.totalDeficitMs === 0 && !verbose) {
    console.log("✓ Narration in sync — no padding needed");
    return;
  }

  if (verbose) {
    console.log("\nNarration sync report:");
    for (const w of report.windows) {
      const status = w.deficitMs > 0 ? `+${w.deficitMs}ms pad` : "ok";
      console.log(
        `  Scene ${w.sceneIndex}: steps ${w.startStep}..${w.endStep - 1} — available ${w.estimatedDurationMs}ms, required ${w.requiredMs}ms → ${status}`,
      );
    }
  }

  if (report.totalDeficitMs > 0) {
    console.log(
      `  Total padding applied: ${report.appliedPadMs}ms across ${report.windows.filter((w) => w.deficitMs > 0).length} scene(s)`,
    );
  }

  if (report.overflowScenes.length > 0) {
    console.warn(
      `  Warning: scenes ${report.overflowScenes.join(", ")} exceed maxAutoPadMs threshold`,
    );
  }
}
