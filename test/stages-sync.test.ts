import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { NarrationSyncStage } from "../src/stages/sync.js";
import { TTSStage, narrationInputsHash } from "../src/stages/tts.js";
import { buildStages } from "../src/index.js";
import { NARRATION_PROCESSING_VERSION } from "../src/narration-manifest.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "demo-reel-sync-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/** Write a narration manifest whose clips are `durations` ms long. */
async function writeManifest(durations: number[], gapAfterMs = 0): Promise<string> {
  const path = join(dir, "narration.manifest.json");
  await writeFile(
    path,
    JSON.stringify({
      version: 1,
      processingVersion: NARRATION_PROCESSING_VERSION,
      clips: durations.map((audioDurationMs, sceneIndex) => ({
        sceneIndex,
        narration: `clip ${sceneIndex}`,
        filePath: join(dir, `clip-${sceneIndex}.mp3`),
        audioDurationMs,
        gapAfterMs,
      })),
    }),
  );
  return path;
}

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    config: {
      timing: {
        narrationSyncMode: "auto",
        narrationGapMs: 0,
        maxAutoPadMs: 5000,
        maxSyncPasses: 2,
      },
      // One 1000ms wait per scene — deliberately shorter than the clips below.
      steps: [
        { action: "wait", ms: 1000 },
        { action: "wait", ms: 1000 },
      ],
      scenes: [
        { narration: "clip 0", stepIndex: 0 },
        { narration: "clip 1", stepIndex: 1 },
      ],
    },
    warnings: [] as string[],
    verbose: false,
    dryRun: false,
    ...overrides,
  } as any;
}

describe("pipeline wiring", () => {
  // Regression guard: NarrationSyncStage was absent from the stage list for
  // several releases. Nothing failed — scenes were simply never padded and
  // maxAutoPadMs/maxSyncPasses silently did nothing.
  it("includes NarrationSyncStage between TTS and Recording", () => {
    const names = buildStages().map((s) => s.constructor.name);

    expect(names).toContain("NarrationSyncStage");
    expect(names.indexOf("NarrationSyncStage")).toBeGreaterThan(names.indexOf("TTSStage"));
    expect(names.indexOf("NarrationSyncStage")).toBeLessThan(names.indexOf("RecordingStage"));
  });
});

describe("NarrationSyncStage", () => {
  it("pads a scene whose narration is longer than its visual", async () => {
    const ctx = makeCtx({ narrationManifestPath: await writeManifest([4000, 1000]) });

    await new NarrationSyncStage().run(ctx);

    // Scene 0 needs 4000ms but only had 1000ms of steps, so padding is injected.
    const total = ctx.config.steps
      .filter((s: any) => s.action === "wait")
      .reduce((sum: number, s: any) => sum + s.ms, 0);
    expect(total).toBeGreaterThanOrEqual(5000);
  });

  it("leaves steps alone when every narration already fits", async () => {
    const ctx = makeCtx({ narrationManifestPath: await writeManifest([200, 200]) });
    const before = JSON.stringify(ctx.config.steps);

    await new NarrationSyncStage().run(ctx);

    expect(JSON.stringify(ctx.config.steps)).toBe(before);
    expect(ctx.warnings).toHaveLength(0);
  });

  it("warns when a scene needs more padding than maxAutoPadMs", async () => {
    const ctx = makeCtx({ narrationManifestPath: await writeManifest([30000, 1000]) });

    await new NarrationSyncStage().run(ctx);

    expect(ctx.warnings.join("\n")).toMatch(/maxAutoPadMs/);
    // The threshold only warns — the scene is still padded to fit.
    const total = ctx.config.steps
      .filter((s: any) => s.action === "wait")
      .reduce((sum: number, s: any) => sum + s.ms, 0);
    expect(total).toBeGreaterThanOrEqual(30000);
  });

  it("throws in strict mode rather than padding", async () => {
    const ctx = makeCtx({ narrationManifestPath: await writeManifest([4000, 1000]) });
    ctx.config.timing.narrationSyncMode = "strict";

    await expect(new NarrationSyncStage().run(ctx)).rejects.toThrow(/strict mode/i);
  });

  it("does nothing when the mode is off", async () => {
    const ctx = makeCtx({ narrationManifestPath: await writeManifest([9000, 9000]) });
    ctx.config.timing.narrationSyncMode = "off";
    const before = JSON.stringify(ctx.config.steps);

    await new NarrationSyncStage().run(ctx);

    expect(JSON.stringify(ctx.config.steps)).toBe(before);
  });

  it("is a no-op without a manifest, so a voiceless demo still runs", async () => {
    const ctx = makeCtx({ narrationManifestPath: undefined });
    const before = JSON.stringify(ctx.config.steps);

    await new NarrationSyncStage().run(ctx);

    expect(JSON.stringify(ctx.config.steps)).toBe(before);
  });
});

describe("TTSStage on dry runs", () => {
  // A dry run has to generate narration: NarrationSyncStage needs the clip
  // durations to decide padding, so skipping TTS would make a dry run blind to
  // narration overflow (and let `strict` pass here but throw for real).
  it("does not skip narration generation when dryRun is set", async () => {
    const ctx = {
      config: {
        voice: { provider: "piper", voice: "en_US-amy-medium" },
        scenes: [{ narration: "hello", stepIndex: 0 }],
        outputPath: join(dir, "out.mp4"),
        timing: {},
      },
      dryRun: true,
      noCache: true,
      verbose: false,
      warnings: [],
    } as any;

    // Fails at the TTS import rather than returning early — proving the stage
    // now proceeds past the dryRun check instead of bailing at the top.
    await new TTSStage().run(ctx).catch(() => {});

    expect(ctx.audioPath).toBeDefined();
    expect(ctx.narrationManifestPath).toBeDefined();
  });
});

describe("stale narration manifest", () => {
  // The exact production failure: a config's scene list was cut from 12 to 9
  // while the cached manifest still described 12. buildSceneWindows guarded the
  // current clip's scene but dereferenced the NEXT clip's blind, so this threw
  // "Cannot read properties of undefined (reading 'stepIndex')" — a stack trace
  // pointing into demo-reel internals, with no hint that the cache was at fault.
  it("explains itself instead of throwing a TypeError", async () => {
    const ctx = makeCtx({ narrationManifestPath: await writeManifest([1000, 1000, 1000]) });
    // Config has 2 scenes; the manifest names 3.
    expect(ctx.config.scenes).toHaveLength(2);

    const run = new NarrationSyncStage().run(ctx);

    await expect(run).rejects.toThrow(/config has 2 scene\(s\)/);
    await expect(run).rejects.toThrow(/--no-cache/);
  });
});

describe("narration cache key", () => {
  const voice = { provider: "piper", voice: "en_US-amy-medium" };
  const scenes = [
    { scene: { narration: "one", stepIndex: 0 }, index: 0 },
    { scene: { narration: "two", stepIndex: 3 }, index: 1 },
  ];

  it("is stable for identical inputs", () => {
    expect(narrationInputsHash(scenes, voice)).toBe(narrationInputsHash(scenes, voice));
  });

  // Each of these used to leave the cache looking valid.
  it("changes when a scene is removed", () => {
    expect(narrationInputsHash(scenes.slice(0, 1), voice)).not.toBe(
      narrationInputsHash(scenes, voice),
    );
  });

  it("changes when narration text is edited", () => {
    const edited = [scenes[0], { scene: { narration: "TWO", stepIndex: 3 }, index: 1 }];
    expect(narrationInputsHash(edited, voice)).not.toBe(narrationInputsHash(scenes, voice));
  });

  it("changes when a scene moves to a different step", () => {
    const moved = [scenes[0], { scene: { narration: "two", stepIndex: 9 }, index: 1 }];
    expect(narrationInputsHash(moved, voice)).not.toBe(narrationInputsHash(scenes, voice));
  });

  it("changes when the voice changes", () => {
    const other = { provider: "piper", voice: "nl_NL-pim-medium" };
    expect(narrationInputsHash(scenes, other)).not.toBe(narrationInputsHash(scenes, voice));
  });
});
