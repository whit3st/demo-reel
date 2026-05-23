import { defineConfig } from "demo-reel";

/**
 * Checkboxes & Dropdown Demo
 *
 * Interacts with checkboxes and selects dropdown options.
 * Demonstrates the check and select step types.
 *
 * Run with:
 *   pnpm demo-reel demos/the-internet-checkboxes-dropdown --verbose
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

  name: "the-internet-checkboxes-dropdown",
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
      narration: "Let's explore form controls. First, we'll work with checkboxes.",
      isIntro: true,
      steps: [
        {
          action: "goto",
          url: "https://the-internet.herokuapp.com/checkboxes",
        },
        { action: "wait", ms: 2000 },
      ],
    },
    {
      narration:
        "Checkbox one is unchecked. Let's check it. Checkbox two is already checked — let's uncheck it.",
      steps: [
        {
          action: "hover",
          selector: {
            strategy: "custom",
            value: "input[type='checkbox']:first-of-type",
          },
          delayAfterMs: 500,
        },
        {
          action: "check",
          selector: {
            strategy: "custom",
            value: "input[type='checkbox']:first-of-type",
          },
          checked: true,
          delayAfterMs: 800,
        },
        {
          action: "hover",
          selector: {
            strategy: "custom",
            value: "input[type='checkbox']:last-of-type",
          },
          delayAfterMs: 500,
        },
        {
          action: "check",
          selector: {
            strategy: "custom",
            value: "input[type='checkbox']:last-of-type",
          },
          checked: false,
          delayAfterMs: 1500,
        },
      ],
    },
    {
      narration: "Now let's switch to the dropdown page and select an option.",
      steps: [
        {
          action: "goto",
          url: "https://the-internet.herokuapp.com/dropdown",
        },
        { action: "wait", ms: 1500 },
      ],
    },
    {
      narration: "We select Option 2 from the dropdown list.",
      steps: [
        {
          action: "hover",
          selector: { strategy: "id", value: "dropdown" },
          delayAfterMs: 400,
        },
        {
          action: "click",
          selector: { strategy: "id", value: "dropdown" },
          delayAfterMs: 400,
        },
        {
          action: "select",
          selector: { strategy: "id", value: "dropdown" },
          value: ["2"],
          delayAfterMs: 2000,
        },
      ],
    },
  ],
});
