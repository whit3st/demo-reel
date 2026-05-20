import { defineConfig } from "demo-reel";

export default defineConfig({
  mode: "e2e",
  name: "suite-b",
  tags: ["smoke"],
  steps: [
    { action: "goto", url: "https://example.com" },
    { action: "wait", ms: 1000 },
  ],
  checkpoints: [
    {
      atStep: 0,
      expect: [{ type: "expectUrl", url: /example/ }],
    },
    {
      atStep: 1,
      expect: [
        {
          type: "expectText",
          selector: { strategy: "custom", value: "h1" },
          text: "Example Domain",
        },
      ],
    },
  ],
  execution: { parallel: 2 },
  report: { formats: ["junit"], outputDir: "./output/suite" },
});
