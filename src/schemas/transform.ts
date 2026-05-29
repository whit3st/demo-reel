import { z } from "zod";
import {
  resolveCursor,
  resolveMotion,
  resolveTyping,
  resolveTiming,
  resolveResolution,
  type CursorConfig,
  type MotionConfig,
  type TypingConfig,
  type TimingConfig,
  type SizeConfig,
} from "./primitives.js";
import type { Step } from "./steps.js";
import { demoReelConfigInputSchema, sceneOwnedSceneInputSchema } from "./scenes.js";

export interface RuntimeScene {
  narration: string;
  stepIndex: number;
  isIntro?: boolean;
}

export type DemoReelConfigInput = z.input<typeof demoReelConfigInputSchema>;

export interface DemoReelConfig extends Omit<
  DemoReelConfigInput,
  "steps" | "scenes" | "video" | "cursor" | "motion" | "typing" | "timing"
> {
  steps: Step[];
  scenes?: RuntimeScene[];
  video: { resolution: SizeConfig };
  cursor: CursorConfig;
  motion: MotionConfig;
  typing: TypingConfig;
  timing: TimingConfig;
  preSteps?: Step[];
  postSteps?: Step[];
}

export const demoReelConfigSchema = demoReelConfigInputSchema.transform((val): DemoReelConfig => {
  let normalizedSteps = val.steps;
  let normalizedScenes = val.scenes;

  if (val.scenes && val.scenes.length > 0 && "steps" in val.scenes[0]) {
    const sceneOwnedScenes = val.scenes as z.infer<typeof sceneOwnedSceneInputSchema>[];
    const flattenedSteps: Step[] = [];
    const runtimeScenes: RuntimeScene[] = [];
    let stepIndex = 0;

    for (let i = 0; i < sceneOwnedScenes.length; i++) {
      const scene = sceneOwnedScenes[i];
      runtimeScenes.push({
        narration: scene.narration,
        stepIndex,
        isIntro: scene.isIntro,
      });
      flattenedSteps.push(...scene.steps);
      stepIndex += scene.steps.length;
    }

    normalizedSteps = flattenedSteps;
    normalizedScenes = runtimeScenes;
  }

  return {
    ...val,
    steps: normalizedSteps!,
    scenes: normalizedScenes as RuntimeScene[] | undefined,
    video: {
      ...val.video,
      resolution: resolveResolution(val.video.resolution),
    },
    cursor: resolveCursor(val.cursor),
    motion: resolveMotion(val.motion),
    typing: resolveTyping(val.typing),
    timing: resolveTiming(val.timing),
    preSteps: val.setup || val.preSteps,
    postSteps: val.cleanup || val.postSteps,
  };
});
