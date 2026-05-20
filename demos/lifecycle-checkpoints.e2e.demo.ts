import { defineConfig } from "demo-reel";

export default defineConfig({
  mode: "e2e",
  name: "lifecycle-checkpoints",
  setup: [
    { action: "goto", url: "https://example.com" },
  ],
  steps: [
    { action: "wait", ms: 500 },
  ],
  cleanup: [
    { action: "wait", ms: 200 },
  ],
  checkpoints: [
    {
      label: "setup",
      expect: [{ type: "expectUrl", url: /example\.com/ }],
    },
    {
      label: "complete",
      expect: [
        {
          type: "expectVisible",
          selector: { strategy: "custom", value: "h1" },
        },
      ],
    },
  ],
  report: { formats: ["json"], outputDir: "./output/lifecycle" },
});
