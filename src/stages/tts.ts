import { existsSync, mkdirSync, readFileSync } from "fs";
import { basename, dirname, extname, join, resolve } from "path";
import type { Stage } from "../pipeline/types.js";
import type { PipelineContext } from "../pipeline/context.js";
import type { DemoReelConfig } from "../schemas.js";
import { getNarrationManifestPath } from "../narration-manifest.js";
import { narrationManifestSchema, NARRATION_PROCESSING_VERSION } from "../narration-manifest.js";
import type { VoiceConfigOverrides } from "../voice-config.js";

function getAudioPath(config: DemoReelConfig): string {
  if (config.outputPath) {
    const outputPath = config.outputPath.startsWith("/")
      ? config.outputPath
      : resolve(config.outputPath);
    const ext = extname(outputPath);
    return join(dirname(outputPath), `${basename(outputPath, ext)}-narration.mp3`);
  }

  const outputDir = config.outputDir ? resolve(config.outputDir) : resolve("./output");
  const name = config.name ?? "demo";
  return join(outputDir, `${name}-narration.mp3`);
}

function getNarratedScenesInPlaybackOrder(config: DemoReelConfig) {
  return (config.scenes ?? [])
    .map((scene, index) => ({ scene, index }))
    .filter(({ scene }) => Boolean(scene.narration))
    .sort((left, right) => {
      const stepIndexDiff = left.scene.stepIndex - right.scene.stepIndex;
      return stepIndexDiff !== 0 ? stepIndexDiff : left.index - right.index;
    })
    .map(({ scene, index }) => ({ scene, index }));
}

function shouldRegenerateNarrationArtifacts(audioPath: string, manifestPath: string): boolean {
  if (!existsSync(audioPath) || !existsSync(manifestPath)) {
    return true;
  }

  try {
    const manifest = narrationManifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf-8")));
    return manifest.processingVersion !== NARRATION_PROCESSING_VERSION;
  } catch {
    return true;
  }
}

export class TTSStage implements Stage {
  readonly name = "TTS";

  async run(ctx: PipelineContext): Promise<void> {
    const hasVoice = Boolean(ctx.config.voice);
    const hasNarration = (ctx.config.scenes ?? []).some((s) => Boolean(s.narration));
    const hasNarrationAudio = Boolean(
      ctx.config.audio?.narration || ctx.config.audio?.narrationManifest,
    );
    if (!hasVoice || !hasNarration || hasNarrationAudio) return;

    const name = ctx.config.name ?? "demo";
    const narratedScenes = getNarratedScenesInPlaybackOrder(ctx.config);
    const audioPath = getAudioPath(ctx.config);
    const manifestPath = getNarrationManifestPath(audioPath);
    ctx.audioPath = audioPath;
    ctx.narrationManifestPath = manifestPath;
    mkdirSync(dirname(audioPath), { recursive: true });

    if (!shouldRegenerateNarrationArtifacts(audioPath, manifestPath)) {
      const raw = JSON.parse(readFileSync(manifestPath, "utf-8"));
      ctx.narrationManifest = narrationManifestSchema.parse(raw);
      if (ctx.verbose) console.log("  Using cached narration audio");
      return;
    }

    if (ctx.verbose) console.log("  Generating voiceover...");

    const { generateVoiceSegments, generateNarrationAudio } = await import(
      "../script/tts.js"
    );
    const { resolveVoiceConfig } = await import("../voice-config.js");

    const resolvedVoice = resolveVoiceConfig(ctx.config.voice as VoiceConfigOverrides);

    const script = {
      title: name,
      description: "auto-generated",
      url: "https://placeholder.local",
      scenes: narratedScenes.map(({ scene, index }) => ({
        narration: scene.narration,
        stepIndex: scene.stepIndex,
        sourceSceneIndex: index,
        steps: [{ action: "wait" as const, ms: 0 }],
      })),
      voice: resolvedVoice,
    };

    const segments = await generateVoiceSegments(script, resolvedVoice, {
      verbose: ctx.verbose,
    });
    await generateNarrationAudio(segments, audioPath, { verbose: ctx.verbose });

    const rawManifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    ctx.narrationManifest = narrationManifestSchema.parse(rawManifest);
  }
}
