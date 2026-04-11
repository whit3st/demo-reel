import { describe, expect, it } from "vitest";
import { defineConfig, demo, generate, validateConfig, type DemoConfig } from "../src/index.js";

function createConfig(): DemoConfig {
  return {
    video: { resolution: "FHD" },
    cursor: "dot",
    motion: "smooth",
    typing: "humanlike",
    timing: "normal",
    steps: [{ action: "goto", url: "https://example.com" }],
  };
}

describe("Public API", () => {
  it("defineConfig validates and resolves runtime presets", () => {
    const config = defineConfig(createConfig());

    expect(config.video.resolution).toEqual({ width: 1920, height: 1080 });
    expect(config.cursor.type).toBe("dot");
    expect(config.motion.moveDurationMs).toBeGreaterThan(0);
  });

  it("demo aliases defineConfig", () => {
    expect(demo).toBe(defineConfig);
  });

  it("validateConfig rejects invalid root configs", () => {
    expect(() => validateConfig({ steps: [] } as unknown as DemoConfig)).toThrow();
  });

  it("generate validates before running any runtime work", async () => {
    await expect(generate({ steps: [] } as unknown as DemoConfig)).rejects.toThrow();
  });
});
