import { extname } from "path";
import { z } from "zod";

export const NARRATION_PROCESSING_VERSION = "v5-no-volume-normalization";

export const narrationManifestClipSchema = z.object({
  sceneIndex: z.number().int().min(0),
  stepIndex: z.number().int().min(0).optional(),
  narration: z.string().min(1),
  filePath: z.string().min(1),
  audioDurationMs: z.number().int().min(0),
  audioOffsetMs: z.number().int().min(0).optional(),
  gapAfterMs: z.number().int().min(0).optional(),
});

export const narrationManifestSchema = z.object({
  version: z.literal(1),
  processingVersion: z.string().min(1),
  audioPath: z.string().min(1).optional(),
  clips: z.array(narrationManifestClipSchema).min(1),
});

export type NarrationManifestClip = z.infer<typeof narrationManifestClipSchema>;
export type NarrationManifest = z.infer<typeof narrationManifestSchema>;

function stripExtension(filePath: string): string {
  const extension = extname(filePath);
  return extension ? filePath.slice(0, -extension.length) : filePath;
}

export function getNarrationManifestPath(audioPath: string): string {
  return `${stripExtension(audioPath)}.manifest.json`;
}

export function getNarrationClipDir(audioPath: string): string {
  return `${stripExtension(audioPath)}-clips`;
}

export function getNarrationClipFileName(sceneIndex: number): string {
  return `scene-${String(sceneIndex).padStart(3, "0")}.mp3`;
}
