import { defineConfig } from "demo-reel";

export default defineConfig({
  mode: "e2e",
  name: "smoke",
  steps: [
    { action: "goto", url: "https://example.com" },
    { action: "wait", ms: 1000 },
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
  report: { formats: ["dot"], outputDir: "./output/smoke" },
});
