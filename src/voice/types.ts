import type { VoiceConfig } from "../voice-config.js";

export interface TTSProvider {
  readonly name: string;
  generate(text: string, options: VoiceConfig): Promise<{ audio: Buffer; durationMs: number }>;
}

export interface VoiceSegment {
  sceneIndex: number;
  stepIndex?: number;
  sourceSceneIndex?: number;
  narration: string;
  audio: Buffer;
  durationMs: number;
}
