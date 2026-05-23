import { defineConfig } from "demo-reel";

/**
 * Dynamic Controls Demo
 *
 * Shows asynchronous UI changes — removing a checkbox and enabling a disabled input.
 * Demonstrates the waitFor step type for dynamic content.
 *
 * Run with:
 *   pnpm demo-reel demos/the-internet-dynamic-controls --verbose
 *
 * Requirements:
 *   - Playwright + Chromium (npx playwright install chromium)
 *   - FFmpeg (for video/audio processing)
 *   - Piper auto-downloads on first run, no setup needed
 */
export default defineConfig({
  video: {
    resolution: "FHD",
  },

  name: "the-internet-dynamic-controls",
  outputDir: "./output",

  cursor: "dot",
  motion: "smooth",
  typing: "humanlike",
  timing: "normal",
  outputFormat: "mp4",

  voice: {
    provider: "piper",
    voice: "en_US-amy-medium",
    speed: 1.0,
  },

  scenes: [
    {
      narration:
        "This page demonstrates dynamic UI controls. Elements appear and disappear asynchronously.",
      isIntro: true,
      steps: [
        {
          action: "goto",
          url: "https://the-internet.herokuapp.com/dynamic_controls",
        },
        { action: "wait", ms: 2000 },
      ],
    },
    {
      narration:
        "First, we'll remove this checkbox. Watch how it disappears and a confirmation message appears.",
      steps: [
        {
          action: "hover",
          selector: {
            strategy: "custom",
            value: "#checkbox-example button",
          },
          delayAfterMs: 600,
        },
        {
          action: "click",
          selector: {
            strategy: "custom",
            value: "#checkbox-example button",
          },
          delayAfterMs: 800,
        },
        {
          action: "waitFor",
          kind: "selector",
          selector: { strategy: "id", value: "message" },
          state: "visible",
          timeout: 5000,
          delayAfterMs: 1500,
        },
      ],
    },
    {
      narration: "Now let's enable a disabled input field and type something into it.",
      steps: [
        {
          action: "hover",
          selector: {
            strategy: "custom",
            value: "#input-example button",
          },
          delayAfterMs: 600,
        },
        {
          action: "click",
          selector: {
            strategy: "custom",
            value: "#input-example button",
          },
          delayAfterMs: 1200,
        },
        {
          action: "waitFor",
          kind: "selector",
          selector: {
            strategy: "custom",
            value: "#input-example input:not([disabled])",
          },
          state: "visible",
          timeout: 5000,
          delayAfterMs: 500,
        },
        {
          action: "hover",
          selector: {
            strategy: "custom",
            value: "#input-example input",
          },
          delayAfterMs: 400,
        },
        {
          action: "click",
          selector: {
            strategy: "custom",
            value: "#input-example input",
          },
          delayAfterMs: 300,
        },
        {
          action: "type",
          selector: {
            strategy: "custom",
            value: "#input-example input",
          },
          text: "Dynamic content is working!",
          delayAfterMs: 2000,
        },
      ],
    },
  ],
});
