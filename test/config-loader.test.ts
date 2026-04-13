import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findConfig, findScenarioFiles, loadConfig, loadScenario } from "../src/config-loader.js";

const TEMP_DIRS: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "demo-reel-config-loader-"));
  TEMP_DIRS.push(dir);
  return dir;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf-8");
}

async function writeTsConfig(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `export default ${JSON.stringify(value, null, 2)};`, "utf-8");
}

function createMinimalConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    video: { resolution: "FHD" },
    cursor: "dot",
    motion: "smooth",
    typing: "humanlike",
    timing: "normal",
    steps: [{ action: "goto", url: "https://example.com" }],
    ...overrides,
  };
}

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(TEMP_DIRS.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("config-loader", () => {
  it("loads json config and resolves outputPath relative to the config file", async () => {
    const dir = await createTempDir();
    const configPath = join(dir, "nested", "demo-reel.config.json");
    await writeJson(configPath, createMinimalConfig({ outputPath: "./videos/custom.mp4" }));

    const loaded = await loadConfig(configPath);

    expect(loaded.configPath).toBe(configPath);
    expect(loaded.outputPath).toBe(join(dir, "nested", "videos", "custom.mp4"));
  });

  it("prefers cli output dir and switches to mp4 when audio is configured", async () => {
    const dir = await createTempDir();
    const configPath = join(dir, "demo.demo.json");
    await writeJson(
      configPath,
      createMinimalConfig({
        name: "my-video",
        outputDir: "ignored-output",
        audio: { narration: "narration.mp3" },
      }),
    );

    const loaded = await loadConfig(configPath, "cli-output");

    expect(loaded.outputPath).toBe(join(dir, "cli-output", "my-video.mp4"));
  });

  it("uses the config filename as basename and strips .demo before creating the output path", async () => {
    const dir = await createTempDir();
    const configPath = join(dir, "create-template.demo.json");
    await writeJson(configPath, createMinimalConfig());

    const loaded = await loadConfig(configPath);

    expect(loaded.outputPath).toBe(join(dir, "create-template.webm"));
  });

  it("adds a timestamp when requested", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-11T16:20:30Z"));

    const dir = await createTempDir();
    const configPath = join(dir, "recording.config.json");
    await writeJson(configPath, createMinimalConfig({ timestamp: true }));

    const loaded = await loadConfig(configPath);

    expect(loaded.outputPath.startsWith(join(dir, "recording-20260411-"))).toBe(true);
    expect(loaded.outputPath.endsWith(".webm")).toBe(true);
  });

  it("finds the first supported root config file by extension priority", async () => {
    const dir = await createTempDir();
    await writeJson(join(dir, "demo-reel.config.json"), createMinimalConfig());
    await writeTsConfig(join(dir, "demo-reel.config.ts"), createMinimalConfig());

    const found = await findConfig(dir);

    expect(found).toBe(join(dir, "demo-reel.config.ts"));
  });

  it("finds scenario files and ignores dist output", async () => {
    const dir = await createTempDir();
    await writeFile(join(dir, "root.demo.ts"), "export default {}", "utf-8");
    await mkdir(join(dir, "nested"), { recursive: true });
    await writeFile(join(dir, "nested", "child.demo.ts"), "export default {}", "utf-8");
    await mkdir(join(dir, "dist"), { recursive: true });
    await writeFile(join(dir, "dist", "ignored.demo.ts"), "export default {}", "utf-8");

    const files = await findScenarioFiles(dir);

    expect(files).toEqual([join(dir, "nested", "child.demo.ts"), join(dir, "root.demo.ts")]);
  });

  it("finds scenarios by supported extension order", async () => {
    const dir = await createTempDir();
    await writeFile(join(dir, "example.demo.ts"), "export default {}", "utf-8");
    await writeFile(join(dir, "example.config.ts"), "export default {}", "utf-8");

    const found = await loadScenario("example", dir);

    expect(found).toBe(join(dir, "example.demo.ts"));
  });

  it("loads ts config files", async () => {
    const dir = await createTempDir();
    const configPath = join(dir, "demo-reel.config.ts");
    await writeTsConfig(configPath, createMinimalConfig({ name: "ts-demo" }));

    const loaded = await loadConfig(configPath);

    expect(loaded.config.name).toBe("ts-demo");
  });

  it("throws when config file is missing", async () => {
    const dir = await createTempDir();
    const missingPath = join(dir, "missing.demo.json");

    await expect(loadConfig(missingPath)).rejects.toThrow(`Config file not found: ${missingPath}`);
  });

  it("throws when config file extension is unsupported", async () => {
    const dir = await createTempDir();
    const configPath = join(dir, "demo-reel.config.txt");
    await writeFile(configPath, "noop", "utf-8");

    await expect(loadConfig(configPath)).rejects.toThrow("Unsupported config file extension: .txt");
  });

  it("keeps absolute outputPath as-is", async () => {
    const dir = await createTempDir();
    const configPath = join(dir, "demo.config.json");
    await writeJson(configPath, createMinimalConfig({ outputPath: "/tmp/demo-output.webm" }));

    const loaded = await loadConfig(configPath);

    expect(loaded.outputPath).toBe("/tmp/demo-output.webm");
  });

  it("uses absolute outputDir when provided", async () => {
    const dir = await createTempDir();
    const configPath = join(dir, "demo.config.json");
    await writeJson(
      configPath,
      createMinimalConfig({ name: "abs-demo", outputDir: "/tmp/demo-output" }),
    );

    const loaded = await loadConfig(configPath);

    expect(loaded.outputPath).toBe("/tmp/demo-output/abs-demo.webm");
  });

  it("returns null when no root config exists", async () => {
    const dir = await createTempDir();

    const found = await findConfig(dir);

    expect(found).toBeNull();
  });

  it("returns null when scenario does not exist", async () => {
    const dir = await createTempDir();

    const found = await loadScenario("missing", dir);

    expect(found).toBeNull();
  });
});
