type NarrationScenes = ReadonlyArray<{ narration: string }> | undefined;

interface NarrationAudioSource {
  narration?: string;
  narrationManifest?: string;
}

interface NarrationInputs {
  voice?: unknown;
  scenes?: NarrationScenes;
  audio?: NarrationAudioSource;
}

/** True when at least one scene carries narration text. */
export function hasNarratedScenes(scenes: NarrationScenes): boolean {
  return (scenes ?? []).some((scene) => Boolean(scene.narration));
}

/** True when the config points at pre-rendered narration instead of asking TTS for it. */
export function hasNarrationSource(audio: NarrationAudioSource | undefined): boolean {
  return Boolean(audio?.narration || audio?.narrationManifest);
}

/**
 * Single owner of the "should the pipeline generate narration?" rule.
 *
 * The stage and the CLI used to ask this question with separate copies of the
 * same three conditions, which drift the moment one of them learns a new way
 * to supply audio.
 */
export function needsGeneratedNarration(config: NarrationInputs): boolean {
  return (
    Boolean(config.voice) && hasNarratedScenes(config.scenes) && !hasNarrationSource(config.audio)
  );
}
