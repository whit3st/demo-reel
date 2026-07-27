import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
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

/**
 * Fingerprint the inputs the narration audio is derived from: which scenes are
 * narrated, where they sit, what they say, and in which voice. Anything that
 * would change the audio or the clip-to-scene mapping has to be in here.
 */
export function narrationInputsHash(
  narratedScenes: ReadonlyArray<{ scene: { narration: string; stepIndex: number }; index: number }>,
  resolvedVoice: unknown,
): string {
  const inputs = {
    voice: resolvedVoice,
    scenes: narratedScenes.map(({ scene, index }) => ({
      index,
      stepIndex: scene.stepIndex,
      narration: scene.narration,
    })),
  };
  return createHash("sha256").update(JSON.stringify(inputs)).digest("hex");
}

function shouldRegenerateNarrationArtifacts(
  audioPath: string,
  manifestPath: string,
  inputsHash: string,
): boolean {
  if (!existsSync(audioPath) || !existsSync(manifestPath)) {
    return true;
  }

  try {
    const manifest = narrationManifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf-8")));
    if (manifest.processingVersion !== NARRATION_PROCESSING_VERSION) {
      return true;
    }
    // Checking the file exists is not enough: the manifest maps clips onto
    // scene indices, so editing the scene list leaves a cache that describes a
    // config that no longer exists. Reusing it produced narration attached to
    // the wrong scenes, or a hard crash in narration sync when the manifest
    // named more scenes than remained.
    return manifest.inputsHash !== inputsHash;
  } catch {
    return true;
  }
}

export class TTSStage implements Stage {
  readonly name = "TTS";

  async run(ctx: PipelineContext): Promise<void> {
    // Runs on dry runs too. A dry run produces no video, but NarrationSyncStage
    // needs this stage's clip durations to decide how much to pad each scene —
    // without them a dry run cannot tell whether the narration fits, which is
    // half of what it is asked to predict. Clips are cached by content hash, so
    // a dry run pays for TTS once per narration edit and the real run that
    // follows reuses the same audio.
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

    // Resolve the voice before the cache check — it is part of the cache key,
    // since the same text in a different voice is different audio.
    const { resolveVoiceConfig } = await import("../voice-config.js");
    const resolvedVoice = resolveVoiceConfig(ctx.config.voice as VoiceConfigOverrides);
    const inputsHash = narrationInputsHash(narratedScenes, resolvedVoice);

    if (!ctx.noCache && !shouldRegenerateNarrationArtifacts(audioPath, manifestPath, inputsHash)) {
      const raw = JSON.parse(readFileSync(manifestPath, "utf-8"));
      ctx.narrationManifest = narrationManifestSchema.parse(raw);
      if (ctx.verbose) console.log("  Using cached narration audio");
      return;
    }

    if (ctx.verbose) console.log("  Generating voiceover...");

    const { generateVoiceSegments, generateNarrationAudio } = await import("../script/tts.js");

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
      noCache: ctx.noCache,
    });
    await generateNarrationAudio(segments, audioPath, { verbose: ctx.verbose });

    // Stamp the cache key onto the manifest the generator just wrote. This
    // stage owns the caching decision, so it owns the key; generateNarrationAudio
    // stays unaware of it.
    const rawManifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    rawManifest.inputsHash = inputsHash;
    writeFileSync(manifestPath, JSON.stringify(rawManifest, null, 2) + "\n");
    ctx.narrationManifest = narrationManifestSchema.parse(rawManifest);
  }
}
