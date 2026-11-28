import { type DemoReelConfig } from "../schemas.js";
import type { SceneTimestamp } from "./types.js";

export function buildSceneBoundaries(scenes: DemoReelConfig["scenes"]): Map<number, number> {
  const boundaries = new Map<number, number>();
  if (!scenes) return boundaries;
  for (let i = 0; i < scenes.length; i++) {
    boundaries.set(scenes[i].stepIndex, i);
  }
  return boundaries;
}

type RuntimeScenes = DemoReelConfig["scenes"];

/**
 * Single owner of scene-boundary bookkeeping.
 *
 * `runDemo` and the pure `buildSceneTimestamps` helper used to implement the
 * same open/close rules twice: one against a live clock and one against an
 * injected one. Keeping the rules here means the production runner and the
 * unit-tested helper cannot drift.
 */
export class SceneTracker {
  private current: { index: number; startMs: number } | null = null;

  constructor(
    private readonly scenes: RuntimeScenes,
    private readonly boundaries: Map<number, number>,
  ) {}

  /** Close the previous scene (if any) and open the one starting at `stepIdx`. */
  enter(stepIdx: number, nowMs: number): { sceneIndex: number; closed?: SceneTimestamp } | null {
    const sceneIndex = this.boundaries.get(stepIdx);
    if (sceneIndex === undefined || !this.scenes) return null;

    const closed = this.current ? this.timestampFor(this.current, nowMs) : undefined;
    this.current = { index: sceneIndex, startMs: nowMs };
    return closed ? { sceneIndex, closed } : { sceneIndex };
  }

  /** Close the scene that is still open when the run ends. */
  finish(nowMs: number): SceneTimestamp | undefined {
    if (!this.current || !this.scenes) return undefined;
    const timestamp = this.timestampFor(this.current, nowMs);
    this.current = null;
    return timestamp;
  }

  private timestampFor(scene: { index: number; startMs: number }, endMs: number): SceneTimestamp {
    const source = this.scenes![scene.index];
    return {
      sceneIndex: scene.index,
      narration: source.narration,
      isIntro: source.isIntro ?? false,
      startMs: scene.startMs,
      endMs,
    };
  }
}

export function buildSceneTimestamps(
  scenes: RuntimeScenes,
  sceneBoundaries: Map<number, number>,
  steps: DemoReelConfig["steps"],
  nowProvider: () => number,
  recordingStart: number,
): SceneTimestamp[] {
  const tracker = new SceneTracker(scenes, sceneBoundaries);
  const timestamps: SceneTimestamp[] = [];

  for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
    const boundary = tracker.enter(stepIdx, nowProvider() - recordingStart);
    if (boundary?.closed) timestamps.push(boundary.closed);
  }

  const final = tracker.finish(nowProvider() - recordingStart);
  if (final) timestamps.push(final);

  return timestamps;
}
