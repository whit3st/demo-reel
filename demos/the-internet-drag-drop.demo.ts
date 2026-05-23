import { defineConfig } from "demo-reel";

/**
 * Drag and Drop Demo
 *
 * Drags column A onto column B, swapping their positions.
 * Demonstrates the drag step type.
 *
 * Run with:
 *   pnpm demo-reel demos/the-internet-drag-drop --verbose
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

  name: "the-internet-drag-drop",
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
        "We have two columns, A and B. Let's drag column A onto column B to swap their positions.",
      isIntro: true,
      steps: [
        {
          action: "goto",
          url: "https://the-internet.herokuapp.com/drag_and_drop",
        },
        { action: "wait", ms: 2000 },
      ],
    },
    {
      narration: "Dragging column A over to column B. Notice how the columns swap places.",
      steps: [
        {
          action: "hover",
          selector: { strategy: "id", value: "column-a" },
          delayAfterMs: 800,
        },
        {
          action: "drag",
          source: { strategy: "id", value: "column-a" },
          target: { strategy: "id", value: "column-b" },
          delayAfterMs: 3000,
        },
      ],
    },
  ],
});
