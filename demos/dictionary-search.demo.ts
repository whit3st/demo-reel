import { defineConfig } from "demo-reel";

/**
 * Dictionary Search Demo
 *
 * A simple 5-scene demo that searches Wikipedia directly using stable selectors.
 *
 * Run with:
 *   pnpm demo-reel demos/dictionary-search --verbose
 *
 * Requirements:
 *   - Playwright + Chromium (npx playwright install chromium)
 *   - FFmpeg (for video/audio processing)
 *   - Piper for local TTS (pip install piper-tts)
 *   - No API keys needed (uses Piper, a free local TTS engine)
 */
export default defineConfig({
  video: {
    resolution: "FHD",
  },

  name: "dictionary-search",
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
      narration: "Let's open Wikipedia and search for a word definition.",
      steps: [
        { action: "goto", url: "https://en.wikipedia.org/wiki/Main_Page" },
        { action: "wait", ms: 2000 },
      ],
    },
    {
      narration: "Typing the search query in Wikipedia.",
      steps: [
        {
          action: "click",
          selector: { strategy: "custom", value: "input[type='search']" },
          delayAfterMs: 500,
        },
        {
          action: "type",
          selector: { strategy: "custom", value: "input[type='search']" },
          text: "serendipity",
          delayAfterMs: 800,
        },
      ],
    },
    {
      narration: "Pressing Enter to search.",
      steps: [
        {
          action: "press",
          selector: { strategy: "custom", value: "input[type='search']" },
          key: "Enter",
          delayAfterMs: 2500,
        },
      ],
    },
    {
      narration: "Here are the search results page.",
      steps: [{ action: "wait", ms: 2000 }],
    },
    {
      narration: "Now we open the article page for the final definition view.",
      steps: [
        { action: "goto", url: "https://en.wikipedia.org/wiki/Serendipity" },
        { action: "wait", ms: 4000 },
      ],
    },
  ],
});
