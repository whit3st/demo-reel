import { describe, expect, it } from "vitest";
import {
  hasNarrationSource,
  hasNarratedScenes,
  needsGeneratedNarration,
} from "../src/narration-plan.js";

const voice = { provider: "piper", voice: "en_US-amy-medium", speed: 1 } as const;

describe("narration plan", () => {
  it("detects scenes with narration text", () => {
    expect(hasNarratedScenes(undefined)).toBe(false);
    expect(hasNarratedScenes([])).toBe(false);
    expect(hasNarratedScenes([{ narration: "" }, { narration: "hello" }])).toBe(true);
  });

  it("treats a narration file or manifest as a pre-rendered source", () => {
    expect(hasNarrationSource(undefined)).toBe(false);
    expect(hasNarrationSource({})).toBe(false);
    expect(hasNarrationSource({ narration: "vo.mp3" })).toBe(true);
    expect(hasNarrationSource({ narrationManifest: "vo.manifest.json" })).toBe(true);
  });

  it("generates only for voiced, narrated configs without a pre-rendered source", () => {
    expect(
      needsGeneratedNarration({
        voice,
        scenes: [{ narration: "hello" }],
        audio: undefined,
      }),
    ).toBe(true);

    expect(needsGeneratedNarration({ voice: undefined, scenes: [{ narration: "hello" }] })).toBe(
      false,
    );
    expect(needsGeneratedNarration({ voice, scenes: [{ narration: "" }] })).toBe(false);
    expect(
      needsGeneratedNarration({
        voice,
        scenes: [{ narration: "hello" }],
        audio: { narration: "vo.mp3" },
      }),
    ).toBe(false);
  });
});
