import type { NarrationPlacement, VideoTrim } from "./ffmpeg/utils.js";
import type { SceneTimestamp } from "./runner/types.js";

/**
 * Where the scene clock sits inside the recording.
 *
 * Both are wall-clock measurements taken by the pipeline: `preRollMs` between
 * the recording context opening and the first scene starting, `tailMs` between
 * the last scene ending and the recording stopping.
 */
export interface RecordingTimeline {
  preRollMs: number;
  tailMs: number;
}

/** Maps a step-clock offset onto the finished video's timeline. */
export interface VideoTimeMapping {
  originMs: number;
  scale: number;
}

export const sceneToVideoMs = (mapping: VideoTimeMapping, sceneMs: number): number =>
  mapping.originMs + Math.round(sceneMs * mapping.scale);

export interface VideoTimePlanInput {
  /** Measured duration, or undefined when the probe failed. */
  recordedMs?: number;
  /** True when the probe threw, even if the thrown value was falsy. */
  measurementFailed?: boolean;
  /** Why the probe failed; only used to explain the fallback. */
  measurementError?: unknown;
  stepClockMs: number;
  timeline?: RecordingTimeline;
  /** Whether the caller will cut the pre-roll and tail away. */
  trimming: boolean;
}

export interface VideoTimePlan {
  mapping: VideoTimeMapping;
  trim?: VideoTrim;
  warnings: string[];
}

/**
 * Decide how step-clock offsets map onto the recorded video.
 *
 * Pure: every input is a measurement the shell took, every output is data or a
 * warning string. Kept out of `processVideoWithAudio` because this arithmetic
 * is what decides whether narration drifts seconds out of sync by the end of a
 * long demo.
 */
export function planVideoTime(input: VideoTimePlanInput): VideoTimePlan {
  const { recordedMs, measurementFailed, measurementError, stepClockMs, timeline, trimming } =
    input;
  const warnings: string[] = [];

  if (recordedMs === undefined) {
    if (measurementFailed) {
      warnings.push(
        `Could not measure recorded video duration, narration placed on the step clock and may drift: ${
          measurementError instanceof Error ? measurementError.message : String(measurementError)
        }`,
      );
    }
    return {
      mapping: timeline
        ? { originMs: Math.max(0, timeline.preRollMs), scale: 1 }
        : { originMs: 0, scale: 1 },
      warnings,
    };
  }

  if (stepClockMs > 0 && recordedMs > 0) {
    if (timeline) {
      const sceneSpanMs = recordedMs - timeline.preRollMs - timeline.tailMs;
      // A pre-roll and tail that swallow the whole recording means the
      // measurement is wrong; scaling by it would place every cue at a
      // negative offset. Fall back to real time and say nothing more than the
      // scale warning below already says.
      const scale = sceneSpanMs > 0 ? sceneSpanMs / stepClockMs : 1;
      // When the pre-roll is being cut away the first scene lands at zero, so
      // cues must not also be pushed forward by it — that would count the same
      // offset twice.
      if (trimming && sceneSpanMs > 0) {
        if (scale < 0.98 || scale > 1.02) {
          warnings.push(scaleWarning(Math.round(sceneSpanMs), stepClockMs, scale));
        }
        return {
          mapping: { originMs: 0, scale },
          trim: { startMs: timeline.preRollMs, durationMs: sceneSpanMs },
          warnings,
        };
      }

      if (scale < 0.98 || scale > 1.02) {
        warnings.push(scaleWarning(Math.round(sceneSpanMs), stepClockMs, scale));
      }
      return { mapping: { originMs: Math.max(0, timeline.preRollMs), scale }, warnings };
    }

    const timeScale = recordedMs / stepClockMs;
    const driftMs = Math.round(recordedMs - stepClockMs);
    if (Math.abs(driftMs) > 250) {
      warnings.push(
        `Recording ran ${driftMs}ms ${driftMs > 0 ? "longer" : "shorter"} than the step clock ` +
          `(${stepClockMs}ms); narration rescaled by ${timeScale.toFixed(4)} to stay in sync.`,
      );
    }
    return { mapping: { originMs: 0, scale: timeScale }, warnings };
  }

  return {
    mapping: timeline
      ? { originMs: Math.max(0, timeline.preRollMs), scale: 1 }
      : { originMs: 0, scale: 1 },
    warnings,
  };
}

function scaleWarning(sceneSpanMs: number, stepClockMs: number, scale: number): string {
  return (
    `Recorded scene span (${sceneSpanMs}ms) does not match the step clock ` +
    `(${stepClockMs}ms); narration scaled by ${scale.toFixed(4)}. The recording may ` +
    `have dropped frames or stalled.`
  );
}

export interface NarrationClipPlacementInput {
  sceneIndex: number;
  narration: string;
  clipPath: string;
  audioDurationMs: number;
}

/**
 * Place each narration clip at its scene's position on the video clock.
 *
 * Pure: the shell resolves paths and reads the manifest. Returns placements
 * sorted by start time (scene index breaks ties) plus any skipped-clip
 * warnings.
 */
export function placeNarrationClips(
  clips: readonly NarrationClipPlacementInput[],
  timestamps: readonly SceneTimestamp[],
  mapping: VideoTimeMapping,
  narrationDelayMs: number,
): { placements: NarrationPlacement[]; warnings: string[] } {
  const timestampsByScene = new Map(timestamps.map((scene) => [scene.sceneIndex, scene]));
  const warnings: string[] = [];

  const placements = clips
    .map((clip) => {
      const scene = timestampsByScene.get(clip.sceneIndex);
      if (!scene) {
        warnings.push(
          `No recorded scene timestamp for narration clip ${clip.sceneIndex} (${clip.narration.slice(0, 60)})`,
        );
        return null;
      }

      const startMs = sceneToVideoMs(mapping, scene.startMs) + narrationDelayMs;
      return {
        sceneIndex: clip.sceneIndex,
        narration: clip.narration,
        clipPath: clip.clipPath,
        startMs,
        endMs: startMs + clip.audioDurationMs,
      } satisfies NarrationPlacement;
    })
    .filter((placement): placement is NarrationPlacement => placement !== null)
    .sort((left, right) => left.startMs - right.startMs || left.sceneIndex - right.sceneIndex);

  return { placements, warnings };
}

/**
 * Resolve overlaps between placed clips according to the sync mode.
 *
 * `auto` shifts the later clip forward (and cascades); `strict` throws; `off`
 * leaves the recording as authored. Returns new objects rather than mutating
 * its input so callers can keep the pre-shift placements.
 */
export function resolveNarrationOverlaps(
  placements: readonly NarrationPlacement[],
  mode: string,
): { placements: NarrationPlacement[]; warnings: string[] } {
  const resolved = placements.map((placement) => ({ ...placement }));
  const warnings: string[] = [];

  for (let i = 1; i < resolved.length; i++) {
    const current = resolved[i];
    const previous = resolved[i - 1];
    if (current.startMs >= previous.endMs) continue;

    const overlapMs = previous.endMs - current.startMs;

    if (mode === "off") continue;

    if (mode === "strict") {
      throw new Error(
        `Narration overlap: scene ${current.sceneIndex} starts before scene ${previous.sceneIndex} narration ends (overlap: ${overlapMs}ms)`,
      );
    }

    current.startMs = previous.endMs;
    current.endMs += overlapMs;
    warnings.push(
      `Narration auto-shift: scene ${current.sceneIndex} pushed forward ${overlapMs}ms to avoid overlap with scene ${previous.sceneIndex}`,
    );
  }

  return { placements: resolved, warnings };
}
