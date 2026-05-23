import { defineConfig } from "demo-reel";

/**
 * Woordenboek Zoekdemo (Nederlands)
 *
 * Een eenvoudige demo met 5 scenes die rechtstreeks op Wikipedia zoekt met stabiele selectors.
 *
 * Run with:
 *   pnpm demo-reel demos/dictionary-search-nl --verbose
 *
 * Requirements:
 *   - Playwright + Chromium (npx playwright install chromium)
 *   - FFmpeg (voor video/audio verwerking)
 *   - Piper voor lokale TTS (pip install piper-tts)
 *   - Geen API-keys nodig (gebruikt Piper, een gratis lokale TTS engine)
 */
export default defineConfig({
  video: {
    resolution: "FHD",
  },

  name: "dictionary-search-nl",
  outputDir: "./output",

  cursor: "dot",
  motion: "smooth",
  typing: "humanlike",
  timing: "normal",
  outputFormat: "mp4",

  voice: {
    provider: "piper",
    voice: "nl_NL-pim-medium",
    speed: 1.0,
  },

  scenes: [
    {
      narration: "Laten we Wikipedia openen en een woordbetekenis opzoeken.",
      steps: [
        { action: "goto", url: "https://nl.wikipedia.org/wiki/Hoofdpagina" },
        { action: "wait", ms: 2000 },
      ],
    },
    {
      narration: "We typen nu de zoekopdracht in Wikipedia.",
      steps: [
        {
          action: "click",
          selector: { strategy: "custom", value: "input[type='search']" },
          delayAfterMs: 500,
        },
        {
          action: "type",
          selector: { strategy: "custom", value: "input[type='search']" },
          text: "serendipiteit",
          delayAfterMs: 800,
        },
      ],
    },
    {
      narration: "We drukken op Enter om te zoeken.",
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
      narration: "Hier zien we de zoekresultatenpagina.",
      steps: [{ action: "wait", ms: 2000 }],
    },
    {
      narration: "Nu openen we de artikelpagina voor de definitieve betekenis.",
      steps: [
        { action: "goto", url: "https://nl.wikipedia.org/wiki/Serendipiteit" },
        { action: "wait", ms: 4000 },
      ],
    },
  ],
});
