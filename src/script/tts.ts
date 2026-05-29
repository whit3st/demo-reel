import { mkdir, writeFile, stat } from "fs/promises";
import { join, dirname, relative } from "path";
import type { DemoScript, TimedScene } from "./types.js";
import { type VoiceConfig } from "../voice-config.js";
import {
  getNarrationClipDir,
  getNarrationClipFileName,
  getNarrationManifestPath,
  NARRATION_PROCESSING_VERSION,
  type NarrationManifest,
} from "../narration-manifest.js";

import {
  runFFmpeg,
  runFfprobe,
  measureAudioDuration,
  wavToMp3,
  generateSilence,
  concatenateAudio,
  getFfmpegPath,
} from "../ffmpeg/utils.js";

export { runFFmpeg, runFfprobe, measureAudioDuration, wavToMp3, generateSilence, concatenateAudio };

export const getFFmpegPath = getFfmpegPath;

export async function getFFprobePath(ffmpegPath?: string): Promise<string> {
  if (ffmpegPath) {
    const adjacent = ffmpegPath.replace(/ffmpeg([^/\\]*)$/, "ffprobe$1");
    try {
      await stat(adjacent);
      return adjacent;
    } catch {
      return "ffprobe";
    }
  }
  const { getFfprobePath } = await import("../ffmpeg/utils.js");
  return getFfprobePath();
}

export type { TTSProvider } from "../voice/types.js";

import { registerTTSProvider, getTTSProvider } from "../voice/index.js";
export { registerTTSProvider, getTTSProvider };

import { piperProvider } from "../voice/piper.js";
import { openaiProvider } from "../voice/openai.js";
import { elevenlabsProvider } from "../voice/elevenlabs.js";

registerTTSProvider(piperProvider);
registerTTSProvider(openaiProvider);
registerTTSProvider(elevenlabsProvider);

import { cacheKey, getCached, setCache } from "../voice/cache.js";

import type { VoiceSegment } from "../voice/types.js";

export function applyPronunciation(text: string, pronunciation?: Record<string, string>): string {
  if (!pronunciation) return text;
  let result = text;
  for (const [word, replacement] of Object.entries(pronunciation)) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    result = result.replace(regex, replacement);
  }
  return result;
}

export async function generateVoiceSegments(
  script: DemoScript,
  voice: VoiceConfig,
  options: { noCache?: boolean; verbose?: boolean } = {},
): Promise<VoiceSegment[]> {
  const provider = getTTSProvider(voice.provider);
  const segments: VoiceSegment[] = [];

  for (let i = 0; i < script.scenes.length; i++) {
    const scene = script.scenes[i];
    const key = cacheKey(scene.narration, voice);

    if (!options.noCache) {
      const cached = await getCached(key);
      if (cached) {
        const durationMs = await measureAudioDuration(cached);
        if (options.verbose)
          console.log(`  Scene ${i + 1}: cached (${(durationMs / 1000).toFixed(1)}s)`);
        segments.push({
          sceneIndex: i,
          stepIndex: scene.stepIndex,
          sourceSceneIndex: scene.sourceSceneIndex ?? i,
          narration: scene.narration,
          audio: cached,
          durationMs,
        });
        continue;
      }
    }

    if (options.verbose) console.log(`  Scene ${i + 1}: generating voice...`);

    const ttsText = applyPronunciation(scene.narration, voice.pronunciation);
    const generated = await provider.generate(ttsText, voice);
    const { audio, durationMs } = generated;
    await setCache(key, audio);
    if (options.verbose) console.log(`  Scene ${i + 1}: ${(durationMs / 1000).toFixed(1)}s`);

    segments.push({
      sceneIndex: i,
      stepIndex: scene.stepIndex,
      sourceSceneIndex: scene.sourceSceneIndex ?? i,
      narration: scene.narration,
      audio,
      durationMs,
    });
  }

  return segments;
}

export async function generateNarrationAudio(
  segments: VoiceSegment[],
  outputPath: string,
  options: { gapMs?: number; verbose?: boolean } = {},
): Promise<{ timedScenes: TimedScene[]; narrationManifestPath: string }> {
  const gapMs = options.gapMs ?? 800;
  await mkdir(dirname(outputPath), { recursive: true });
  const clipDir = getNarrationClipDir(outputPath);
  const narrationManifestPath = getNarrationManifestPath(outputPath);
  await mkdir(clipDir, { recursive: true });

  const timedScenes: TimedScene[] = [];
  const manifest: NarrationManifest = {
    version: 1,
    processingVersion: NARRATION_PROCESSING_VERSION,
    audioPath: relative(dirname(narrationManifestPath), outputPath),
    clips: [],
  };
  let currentOffsetMs = 0;
  const concatSegments: { audio: Buffer; gapAfterMs: number }[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const isLast = i === segments.length - 1;
    const gap = isLast ? 0 : gapMs;
    const sourceSceneIndex = seg.sourceSceneIndex ?? seg.sceneIndex;
    const clipPath = join(clipDir, getNarrationClipFileName(sourceSceneIndex));
    await writeFile(clipPath, seg.audio);

    timedScenes.push({
      narration: seg.narration,
      steps: [],
      stepIndex: seg.stepIndex,
      sourceSceneIndex,
      audioDurationMs: seg.durationMs,
      audioOffsetMs: currentOffsetMs,
      gapAfterMs: gap,
    });

    manifest.clips.push({
      sceneIndex: sourceSceneIndex,
      stepIndex: seg.stepIndex,
      narration: seg.narration,
      filePath: relative(dirname(narrationManifestPath), clipPath),
      audioDurationMs: seg.durationMs,
      audioOffsetMs: currentOffsetMs,
      gapAfterMs: gap,
    });

    concatSegments.push({ audio: seg.audio, gapAfterMs: gap });
    currentOffsetMs += seg.durationMs + gap;
  }

  const concatenated = await concatenateAudio(concatSegments);
  await writeFile(outputPath, concatenated);
  await writeFile(narrationManifestPath, JSON.stringify(manifest, null, 2), "utf-8");

  if (options.verbose) {
    console.log(`Narration audio: ${outputPath} (${(currentOffsetMs / 1000).toFixed(1)}s)`);
    console.log(`Narration manifest: ${narrationManifestPath}`);
  }

  return { timedScenes, narrationManifestPath };
}
