import { defineConfig } from "demo-reel";

export default defineConfig({
  mode: "e2e",
  name: "retry-repeat",
  steps: [
    { action: "goto", url: "https://example.com" },
    { action: "wait", ms: 500 },
  ],
  checkpoints: [
    {
      atStep: 0,
      expect: [{ type: "expectUrl", url: /example\.com/ }],
    },
    {
      atStep: 1,
      expect: [
        {
          type: "expectVisible",
          selector: { strategy: "custom", value: "h1" },
        },
      ],
    },
  ],
  execution: { retries: 2, repeat: 3, failFast: true },
  report: { formats: ["json", "junit"], outputDir: "./output/retry" },
});
