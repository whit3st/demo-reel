import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  placeNarrationClips,
  planVideoTime,
  resolveNarrationOverlaps,
  sceneToVideoMs,
  type NarrationClipPlacementInput,
  type VideoTimeMapping,
} from "../src/narration-placement.js";
import {
  adjustedSceneStepIndices,
  injectPadding,
  type SceneWindow,
} from "../src/narration-sync.js";
import type { NarrationPlacement } from "../src/ffmpeg/utils.js";
import type { SceneTimestamp } from "../src/runner/types.js";
import type { Step } from "../src/schemas.js";

const mapping = (originMs: number, scale: number): VideoTimeMapping => ({ originMs, scale });

const placement = (
  sceneIndex: number,
  startMs: number,
  durationMs: number,
): NarrationPlacement => ({
  sceneIndex,
  narration: `line ${sceneIndex}`,
  clipPath: `/clips/${sceneIndex}.mp3`,
  startMs,
  endMs: startMs + durationMs,
});

const sortedByStart = (placements: NarrationPlacement[]): NarrationPlacement[] =>
  [...placements].sort((a, b) => a.startMs - b.startMs || a.sceneIndex - b.sceneIndex);

describe("resolveNarrationOverlaps (properties)", () => {
  it("auto mode leaves no overlaps and preserves every clip's duration", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            sceneIndex: fc.integer({ min: 0, max: 20 }),
            startMs: fc.integer({ min: 0, max: 100_000 }),
            durationMs: fc.integer({ min: 0, max: 20_000 }),
          }),
          { maxLength: 30 },
        ),
        (specs) => {
          const input = sortedByStart(
            specs.map((spec) => placement(spec.sceneIndex, spec.startMs, spec.durationMs)),
          );
          const original = input.map((p) => ({ ...p }));

          const { placements } = resolveNarrationOverlaps(input, "auto");

          expect(placements).toHaveLength(input.length);
          for (let i = 1; i < placements.length; i++) {
            expect(placements[i].startMs).toBeGreaterThanOrEqual(placements[i - 1].endMs);
          }
          for (let i = 0; i < placements.length; i++) {
            expect(placements[i].endMs - placements[i].startMs).toBe(
              original[i].endMs - original[i].startMs,
            );
            expect(placements[i].startMs).toBeGreaterThanOrEqual(original[i].startMs);
          }
          // Pure: the caller's placements are never rewritten.
          expect(input).toEqual(original);
        },
      ),
    );
  });

  it("off mode never changes a placement", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            sceneIndex: fc.integer({ min: 0, max: 10 }),
            startMs: fc.integer({ min: 0, max: 10_000 }),
            durationMs: fc.integer({ min: 0, max: 5_000 }),
          }),
          { maxLength: 10 },
        ),
        (specs) => {
          const input = sortedByStart(
            specs.map((spec) => placement(spec.sceneIndex, spec.startMs, spec.durationMs)),
          );

          expect(resolveNarrationOverlaps(input, "off").placements).toEqual(input);
        },
      ),
    );
  });

  it("strict mode accepts exactly the inputs auto mode would not move", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            sceneIndex: fc.integer({ min: 0, max: 10 }),
            startMs: fc.integer({ min: 0, max: 10_000 }),
            durationMs: fc.integer({ min: 0, max: 5_000 }),
          }),
          { maxLength: 10 },
        ),
        (specs) => {
          const input = sortedByStart(
            specs.map((spec) => placement(spec.sceneIndex, spec.startMs, spec.durationMs)),
          );
          const auto = resolveNarrationOverlaps(input, "auto").placements;
          const moved = auto.some((p, i) => p.startMs !== input[i].startMs);

          if (moved) {
            expect(() => resolveNarrationOverlaps(input, "strict")).toThrow(/Narration overlap/);
          } else {
            expect(resolveNarrationOverlaps(input, "strict").placements).toEqual(input);
          }
        },
      ),
    );
  });
});

describe("placeNarrationClips (properties)", () => {
  it("places every resolvable clip at its scene's mapped position", () => {
    fc.assert(
      fc.property(
        fc.record({
          originMs: fc.integer({ min: 0, max: 10_000 }),
          scale: fc.double({ min: 0.25, max: 4, noNaN: true }),
        }),
        fc.integer({ min: 0, max: 2_000 }),
        fc.array(fc.integer({ min: 0, max: 9 }), { maxLength: 10 }),
        (mappingSpec, delayMs, sceneIndices) => {
          const uniqueScenes = [...new Set(sceneIndices)].sort((a, b) => a - b);
          const timestamps: SceneTimestamp[] = uniqueScenes.map((sceneIndex) => ({
            sceneIndex,
            narration: `line ${sceneIndex}`,
            isIntro: false,
            startMs: sceneIndex * 1_000,
            endMs: sceneIndex * 1_000 + 900,
          }));
          const clips: NarrationClipPlacementInput[] = uniqueScenes.map((sceneIndex) => ({
            sceneIndex,
            narration: `line ${sceneIndex}`,
            clipPath: `/clips/${sceneIndex}.mp3`,
            audioDurationMs: 500,
          }));

          const videoTime = mapping(mappingSpec.originMs, mappingSpec.scale);
          const { placements, warnings } = placeNarrationClips(
            clips,
            timestamps,
            videoTime,
            delayMs,
          );

          expect(warnings).toHaveLength(0);
          expect(placements).toHaveLength(clips.length);
          for (let i = 0; i < placements.length; i++) {
            expect(placements[i].startMs).toBe(
              sceneToVideoMs(videoTime, timestamps[i].startMs) + delayMs,
            );
            expect(placements[i].endMs - placements[i].startMs).toBe(500);
            if (i > 0) {
              expect(placements[i].startMs).toBeGreaterThanOrEqual(placements[i - 1].startMs);
            }
          }
        },
      ),
    );
  });

  it("warns once for every clip whose scene was never recorded", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 20 }), { maxLength: 20 }), (sceneIndices) => {
        const clips: NarrationClipPlacementInput[] = sceneIndices.map((sceneIndex) => ({
          sceneIndex,
          narration: `line ${sceneIndex}`,
          clipPath: `/clips/${sceneIndex}.mp3`,
          audioDurationMs: 500,
        }));

        const { placements, warnings } = placeNarrationClips(clips, [], mapping(0, 1), 0);

        expect(placements).toHaveLength(0);
        expect(warnings).toHaveLength(clips.length);
      }),
    );
  });
});

describe("planVideoTime (properties)", () => {
  it("warns about a failed probe even when the thrown value is undefined", () => {
    const plan = planVideoTime({
      recordedMs: undefined,
      measurementFailed: true,
      measurementError: undefined,
      stepClockMs: 1000,
      trimming: false,
    });

    expect(plan.warnings[0]).toContain("Could not measure recorded video duration");
    expect(plan.warnings[0]).toContain("undefined");
  });

  it("never produces a negative origin and only trims when asked", () => {
    fc.assert(
      fc.property(
        fc.option(fc.integer({ min: 0, max: 200_000 }), { nil: undefined }),
        fc.integer({ min: 0, max: 200_000 }),
        fc.option(
          fc.record({
            preRollMs: fc.integer({ min: 0, max: 50_000 }),
            tailMs: fc.integer({ min: 0, max: 50_000 }),
          }),
          { nil: undefined },
        ),
        fc.boolean(),
        (recordedMs, stepClockMs, timeline, trimming) => {
          const plan = planVideoTime({
            recordedMs,
            stepClockMs,
            timeline,
            trimming,
          });

          expect(plan.mapping.originMs).toBeGreaterThanOrEqual(0);
          expect(plan.mapping.scale).toBeGreaterThan(0);
          if (plan.trim) {
            expect(trimming).toBe(true);
            expect(plan.trim.startMs).toBeGreaterThanOrEqual(0);
            expect(plan.trim.durationMs).toBeGreaterThan(0);
          }
          for (const warning of plan.warnings) {
            expect(warning.length).toBeGreaterThan(0);
          }
        },
      ),
    );
  });
});

describe("injectPadding (properties)", () => {
  const wait = (ms: number): Step => ({ action: "wait", ms });
  const goto = (): Step => ({ action: "goto", url: "https://example.com" });

  it("keeps every remapped scene index inside the padded steps and non-decreasing", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 5_000 }), { minLength: 2, maxLength: 30 }),
        fc.array(fc.integer({ min: 0, max: 10 }), { maxLength: 10 }),
        (waitTimes, gaps) => {
          // Alternate wait and goto: gotos cannot grow delayAfterMs, so some
          // windows must insert a whole step and exercise the remap path.
          const steps = waitTimes.map((ms, index) => (index % 2 === 0 ? wait(ms) : goto()));
          // Build strictly increasing window starts with at least one step each.
          const starts = [...new Set([0, ...gaps.map((gap) => gap % steps.length)])].sort(
            (a, b) => a - b,
          );
          const windows: SceneWindow[] = starts.map((startStep, i) => {
            const endStep = i + 1 < starts.length ? starts[i + 1] : steps.length;
            return {
              sceneIndex: i,
              startStep,
              endStep,
              steps: steps.slice(startStep, endStep),
              estimatedDurationMs: 0,
              narrationDurationMs: 10_000,
              requiredMs: 10_000,
              deficitMs: 10_000,
            };
          });
          const scenes = [
            ...starts.map((stepIndex) => ({ stepIndex })),
            // Scenes between windows and after the last one must remap too.
            ...gaps.map((gap) => ({ stepIndex: gap % steps.length })),
          ].sort((a, b) => a.stepIndex - b.stepIndex);
          const originalSteps = JSON.stringify(steps);

          const padded = injectPadding(steps, windows);
          const indices = adjustedSceneStepIndices(scenes, padded.adjustments);

          expect(JSON.stringify(steps)).toBe(originalSteps);
          expect(padded.steps.length).toBeGreaterThanOrEqual(steps.length);
          for (let i = 0; i < indices.length; i++) {
            expect(indices[i]).toBeLessThanOrEqual(padded.steps.length);
            if (i > 0) expect(indices[i]).toBeGreaterThanOrEqual(indices[i - 1]);
          }
        },
      ),
    );
  });
});
