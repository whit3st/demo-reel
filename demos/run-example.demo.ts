import { run } from "demo-reel";

/**
 * Demo using the run() API — recommended for scripts that need dynamic
 * config or CLI flags (--dry-run, --verbose, --headed, --silent).
 *
 * Run normally:   pnpm tsx demos/run-example.demo.ts
 * Run as dry-run: pnpm tsx demos/run-example.demo.ts --dry-run --verbose
 * Run silently:   pnpm tsx demos/run-example.demo.ts --silent
 */

const url = process.env.BASE_URL ?? "https://the-internet.herokuapp.com/dynamic_controls";

await run({
  name: "run-example",
  outputDir: "./output",
  video: { resolution: "FHD" },
  cursor: "dot",
  motion: "smooth",
  typing: "humanlike",
  timing: "normal",
  outputFormat: "mp4",
  voice: { provider: "piper", voice: "en_US-amy-medium", speed: 1 },
  scenes: [
    {
      narration: "Dynamic UI controls — elements appear and disappear asynchronously.",
      isIntro: true,
      steps: [
        { action: "goto", url },
        { action: "wait", ms: 2000 },
      ],
    },
    {
      narration: "Clicking this button removes the checkbox.",
      steps: [
        { action: "click", selector: { strategy: "custom", value: "#checkbox-example button" } },
        {
          action: "waitFor",
          kind: "selector",
          selector: { strategy: "id", value: "message" },
          state: "visible",
          delayAfterMs: 1500,
        },
      ],
    },
    {
      narration: "Now we enable a disabled input and type into it.",
      steps: [
        { action: "click", selector: { strategy: "custom", value: "#input-example button" } },
        {
          action: "waitFor",
          kind: "selector",
          selector: { strategy: "custom", value: "#input-example input:not([disabled])" },
          state: "visible",
          delayAfterMs: 500,
        },
        { action: "click", selector: { strategy: "custom", value: "#input-example input" } },
        {
          action: "type",
          selector: { strategy: "custom", value: "#input-example input" },
          text: "Dynamic content is working!",
          delayAfterMs: 2000,
        },
      ],
    },
  ],
});
