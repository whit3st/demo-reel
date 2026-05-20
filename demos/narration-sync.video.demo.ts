import { defineConfig } from "demo-reel";

export default defineConfig({
  mode: "video",
  name: "narration-sync-auto",
  video: { resolution: "HD" },
  outputDir: "./output",
  cursor: "dot",
  motion: "smooth",
  timing: {
    afterGotoDelayMs: 500,
    endDelayMs: 1000,
    narrationSyncMode: "auto",
  },
  scenes: [
    {
      narration: "A quick visit to the example domain.",
      steps: [
        { action: "goto", url: "https://example.com" },
        { action: "wait", ms: 2000 },
      ],
    },
  ],
});
