import { defineConfig } from "demo-reel";

export default defineConfig({
  mode: "e2e",
  name: "quality-gates",
  steps: [
    { action: "goto", url: "https://example.com" },
    { action: "wait", ms: 500 },
  ],
  checkpoints: [
    {
      atStep: 0,
      expect: [{ type: "expectUrl", url: /example\.com/ }],
    },
  ],
  qualityGates: {
    failOnNetwork4xx: true,
    failOnNetwork5xx: true,
  },
  report: { formats: ["json"], outputDir: "./output/quality" },
});
