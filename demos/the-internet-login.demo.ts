import { defineConfig } from "demo-reel";

/**
 * Form Authentication Demo
 *
 * Logs into the-internet.herokuapp.com and shows the secure area.
 * Uses the-internet — the standard Playwright/Selenium test playground.
 *
 * Run with:
 *   pnpm demo-reel demos/the-internet-login --verbose
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

  name: "the-internet-login",
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
        "Let's log into the-internet, a demo application used for testing web automation.",
      isIntro: true,
      steps: [
        { action: "goto", url: "https://the-internet.herokuapp.com/login" },
        { action: "wait", ms: 2000 },
      ],
    },
    {
      narration:
        "We enter the username and password, then click the Login button.",
      steps: [
        {
          action: "hover",
          selector: { strategy: "id", value: "username" },
          delayAfterMs: 400,
        },
        {
          action: "click",
          selector: { strategy: "id", value: "username" },
          delayAfterMs: 300,
        },
        {
          action: "type",
          selector: { strategy: "id", value: "username" },
          text: "tomsmith",
          delayAfterMs: 500,
        },
        {
          action: "hover",
          selector: { strategy: "id", value: "password" },
          delayAfterMs: 400,
        },
        {
          action: "click",
          selector: { strategy: "id", value: "password" },
          delayAfterMs: 300,
        },
        {
          action: "type",
          selector: { strategy: "id", value: "password" },
          text: "SuperSecretPassword!",
          delayAfterMs: 500,
        },
        {
          action: "hover",
          selector: { strategy: "class", value: "radius" },
          delayAfterMs: 600,
        },
        {
          action: "click",
          selector: { strategy: "class", value: "radius" },
          delayAfterMs: 2500,
        },
      ],
    },
    {
      narration:
        "Success. We're now on the secure area. Let's log out to complete the flow.",
      steps: [
        {
          action: "hover",
          selector: { strategy: "custom", value: "a.button:has-text('Logout')" },
          delayAfterMs: 600,
        },
        {
          action: "click",
          selector: { strategy: "custom", value: "a.button:has-text('Logout')" },
          delayAfterMs: 2000,
        },
      ],
    },
  ],
});
