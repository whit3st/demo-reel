import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  generateDemoConfig,
  writeDemoConfig,
  writeScriptJson,
} from "../src/script/assembler.js";
import type { TimedScript } from "../src/script/types.js";

const TEMP_DIRS: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "demo-reel-assembler-"));
  TEMP_DIRS.push(dir);
  return dir;
}

function createTimedScript(overrides: Partial<TimedScript> = {}): TimedScript {
  return {
    title: "Create Template",
    description: "Create a template in the app",
    url: "https://example.com",
    audioPath: "/tmp/audio/final-narration.mp3",
    totalDurationMs: 3400,
    scenes: [
      {
        narration: "Open the template page and click the create button.",
        steps: [
          { action: "goto", url: "https://example.com/templates", waitUntil: "networkidle" },
          {
            action: "click",
            selector: { strategy: "testId", value: "create-template" },
            delayAfterMs: 250,
          },
        ],
        audioDurationMs: 1200,
        audioOffsetMs: 0,
        gapAfterMs: 400,
      },
      {
        narration: "Fill in the form and submit it.",
        steps: [
          {
            action: "type",
            selector: { strategy: "id", value: "name" },
            text: "Invoice",
            clear: true,
            delayMs: 50,
          },
          {
            action: "waitFor",
            kind: "selector",
            selector: { strategy: "class", value: "success-banner" },
            state: "visible",
            timeoutMs: 3000,
          },
        ],
        audioDurationMs: 1400,
        audioOffsetMs: 1600,
        gapAfterMs: 0,
      },
    ],
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(TEMP_DIRS.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("script assembler", () => {
  it("generates a complete demo config with scene comments, waits, and serialized steps", () => {
    const source = generateDemoConfig(createTimedScript(), {
      resolution: "4K",
      format: "webm",
    });

    expect(source).toContain('import { defineConfig } from "demo-reel";');
    expect(source).toContain('resolution: "4K"');
    expect(source).toContain('outputFormat: "webm"');
    expect(source).toContain('narration: "/tmp/audio/final-narration.mp3"');
    expect(source).toContain('// Scene 1: "Open the template page and click the create button."');
    expect(source).toContain('{ action: "goto", url: "https://example.com/templates", waitUntil: "networkidle" },');
    expect(source).toContain('{ action: "click", selector: {"strategy":"testId","value":"create-template"}, delayAfterMs: 250 },');
    expect(source).toContain('{ action: "wait", ms: 400 },');
    expect(source).toContain('{ action: "type", selector: {"strategy":"id","value":"name"}, text: "Invoice", clear: true, delayMs: 50 },');
    expect(source).toContain('{ action: "waitFor", kind: "selector", selector: {"strategy":"class","value":"success-banner"}, state: "visible", timeoutMs: 3000 },');
  });

  it("truncates long narration previews in scene comments", () => {
    const longNarration = "A".repeat(100);
    const source = generateDemoConfig(createTimedScript({
      scenes: [{
        ...createTimedScript().scenes[0],
        narration: longNarration,
        gapAfterMs: 0,
      }],
    }));

    expect(source).toContain(`// Scene 1: "${"A".repeat(80)}..."`);
  });

  it("writes demo config with narration path relative to the output file", async () => {
    const dir = await createTempDir();
    const outputPath = join(dir, "nested", "config", "create-template.demo.ts");
    const audioPath = join(dir, "audio", "final-narration.mp3");

    await writeDemoConfig(createTimedScript({ audioPath }), outputPath, {
      resolution: "HD",
      format: "mp4",
    });

    const source = await readFile(outputPath, "utf-8");

    expect(source).toContain('resolution: "HD"');
    expect(source).toContain('outputFormat: "mp4"');
    expect(source).toContain('narration: "../../audio/final-narration.mp3"');
  });

  it("prefixes sibling narration paths with ./ when writing demo config", async () => {
    const dir = await createTempDir();
    const outputPath = join(dir, "create-template.demo.ts");
    const audioPath = join(dir, "narration.mp3");

    await writeDemoConfig(createTimedScript({ audioPath }), outputPath);

    const source = await readFile(outputPath, "utf-8");

    expect(source).toContain('narration: "./narration.mp3"');
  });

  it("writes script json for later editing", async () => {
    const dir = await createTempDir();
    const outputPath = join(dir, "scripts", "create-template.script.json");
    const script = createTimedScript();

    await writeScriptJson(script, outputPath);

    const written = JSON.parse(await readFile(outputPath, "utf-8"));

    expect(written.title).toBe("Create Template");
    expect(written.scenes).toHaveLength(2);
    expect(written.audioPath).toBe("/tmp/audio/final-narration.mp3");
  });
});
