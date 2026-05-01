import { describe, it, expect } from "vitest";
import {
  demoReelConfigSchema,
  demoReelVideoOnlySchema,
  stepSchema,
  selectorSchema,
  authConfigSchema,
  sizeSchema,
} from "../src/schemas.js";

describe("Schema Validation", () => {
  describe("Selector Schema", () => {
    it("should validate valid selector with id strategy", () => {
      const result = selectorSchema.safeParse({
        strategy: "id",
        value: "username",
      });
      expect(result.success).toBe(true);
    });

    it("should validate valid selector with class strategy", () => {
      const result = selectorSchema.safeParse({
        strategy: "class",
        value: "btn-primary",
      });
      expect(result.success).toBe(true);
    });

    it("should validate valid selector with href strategy", () => {
      const result = selectorSchema.safeParse({
        strategy: "href",
        value: "/dashboard",
      });
      expect(result.success).toBe(true);
    });

    it("should validate valid selector with testId strategy", () => {
      const result = selectorSchema.safeParse({
        strategy: "testId",
        value: "submit-button",
      });
      expect(result.success).toBe(true);
    });

    it("should validate valid selector with custom strategy", () => {
      const result = selectorSchema.safeParse({
        strategy: "custom",
        value: ".card[data-state='open']",
      });
      expect(result.success).toBe(true);
    });

    it("should reject selector with # prefix for id strategy", () => {
      const result = selectorSchema.safeParse({
        strategy: "id",
        value: "#username",
      });
      expect(result.success).toBe(false);
    });

    it("should reject selector with . prefix for class strategy", () => {
      const result = selectorSchema.safeParse({
        strategy: "class",
        value: ".btn-primary",
      });
      expect(result.success).toBe(false);
    });

    it("should reject empty selector value", () => {
      const result = selectorSchema.safeParse({
        strategy: "id",
        value: "",
      });
      expect(result.success).toBe(false);
    });

    it("should validate selector with index", () => {
      const result = selectorSchema.safeParse({
        strategy: "class",
        value: "btn",
        index: 2,
      });
      expect(result.success).toBe(true);
    });

    it("should validate selector with index 0", () => {
      const result = selectorSchema.safeParse({
        strategy: "href",
        value: "/page",
        index: 0,
      });
      expect(result.success).toBe(true);
    });

    it("should reject negative index", () => {
      const result = selectorSchema.safeParse({
        strategy: "id",
        value: "element",
        index: -1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Step Schema", () => {
    it("should validate goto step", () => {
      const result = stepSchema.safeParse({
        action: "goto",
        url: "https://example.com",
      });
      expect(result.success).toBe(true);
    });

    it("should validate click step", () => {
      const result = stepSchema.safeParse({
        action: "click",
        selector: { strategy: "id", value: "button" },
      });
      expect(result.success).toBe(true);
    });

    it("should validate type step", () => {
      const result = stepSchema.safeParse({
        action: "type",
        selector: { strategy: "id", value: "input" },
        text: "Hello World",
      });
      expect(result.success).toBe(true);
    });

    it("should validate type step with clear option", () => {
      const result = stepSchema.safeParse({
        action: "type",
        selector: { strategy: "id", value: "input" },
        text: "Hello World",
        clear: true,
      });
      expect(result.success).toBe(true);
    });

    it("should validate type step with clear false", () => {
      const result = stepSchema.safeParse({
        action: "type",
        selector: { strategy: "id", value: "input" },
        text: "Hello World",
        clear: false,
      });
      expect(result.success).toBe(true);
    });

    it("should validate wait step", () => {
      const result = stepSchema.safeParse({
        action: "wait",
        ms: 1000,
      });
      expect(result.success).toBe(true);
    });

    it("should validate waitFor selector step", () => {
      const result = stepSchema.safeParse({
        action: "waitFor",
        kind: "selector",
        selector: { strategy: "id", value: "element" },
        state: "visible",
      });
      expect(result.success).toBe(true);
    });

    it("should validate waitFor url step", () => {
      const result = stepSchema.safeParse({
        action: "waitFor",
        kind: "url",
        url: "https://example.com/success",
      });
      expect(result.success).toBe(true);
    });

    it("should reject goto step with invalid URL", () => {
      const result = stepSchema.safeParse({
        action: "goto",
        url: "not-a-url",
      });
      expect(result.success).toBe(false);
    });

    it("should reject wait step with negative ms", () => {
      const result = stepSchema.safeParse({
        action: "wait",
        ms: -100,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Auth Config Schema", () => {
    it("should validate auth config with all required fields", () => {
      const result = authConfigSchema.safeParse({
        loginSteps: [
          { action: "goto", url: "https://example.com/login" },
          {
            action: "type",
            selector: { strategy: "id", value: "username" },
            text: "user",
          },
          { action: "click", selector: { strategy: "id", value: "submit" } },
        ],
        validate: {
          protectedUrl: "https://example.com/dashboard",
          successIndicator: { strategy: "id", value: "dashboard" },
        },
        storage: {
          name: "test-session",
          types: ["cookies"],
        },
      });
      expect(result.success).toBe(true);
    });

    it("should validate auth config with optional behavior", () => {
      const result = authConfigSchema.safeParse({
        loginSteps: [{ action: "goto", url: "https://example.com/login" }],
        validate: {
          protectedUrl: "https://example.com/dashboard",
          successIndicator: { strategy: "id", value: "dashboard" },
        },
        storage: {
          name: "test-session",
          types: ["cookies", "localStorage"],
        },
        behavior: {
          autoReauth: true,
          forceReauth: false,
          clearInvalid: true,
        },
      });
      expect(result.success).toBe(true);
    });

    it("should reject auth config without loginSteps", () => {
      const result = authConfigSchema.safeParse({
        validate: {
          protectedUrl: "https://example.com/dashboard",
          successIndicator: { strategy: "id", value: "dashboard" },
        },
        storage: {
          name: "test-session",
          types: ["cookies"],
        },
      });
      expect(result.success).toBe(false);
    });

    it("should reject auth config with empty loginSteps", () => {
      const result = authConfigSchema.safeParse({
        loginSteps: [],
        validate: {
          protectedUrl: "https://example.com/dashboard",
          successIndicator: { strategy: "id", value: "dashboard" },
        },
        storage: {
          name: "test-session",
          types: ["cookies"],
        },
      });
      expect(result.success).toBe(false);
    });

    it("should reject auth config with invalid storage type", () => {
      const result = authConfigSchema.safeParse({
        loginSteps: [{ action: "goto", url: "https://example.com/login" }],
        validate: {
          protectedUrl: "https://example.com/dashboard",
          successIndicator: { strategy: "id", value: "dashboard" },
        },
        storage: {
          name: "test-session",
          types: ["invalidType"],
        },
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Size Schema", () => {
    it("should validate valid size", () => {
      const result = sizeSchema.safeParse({
        width: 1920,
        height: 1080,
      });
      expect(result.success).toBe(true);
    });

    it("should reject size with zero width", () => {
      const result = sizeSchema.safeParse({
        width: 0,
        height: 1080,
      });
      expect(result.success).toBe(false);
    });

    it("should reject size with negative height", () => {
      const result = sizeSchema.safeParse({
        width: 1920,
        height: -100,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Full Config Schema", () => {
    it("should validate minimal valid config", () => {
      const result = demoReelConfigSchema.safeParse({
        mode: "video",
        video: { resolution: { width: 1920, height: 1080 } },
        cursor: {
          start: { x: 100, y: 100 },
          persistPosition: false,
          type: "dot",
          size: 10,
          borderWidth: 2,
          borderColor: "#000",
          shadowColor: "#fff",
        },
        motion: {
          moveDurationMs: 500,
          moveStepsMin: 20,
          stepsPerPx: 10,
          clickDelayMs: 100,
          curve: {
            offsetRatio: 0.1,
            offsetMin: 5,
            offsetMax: 50,
            easing: "easeInOutCubic",
          },
        },
        typing: {
          baseDelayMs: 50,
          spaceDelayMs: 100,
          punctuationDelayMs: 150,
          enterDelayMs: 200,
        },
        timing: {
          afterGotoDelayMs: 1000,
          endDelayMs: 2000,
        },
        steps: [{ action: "goto", url: "https://example.com" }],
      });
      expect(result.success).toBe(true);
    });

    it("should validate config with resolution preset", () => {
      const result = demoReelConfigSchema.safeParse({
        mode: "video",
        video: { resolution: "FHD" },
        cursor: {
          start: { x: 100, y: 100 },
          persistPosition: false,
          type: "dot",
          size: 10,
          borderWidth: 2,
          borderColor: "#000",
          shadowColor: "#fff",
        },
        motion: {
          moveDurationMs: 500,
          moveStepsMin: 20,
          stepsPerPx: 10,
          clickDelayMs: 100,
          curve: {
            offsetRatio: 0.1,
            offsetMin: 5,
            offsetMax: 50,
            easing: "easeInOutCubic",
          },
        },
        typing: {
          baseDelayMs: 50,
          spaceDelayMs: 100,
          punctuationDelayMs: 150,
          enterDelayMs: 200,
        },
        timing: {
          afterGotoDelayMs: 1000,
          endDelayMs: 2000,
        },
        steps: [{ action: "goto", url: "https://example.com" }],
      });
      expect(result.success).toBe(true);
    });

    it("should validate config with tags", () => {
      const result = demoReelConfigSchema.safeParse({
        mode: "video",
        video: { resolution: "FHD" },
        cursor: {
          start: { x: 100, y: 100 },
          persistPosition: false,
          type: "dot",
          size: 10,
          borderWidth: 2,
          borderColor: "#000",
          shadowColor: "#fff",
        },
        motion: {
          moveDurationMs: 500,
          moveStepsMin: 20,
          stepsPerPx: 10,
          clickDelayMs: 100,
          curve: {
            offsetRatio: 0.1,
            offsetMin: 5,
            offsetMax: 50,
            easing: "easeInOutCubic",
          },
        },
        typing: {
          baseDelayMs: 50,
          spaceDelayMs: 100,
          punctuationDelayMs: 150,
          enterDelayMs: 200,
        },
        timing: {
          afterGotoDelayMs: 1000,
          endDelayMs: 2000,
        },
        steps: [{ action: "goto", url: "https://example.com" }],
        tags: ["marketing", "onboarding"],
      });
      expect(result.success).toBe(true);
    });

    it("should validate config with randomization seed", () => {
      const result = demoReelConfigSchema.safeParse({
        mode: "video",
        video: { resolution: "FHD" },
        cursor: {
          start: { x: 100, y: 100 },
          persistPosition: false,
          type: "dot",
          size: 10,
          borderWidth: 2,
          borderColor: "#000",
          shadowColor: "#fff",
        },
        motion: {
          moveDurationMs: 500,
          moveStepsMin: 20,
          stepsPerPx: 10,
          clickDelayMs: 100,
          curve: {
            offsetRatio: 0.1,
            offsetMin: 5,
            offsetMax: 50,
            easing: "easeInOutCubic",
          },
        },
        typing: {
          baseDelayMs: 50,
          spaceDelayMs: 100,
          punctuationDelayMs: 150,
          enterDelayMs: 200,
        },
        timing: {
          afterGotoDelayMs: 1000,
          endDelayMs: 2000,
        },
        steps: [{ action: "goto", url: "https://example.com" }],
        randomization: { seed: "demo-seed" },
      });
      expect(result.success).toBe(true);
    });

    it("should reject config without required fields", () => {
      const result = demoReelConfigSchema.safeParse({
        steps: [{ action: "goto", url: "https://example.com" }],
      });
      expect(result.success).toBe(false);
    });

    it("should reject config with empty steps array", () => {
      const result = demoReelConfigSchema.safeParse({
        mode: "video",
        video: { resolution: { width: 1920, height: 1080 } },
        cursor: {
          start: { x: 100, y: 100 },
          persistPosition: false,
          type: "dot",
          size: 10,
          borderWidth: 2,
          borderColor: "#000",
          shadowColor: "#fff",
        },
        motion: {
          moveDurationMs: 500,
          moveStepsMin: 20,
          stepsPerPx: 10,
          clickDelayMs: 100,
          curve: {
            offsetRatio: 0.1,
            offsetMin: 5,
            offsetMax: 50,
            easing: "easeInOutCubic",
          },
        },
        typing: {
          baseDelayMs: 50,
          spaceDelayMs: 100,
          punctuationDelayMs: 150,
          enterDelayMs: 200,
        },
        timing: {
          afterGotoDelayMs: 1000,
          endDelayMs: 2000,
        },
        steps: [],
      });
      expect(result.success).toBe(false);
    });

    it("should validate config with outputFormat mp4", () => {
      const result = demoReelConfigSchema.safeParse({
        mode: "video",
        video: { resolution: { width: 1920, height: 1080 } },
        cursor: {
          start: { x: 100, y: 100 },
          persistPosition: false,
          type: "dot",
          size: 10,
          borderWidth: 2,
          borderColor: "#000",
          shadowColor: "#fff",
        },
        motion: {
          moveDurationMs: 500,
          moveStepsMin: 20,
          stepsPerPx: 10,
          clickDelayMs: 100,
          curve: {
            offsetRatio: 0.1,
            offsetMin: 5,
            offsetMax: 50,
            easing: "easeInOutCubic",
          },
        },
        typing: {
          baseDelayMs: 50,
          spaceDelayMs: 100,
          punctuationDelayMs: 150,
          enterDelayMs: 200,
        },
        timing: {
          afterGotoDelayMs: 1000,
          endDelayMs: 2000,
        },
        steps: [{ action: "goto", url: "https://example.com" }],
        outputFormat: "mp4",
      });
      expect(result.success).toBe(true);
    });

    it("should validate config with outputFormat webm", () => {
      const result = demoReelConfigSchema.safeParse({
        mode: "video",
        video: { resolution: { width: 1920, height: 1080 } },
        cursor: {
          start: { x: 100, y: 100 },
          persistPosition: false,
          type: "dot",
          size: 10,
          borderWidth: 2,
          borderColor: "#000",
          shadowColor: "#fff",
        },
        motion: {
          moveDurationMs: 500,
          moveStepsMin: 20,
          stepsPerPx: 10,
          clickDelayMs: 100,
          curve: {
            offsetRatio: 0.1,
            offsetMin: 5,
            offsetMax: 50,
            easing: "easeInOutCubic",
          },
        },
        typing: {
          baseDelayMs: 50,
          spaceDelayMs: 100,
          punctuationDelayMs: 150,
          enterDelayMs: 200,
        },
        timing: {
          afterGotoDelayMs: 1000,
          endDelayMs: 2000,
        },
        steps: [{ action: "goto", url: "https://example.com" }],
        outputFormat: "webm",
      });
      expect(result.success).toBe(true);
    });

    it("should reject config with audio and outputFormat webm", () => {
      const result = demoReelConfigSchema.safeParse({
        mode: "video",
        video: { resolution: { width: 1920, height: 1080 } },
        cursor: {
          start: { x: 100, y: 100 },
          persistPosition: false,
          type: "dot",
          size: 10,
          borderWidth: 2,
          borderColor: "#000",
          shadowColor: "#fff",
        },
        motion: {
          moveDurationMs: 500,
          moveStepsMin: 20,
          stepsPerPx: 10,
          clickDelayMs: 100,
          curve: {
            offsetRatio: 0.1,
            offsetMin: 5,
            offsetMax: 50,
            easing: "easeInOutCubic",
          },
        },
        typing: {
          baseDelayMs: 50,
          spaceDelayMs: 100,
          punctuationDelayMs: 150,
          enterDelayMs: 200,
        },
        timing: {
          afterGotoDelayMs: 1000,
          endDelayMs: 2000,
        },
        steps: [{ action: "goto", url: "https://example.com" }],
        audio: { narration: "./voice.mp3" },
        outputFormat: "webm",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Scene Config Modes", () => {
    const baseConfig = {
      mode: "video",
      video: { resolution: { width: 1920, height: 1080 } },
      cursor: {
        start: { x: 100, y: 100 },
        persistPosition: false,
        type: "dot",
        size: 10,
        borderWidth: 2,
        borderColor: "#000",
        shadowColor: "#fff",
      },
      motion: {
        moveDurationMs: 500,
        moveStepsMin: 20,
        stepsPerPx: 10,
        clickDelayMs: 100,
        curve: {
          offsetRatio: 0.1,
          offsetMin: 5,
          offsetMax: 50,
          easing: "easeInOutCubic",
        },
      },
      typing: {
        baseDelayMs: 50,
        spaceDelayMs: 100,
        punctuationDelayMs: 150,
        enterDelayMs: 200,
      },
      timing: {
        afterGotoDelayMs: 1000,
        endDelayMs: 2000,
      },
    };

    it("should accept scene-owned mode with scenes containing steps", () => {
      const result = demoReelConfigSchema.safeParse({
        ...baseConfig,
        scenes: [
          {
            narration: "Intro",
            isIntro: true,
            steps: [
              { action: "goto", url: "https://example.com" },
              { action: "wait", ms: 500 },
            ],
          },
          {
            narration: "Main",
            steps: [{ action: "click", selector: { strategy: "id", value: "btn" } }],
          },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.steps).toHaveLength(3);
        expect(result.data.scenes).toHaveLength(2);
        expect(result.data.scenes?.[0].stepIndex).toBe(0);
        expect(result.data.scenes?.[1].stepIndex).toBe(2);
      }
    });

    it("should accept legacy mode with top-level steps and scene stepIndex", () => {
      const result = demoReelConfigSchema.safeParse({
        ...baseConfig,
        steps: [
          { action: "goto", url: "https://example.com" },
          { action: "wait", ms: 500 },
          { action: "click", selector: { strategy: "id", value: "btn" } },
        ],
        scenes: [
          { narration: "Intro", stepIndex: 0, isIntro: true },
          { narration: "Main", stepIndex: 2 },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.steps).toHaveLength(3);
        expect(result.data.scenes).toHaveLength(2);
        expect(result.data.scenes?.[0].stepIndex).toBe(0);
        expect(result.data.scenes?.[1].stepIndex).toBe(2);
      }
    });

    it("should reject mixed mode (top-level steps + scene-owned steps)", () => {
      const result = demoReelConfigSchema.safeParse({
        ...baseConfig,
        steps: [{ action: "goto", url: "https://example.com" }],
        scenes: [
          {
            narration: "Intro",
            steps: [{ action: "wait", ms: 500 }],
          },
        ],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes("top-level steps with scene-owned"))).toBe(true);
      }
    });

    it("should reject scenes mixing stepIndex and steps formats", () => {
      const result = demoReelConfigSchema.safeParse({
        ...baseConfig,
        scenes: [
          { narration: "A", stepIndex: 0 },
          { narration: "B", steps: [{ action: "wait", ms: 100 }] },
        ],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes("same format"))).toBe(true);
      }
    });

    it("should reject legacy scenes with non-monotonic stepIndex", () => {
      const result = demoReelConfigSchema.safeParse({
        ...baseConfig,
        steps: [
          { action: "goto", url: "https://example.com" },
          { action: "wait", ms: 500 },
          { action: "click", selector: { strategy: "id", value: "btn" } },
        ],
        scenes: [
          { narration: "A", stepIndex: 2 },
          { narration: "B", stepIndex: 0 },
        ],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes("strictly increasing"))).toBe(true);
      }
    });

    it("should reject legacy stepIndex exceeding top-level steps length", () => {
      const result = demoReelConfigSchema.safeParse({
        ...baseConfig,
        steps: [{ action: "goto", url: "https://example.com" }],
        scenes: [{ narration: "A", stepIndex: 5 }],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes("exceeds top-level steps length"))).toBe(true);
      }
    });

    it("should reject config with neither top-level steps nor scenes", () => {
      const result = demoReelConfigSchema.safeParse({
        ...baseConfig,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes("top-level steps or scenes"))).toBe(true);
      }
    });
  });

  describe("Explicit Mode Validation", () => {
    const minimalVideoConfig = {
      mode: "video" as const,
      video: { resolution: "FHD" as const },
      cursor: "dot" as const,
      motion: "smooth" as const,
      typing: "humanlike" as const,
      timing: "normal" as const,
      steps: [{ action: "goto" as const, url: "https://example.com" }],
    };

    const minimalE2EConfig = {
      mode: "e2e" as const,
      steps: [{ action: "goto" as const, url: "https://example.com" }],
      report: {
        formats: ["json" as const],
        outputDir: "./artifacts",
      },
    };

    it("accepts minimal e2e config", () => {
      const result = demoReelConfigSchema.safeParse(minimalE2EConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mode).toBe("e2e");
      }
    });

    it("rejects e2e config with video-only fields", () => {
      const result = demoReelConfigSchema.safeParse({
        ...minimalE2EConfig,
        voice: { provider: "piper", voice: "en_US-amy-medium" },
      });

      expect(result.success).toBe(false);
    });

    it("rejects video config with e2e-only fields", () => {
      const result = demoReelConfigSchema.safeParse({
        ...minimalVideoConfig,
        report: {
          formats: ["json"],
          outputDir: "./artifacts",
        },
      });

      expect(result.success).toBe(false);
    });

    it("demoReelVideoOnlySchema rejects non-video mode", () => {
      const result = demoReelVideoOnlySchema.safeParse(minimalE2EConfig);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((issue) => issue.message);
        expect(messages.some((message) => message.includes('only supports mode="video"'))).toBe(
          true,
        );
      }
    });

    it("video config requires mode field", () => {
      const result = demoReelConfigSchema.safeParse({
        video: { resolution: "FHD" },
        cursor: "dot",
        motion: "smooth",
        typing: "humanlike",
        timing: "normal",
        steps: [{ action: "goto", url: "https://example.com" }],
      });
      expect(result.success).toBe(false);
    });
  });
});
