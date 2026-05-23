import { defineConfig } from "demo-reel";

/**
 * File Upload Demo
 *
 * Uploads a file and shows the success confirmation.
 * Demonstrates the upload step type.
 *
 * Run with:
 *   pnpm demo-reel demos/the-internet-file-upload --verbose
 *
 * Requirements:
 *   - Playwright + Chromium (npx playwright install chromium)
 *   - FFmpeg (for video/audio processing)
 *   - Piper auto-downloads on first run, no setup needed
 *   - A test file at demos/fixtures/upload-test.txt (included)
 */
export default defineConfig({
  video: {
    resolution: "FHD",
  },

  name: "the-internet-file-upload",
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
      narration: "This is a file upload page. We'll choose a file from our system and upload it.",
      isIntro: true,
      steps: [
        { action: "goto", url: "https://the-internet.herokuapp.com/upload" },
        { action: "wait", ms: 2000 },
      ],
    },
    {
      narration: "Selecting a test file and clicking the upload button.",
      steps: [
        {
          action: "hover",
          selector: { strategy: "id", value: "file-upload" },
          delayAfterMs: 500,
        },
        {
          action: "upload",
          selector: { strategy: "id", value: "file-upload" },
          filePath: ["demos/fixtures/upload-test.txt"],
          delayAfterMs: 800,
        },
        {
          action: "hover",
          selector: { strategy: "id", value: "file-submit" },
          delayAfterMs: 600,
        },
        {
          action: "click",
          selector: { strategy: "id", value: "file-submit" },
          delayAfterMs: 2000,
        },
      ],
    },
    {
      narration: "The file was uploaded successfully. The page shows the filename as confirmation.",
      steps: [{ action: "wait", ms: 2500 }],
    },
  ],
});
