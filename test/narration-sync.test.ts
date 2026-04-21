import { describe, it, expect } from "vitest";
import {
  buildSceneWindows,
  injectPadding,
  syncNarration,
  type NarrationClipInfo,
  type SyncConfig,
} from "../src/narration-sync.js";
import type { Step } from "../src/schemas.js";

function wait(ms: number): Step {
  return { action: "wait", ms } as Step;
}

function click(ms: number = 700): Step {
  return {
    action: "click",
    selector: { strategy: "custom", value: "button" },
    delayAfterMs: ms,
  } as Step;
}

function type(text: string): Step {
  return {
    action: "type",
    selector: { strategy: "id", value: "input" },
    text,
  } as Step;
}

function goto(): Step {
  return {
    action: "goto",
    url: "https://example.com",
  } as Step;
}

const defaultSyncConfig: SyncConfig = {
  narrationSyncMode: "auto",
  narrationGapMs: 300,
  maxAutoPadMs: 5000,
  maxSyncPasses: 2,
};

describe("buildSceneWindows", () => {
  it("scene at stepIndex 4 owns steps 4..5 when next scene starts at 6", () => {
    const steps: Step[] = [
      goto(), // 0
      click(), // 1
      wait(500), // 2
      wait(300), // 3
      click(), // 4 — scene at configScenes[1] starts here (stepIndex=4)
      type("hello"), // 5 — included in that scene window
      click(), // 6 — scene at configScenes[2] starts here (stepIndex=6)
      wait(200), // 7
    ];

    const configScenes = [
      { narration: "intro", stepIndex: 0 },
      { narration: "scene A", stepIndex: 4 },
      { narration: "scene B", stepIndex: 6 },
    ];

    const clips: NarrationClipInfo[] = [
      { sceneIndex: 0, narration: "intro", audioDurationMs: 3000, gapAfterMs: 500 },
      { sceneIndex: 1, narration: "scene A", audioDurationMs: 4000, gapAfterMs: 500 },
      { sceneIndex: 2, narration: "scene B", audioDurationMs: 3000, gapAfterMs: 0 },
    ];

    const windows = buildSceneWindows(steps, clips, configScenes, 300);

    // Scene 0 (configScenes[0], stepIndex=0): steps[0..3] (next configScenes[1].stepIndex=4)
    expect(windows[0].startStep).toBe(0);
    expect(windows[0].endStep).toBe(4);
    expect(windows[0].steps).toHaveLength(4);

    // Scene 1 (configScenes[1], stepIndex=4): steps[4..5] (next configScenes[2].stepIndex=6)
    expect(windows[1].startStep).toBe(4);
    expect(windows[1].endStep).toBe(6);
    expect(windows[1].steps).toHaveLength(2);

    // Scene 2 (configScenes[2], stepIndex=6): steps[6..7] (last, goes to end)
    expect(windows[2].startStep).toBe(6);
    expect(windows[2].endStep).toBe(8);
    expect(windows[2].steps).toHaveLength(2);
  });

  it("correctly computes deficit for narration longer than visual window", () => {
    const steps: Step[] = [click(), click()];
    const configScenes = [{ narration: "long narration", stepIndex: 0 }];
    const clips: NarrationClipInfo[] = [
      { sceneIndex: 0, narration: "long narration", audioDurationMs: 4000, gapAfterMs: 300 },
    ];

    const windows = buildSceneWindows(steps, clips, configScenes, 300);

    expect(windows).toHaveLength(1);
    // click(700ms) + click(700ms) = 1400ms estimated
    // required = 4000 + max(300, 300) = 4300ms
    // deficit = 4300 - 1400 = 2900ms
    expect(windows[0].deficitMs).toBeGreaterThan(0);
    expect(windows[0].narrationDurationMs).toBe(4000);
  });

  it("no deficit when visual window is longer than narration", () => {
    const steps: Step[] = [wait(3000), wait(3000), wait(3000)];
    const configScenes = [{ narration: "short", stepIndex: 0 }];
    const clips: NarrationClipInfo[] = [
      { sceneIndex: 0, narration: "short", audioDurationMs: 2000, gapAfterMs: 300 },
    ];

    const windows = buildSceneWindows(steps, clips, configScenes, 300);

    expect(windows).toHaveLength(1);
    expect(windows[0].deficitMs).toBe(0);
  });

  it("throws when clip references non-existent scene index", () => {
    const steps: Step[] = [wait(100)];
    const configScenes = [{ narration: "only scene", stepIndex: 0 }];
    const clips: NarrationClipInfo[] = [
      { sceneIndex: 5, narration: "missing", audioDurationMs: 1000, gapAfterMs: 0 },
    ];

    expect(() => buildSceneWindows(steps, clips, configScenes, 300)).toThrow(
      /scene 5 but config only has 1 scene/,
    );
  });
});

describe("injectPadding", () => {
  it("pads the last step in each scene window", () => {
    const steps: Step[] = [
      click(), // 0 — scene 0 window
      wait(500), // 1 — scene 0 window
      click(), // 2 — scene 1 window
    ];

    const configScenes = [
      { narration: "scene 0", stepIndex: 0 },
      { narration: "scene 1", stepIndex: 2 },
    ];

    const clips: NarrationClipInfo[] = [
      { sceneIndex: 0, narration: "scene 0", audioDurationMs: 4000, gapAfterMs: 300 },
      { sceneIndex: 1, narration: "scene 1", audioDurationMs: 2000, gapAfterMs: 0 },
    ];

    const windows = buildSceneWindows(steps, clips, configScenes, 300);
    const { steps: adjusted, sceneStepIndices } = injectPadding(steps, windows);

    // Scene 0 has deficit, so padding should be applied
    // Scene 0 starts at step 0, scene 1 may shift if wait step was inserted
    expect(sceneStepIndices[0]).toBe(0);
    expect(adjusted.length).toBeGreaterThanOrEqual(steps.length);
  });

  it("adds delay to existing wait step instead of inserting new", () => {
    const steps: Step[] = [
      click(),
      wait(100), // last in scene 0 window — should get padded
    ];

    const configScenes = [{ narration: "narration", stepIndex: 0 }];
    const clips: NarrationClipInfo[] = [
      { sceneIndex: 0, narration: "narration", audioDurationMs: 3000, gapAfterMs: 300 },
    ];

    const windows = buildSceneWindows(steps, clips, configScenes, 300);
    const { steps: adjusted } = injectPadding(steps, windows);

    // The wait step should have been increased, not a new step added
    const waitStep = adjusted[1] as Extract<Step, { action: "wait" }>;
    expect(waitStep.action).toBe("wait");
    expect(waitStep.ms).toBeGreaterThan(100);
    // No new step inserted because wait was padded directly
    expect(adjusted.length).toBe(steps.length);
  });

  it("inserts new wait step when last step doesn't support delayAfterMs", () => {
    const steps: Step[] = [
      goto(), // goto doesn't have delayAfterMs in the schema
    ];

    const configScenes = [{ narration: "long", stepIndex: 0 }];
    const clips: NarrationClipInfo[] = [
      { sceneIndex: 0, narration: "long", audioDurationMs: 5000, gapAfterMs: 300 },
    ];

    const windows = buildSceneWindows(steps, clips, configScenes, 300);
    const { steps: adjusted } = injectPadding(steps, windows);

    // Should have inserted a wait step after goto
    expect(adjusted.length).toBe(2);
    expect(adjusted[1].action).toBe("wait");
  });
});

describe("syncNarration", () => {
  it("off mode returns steps unchanged", () => {
    const steps: Step[] = [click(), click()];
    const scenes = [{ narration: "test", stepIndex: 0 }];
    const clips: NarrationClipInfo[] = [
      { sceneIndex: 0, narration: "test", audioDurationMs: 5000, gapAfterMs: 300 },
    ];

    const result = syncNarration({
      steps,
      scenes,
      clips,
      config: { ...defaultSyncConfig, narrationSyncMode: "off" },
    });

    expect(result.steps).toEqual(steps);
    expect(result.hasOverflow).toBe(true); // report shows deficit
  });

  it("strict mode throws when deficit exists", () => {
    const steps: Step[] = [click()];
    const scenes = [{ narration: "test", stepIndex: 0 }];
    const clips: NarrationClipInfo[] = [
      { sceneIndex: 0, narration: "test", audioDurationMs: 5000, gapAfterMs: 300 },
    ];

    expect(() =>
      syncNarration({
        steps,
        scenes,
        clips,
        config: { ...defaultSyncConfig, narrationSyncMode: "strict" },
      }),
    ).toThrow(/Narration sync failed/);
  });

  it("auto mode adds padding to eliminate deficit", () => {
    const steps: Step[] = [click(), wait(500), click()];
    const scenes = [
      { narration: "scene 0", stepIndex: 0 },
      { narration: "scene 1", stepIndex: 2 },
    ];
    const clips: NarrationClipInfo[] = [
      { sceneIndex: 0, narration: "scene 0", audioDurationMs: 3000, gapAfterMs: 300 },
      { sceneIndex: 1, narration: "scene 1", audioDurationMs: 2000, gapAfterMs: 0 },
    ];

    const result = syncNarration({
      steps,
      scenes,
      clips,
      config: defaultSyncConfig,
    });

    expect(result.report.appliedPadMs).toBeGreaterThan(0);
    expect(result.sceneStepIndices).toHaveLength(2);
  });

  it("correctly handles the user's real example: scenes at stepIndex 4 and 6", () => {
    // 10 steps, config scenes at stepIndex 4 and 6
    // Scene 0 (stepIndex 4): owns steps 4 and 5
    // Scene 1 (stepIndex 6): owns steps 6-9
    const steps: Step[] = [
      wait(2000), // 0
      wait(2000), // 1
      wait(2000), // 2
      wait(2000), // 3
      wait(500), // 4 — scene at stepIndex 4
      wait(500), // 5 — included in scene 0 window
      wait(2000), // 6 — scene at stepIndex 6
      wait(2000), // 7
      wait(2000), // 8
      wait(2000), // 9
    ];

    const configScenes = [
      { narration: "scene A", stepIndex: 4 },
      { narration: "scene B", stepIndex: 6 },
    ];

    const clips: NarrationClipInfo[] = [
      { sceneIndex: 0, narration: "scene A", audioDurationMs: 4000, gapAfterMs: 500 },
      { sceneIndex: 1, narration: "scene B", audioDurationMs: 3000, gapAfterMs: 0 },
    ];

    const windows = buildSceneWindows(steps, clips, configScenes, 300);

    // Scene 0 window: steps[4..5] = wait(500) + wait(500) = 1000ms
    // Required: 4000 + max(300, 500) = 4500ms
    // Deficit: 4500 - 1000 = 3500ms
    expect(windows[0].startStep).toBe(4);
    expect(windows[0].endStep).toBe(6);
    expect(windows[0].estimatedDurationMs).toBe(1000);
    expect(windows[0].deficitMs).toBe(3500);

    // Scene 1 window: steps[6..9] = 4 * 2000 = 8000ms
    // Required: 3000 + 300 = 3300ms
    // No deficit
    expect(windows[1].startStep).toBe(6);
    expect(windows[1].endStep).toBe(10);
    expect(windows[1].estimatedDurationMs).toBe(8000);
    expect(windows[1].deficitMs).toBe(0);
  });

  it("detects overflow when deficit exceeds maxAutoPadMs", () => {
    const steps: Step[] = [wait(100)];
    const scenes = [{ narration: "huge", stepIndex: 0 }];
    const clips: NarrationClipInfo[] = [
      { sceneIndex: 0, narration: "huge", audioDurationMs: 10000, gapAfterMs: 300 },
    ];

    const result = syncNarration({
      steps,
      scenes,
      clips,
      config: { ...defaultSyncConfig, maxAutoPadMs: 1000 },
    });

    expect(result.hasOverflow).toBe(true);
    expect(result.report.overflowScenes).toContain(0);
  });

  it("strict mode throws on overflow", () => {
    const steps: Step[] = [wait(100)];
    const scenes = [{ narration: "huge", stepIndex: 0 }];
    const clips: NarrationClipInfo[] = [
      { sceneIndex: 0, narration: "huge", audioDurationMs: 10000, gapAfterMs: 300 },
    ];

    expect(() =>
      syncNarration({
        steps,
        scenes,
        clips,
        config: {
          narrationSyncMode: "strict",
          narrationGapMs: 300,
          maxAutoPadMs: 1000,
          maxSyncPasses: 2,
        },
      }),
    ).toThrow(/strict/);
  });
});
