import { defineConfig } from "demo-reel";

export default defineConfig({
  mode: "e2e",
  name: "suite-a",
  tags: ["smoke"],
  steps: [
    { action: "goto", url: "https://example.com" },
  ],
  checkpoints: [
    {
      atStep: 0,
      expect: [{ type: "expectUrl", url: /example\.com/ }],
    },
  ],
  execution: { parallel: 2 },
  report: { formats: ["junit"], outputDir: "./output/suite" },
});
