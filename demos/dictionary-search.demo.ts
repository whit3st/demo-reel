import { defineConfig } from "demo-reel";

/**
 * Dictionary Search Demo
 *
 * A simple 5-scene demo that searches for a word definition on DuckDuckGo
 * and then navigates directly to Wiktionary for the definition.
 *
 * Run with:
 *   pnpm demo-reel demos/dictionary-search --verbose
 *
 * Requirements:
 *   - Docker (for recording and voice generation)
 *   - No API keys needed (uses Piper, a free local TTS engine inside Docker)
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
      narration: "Let's search for a word definition using DuckDuckGo.",
      steps: [
        { action: "goto", url: "https://duckduckgo.com" },
        { action: "wait", ms: 2000 },
      ],
    },
    {
      narration: "Typing the search query.",
      steps: [
        {
          action: "click",
          selector: { strategy: "custom", value: "input[name='q']" },
          delayAfterMs: 500,
        },
        {
          action: "type",
          selector: { strategy: "custom", value: "input[name='q']" },
          text: "serendipity definition",
          delayAfterMs: 800,
        },
      ],
    },
    {
      narration: "Pressing Enter to search.",
      steps: [
        {
          action: "press",
          selector: { strategy: "custom", value: "input[name='q']" },
          key: "Enter",
          delayAfterMs: 2500,
        },
      ],
    },
    {
      narration: "Here are the search results.",
      steps: [
        { action: "wait", ms: 2000 },
      ],
    },
    {
      narration: "Let's check the definition on Wiktionary.",
      steps: [
        { action: "goto", url: "https://en.wiktionary.org/wiki/serendipity" },
        { action: "wait", ms: 4000 },
      ],
    },
  ],
});
