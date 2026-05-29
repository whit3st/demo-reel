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

export function buildSceneTimestamps(
  scenes: DemoReelConfig["scenes"],
  sceneBoundaries: Map<number, number>,
  steps: DemoReelConfig["steps"],
  nowProvider: () => number,
  recordingStart: number,
): SceneTimestamp[] {
  const timestamps: SceneTimestamp[] = [];
  let currentScene: { index: number; startMs: number } | null = null;

  for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
    const sceneIdx = sceneBoundaries.get(stepIdx);
    if (sceneIdx !== undefined && scenes) {
      const now = nowProvider() - recordingStart;
      if (currentScene !== null) {
        const prevScene = scenes[currentScene.index];
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
  }

  if (currentScene !== null && scenes) {
    const finalScene = scenes[currentScene.index];
    timestamps.push({
      sceneIndex: currentScene.index,
      narration: finalScene.narration,
      isIntro: finalScene.isIntro ?? false,
      startMs: currentScene.startMs,
      endMs: nowProvider() - recordingStart,
    });
  }

  return timestamps;
}
