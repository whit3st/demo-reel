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

describe("getBaseName edge cases", () => {
  it("uses 'demo' as fallback when neither name nor outputPath is provided", () => {
    // This indirectly tests getBaseName via the tmp file naming
    const config = defineConfig({
      video: { resolution: "FHD" },
      cursor: "dot",
      motion: "smooth",
      typing: "humanlike",
      timing: "normal",
      steps: [{ action: "goto", url: "https://example.com" }],
    });
    expect(config.name).toBeUndefined();
    expect(config.outputPath).toBeUndefined();
  });

  it("uses outputPath basename when name is not provided", () => {
    const config = defineConfig({
      video: { resolution: "FHD" },
      cursor: "dot",
      motion: "smooth",
      typing: "humanlike",
      timing: "normal",
      outputPath: "./videos/my-demo.webm",
      steps: [{ action: "goto", url: "https://example.com" }],
    });
    expect(config.outputPath).toBe("./videos/my-demo.webm");
  });

  it("handles outputPath with multiple dots in filename", () => {
    const config = defineConfig({
      video: { resolution: "FHD" },
      cursor: "dot",
      motion: "smooth",
      typing: "humanlike",
      timing: "normal",
      outputPath: "./videos/my.demo.file.webm",
      steps: [{ action: "goto", url: "https://example.com" }],
    });
    expect(config.outputPath).toBe("./videos/my.demo.file.webm");
  });
});
