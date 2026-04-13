import { describe, expect, it } from "vitest";
import {
  getNarrationClipDir,
  getNarrationClipFileName,
  getNarrationManifestPath,
  narrationManifestSchema,
  NARRATION_PROCESSING_VERSION,
} from "../src/narration-manifest.js";

describe("narration-manifest", () => {
  it("builds manifest and clip paths from audio files", () => {
    expect(getNarrationManifestPath("/tmp/demo-narration.mp3")).toBe(
      "/tmp/demo-narration.manifest.json",
    );
    expect(getNarrationClipDir("/tmp/demo-narration.mp3")).toBe("/tmp/demo-narration-clips");
  });

  it("handles files with multiple dots in the name", () => {
    expect(getNarrationManifestPath("/tmp/demo.v1.narration.mp3")).toBe(
      "/tmp/demo.v1.narration.manifest.json",
    );
    expect(getNarrationClipDir("/tmp/demo.v1.narration.mp3")).toBe("/tmp/demo.v1.narration-clips");
  });

  it("handles audio paths without file extensions", () => {
    expect(getNarrationManifestPath("/tmp/demo-narration")).toBe(
      "/tmp/demo-narration.manifest.json",
    );
    expect(getNarrationClipDir("/tmp/demo-narration")).toBe("/tmp/demo-narration-clips");
  });

  it("zero-pads clip filenames", () => {
    expect(getNarrationClipFileName(0)).toBe("scene-000.mp3");
    expect(getNarrationClipFileName(12)).toBe("scene-012.mp3");
    expect(getNarrationClipFileName(1234)).toBe("scene-1234.mp3");
  });

  it("validates complete narration manifests", () => {
    const manifest = narrationManifestSchema.parse({
      version: 1,
      processingVersion: NARRATION_PROCESSING_VERSION,
      audioPath: "/tmp/demo-narration.mp3",
      clips: [
        {
          sceneIndex: 0,
          stepIndex: 2,
          narration: "Open dashboard",
          filePath: "/tmp/demo-narration-clips/scene-000.mp3",
          audioDurationMs: 1200,
          audioOffsetMs: 100,
          gapAfterMs: 200,
        },
      ],
    });

    expect(manifest.processingVersion).toBe(NARRATION_PROCESSING_VERSION);
    expect(manifest.clips[0]?.sceneIndex).toBe(0);
  });

  it("rejects empty clip lists", () => {
    expect(() =>
      narrationManifestSchema.parse({
        version: 1,
        processingVersion: NARRATION_PROCESSING_VERSION,
        clips: [],
      }),
    ).toThrow();
  });
});
