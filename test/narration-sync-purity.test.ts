import { describe, it, expect } from "vitest";
import { injectPadding, syncNarration, type SyncConfig } from "../src/narration-sync.js";
import type { Step } from "../src/schemas.js";

function wait(ms: number): Step {
  return { action: "wait", ms } as Step;
}

function click(delayAfterMs?: number): Step {
  return {
    action: "click",
    selector: { strategy: "custom", value: "button" },
    ...(delayAfterMs === undefined ? {} : { delayAfterMs }),
  } as Step;
}

const config: SyncConfig = {
  narrationSyncMode: "auto",
  narrationGapMs: 300,
  maxAutoPadMs: 10000,
  maxSyncPasses: 2,
};

const scenes = [{ narration: "one", stepIndex: 0 }];

/**
 * injectPadding is documented as *returning* an adjusted steps array, and the
 * pipeline relies on that: NarrationSyncStage hands it `ctx.config.steps` and
 * assigns the result back. padLastStep took a shallow copy (`[...steps]`) and
 * then mutated the step objects inside it, which are shared with the caller's
 * array — so the "original" steps came back already padded and a second sync
 * pass (or any caller re-reading its own input) double-counted the padding.
 */
describe("injectPadding does not mutate its input", () => {
  it("leaves a wait step's ms untouched in the caller's array", () => {
    const steps: Step[] = [wait(500)];
    const before = JSON.parse(JSON.stringify(steps));

    const result = injectPadding(steps, [
      {
        sceneIndex: 0,
        startStep: 0,
        endStep: 1,
        steps: [steps[0]],
        estimatedDurationMs: 500,
        narrationDurationMs: 2000,
        requiredMs: 2300,
        deficitMs: 1800,
      },
    ]);

    expect(steps).toEqual(before);
    expect((result.steps[0] as { ms: number }).ms).toBe(2300);
  });

  it("leaves a click step's delayAfterMs untouched in the caller's array", () => {
    const steps: Step[] = [click(100)];
    const before = JSON.parse(JSON.stringify(steps));

    const result = injectPadding(steps, [
      {
        sceneIndex: 0,
        startStep: 0,
        endStep: 1,
        steps: [steps[0]],
        estimatedDurationMs: 800,
        narrationDurationMs: 2000,
        requiredMs: 2300,
        deficitMs: 1500,
      },
    ]);

    expect(steps).toEqual(before);
    expect((result.steps[0] as { delayAfterMs: number }).delayAfterMs).toBe(1600);
  });

  // syncNarration is called on ctx.config.steps. If it pads in place, the
  // config the rest of the pipeline reads is silently different from the one
  // the user wrote, and a second call sees a deficit of 0 rather than the real
  // one — the padding becomes invisible to any later recomputation.
  it("syncNarration leaves ctx.config.steps untouched", () => {
    const steps: Step[] = [wait(500)];
    const before = JSON.parse(JSON.stringify(steps));
    const clips = [{ sceneIndex: 0, audioDurationMs: 2000, gapAfterMs: 0 }];

    const first = syncNarration({ steps, scenes, clips, config });

    expect(steps).toEqual(before);
    expect((first.steps[0] as { ms: number }).ms).toBe(2300);

    // Same input, same result — the first call did not poison the second.
    const second = syncNarration({ steps, scenes, clips, config });
    expect((second.steps[0] as { ms: number }).ms).toBe(2300);
    expect(second.report.totalDeficitMs).toBe(first.report.totalDeficitMs);
  });
});
