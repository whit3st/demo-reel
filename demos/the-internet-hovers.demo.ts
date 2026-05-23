import { defineConfig } from "demo-reel";

/**
 * Hovers Demo
 *
 * Hovers over profile images to reveal hidden user information.
 * Demonstrates the hover step type with visual reveals.
 *
 * Run with:
 *   pnpm demo-reel demos/the-internet-hovers --verbose
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

  name: "the-internet-hovers",
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
        "This page shows user profile images. Additional information is revealed when we hover over them.",
      isIntro: true,
      steps: [
        { action: "goto", url: "https://the-internet.herokuapp.com/hovers" },
        { action: "wait", ms: 2000 },
      ],
    },
    {
      narration:
        "Hovering over the first profile reveals the user name and a link to view their profile.",
      steps: [
        {
          action: "hover",
          selector: {
            strategy: "custom",
            value: ".figure",
            index: 0,
          },
          delayAfterMs: 2000,
        },
      ],
    },
    {
      narration: "Here is the second user. Hovering reveals their name as well.",
      steps: [
        {
          action: "hover",
          selector: {
            strategy: "custom",
            value: ".figure",
            index: 1,
          },
          delayAfterMs: 2000,
        },
      ],
    },
    {
      narration: "And the third user profile completes the set.",
      steps: [
        {
          action: "hover",
          selector: {
            strategy: "custom",
            value: ".figure",
            index: 2,
          },
          delayAfterMs: 2000,
        },
      ],
    },
  ],
});
