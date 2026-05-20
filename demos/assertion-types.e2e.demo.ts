import { defineConfig } from "demo-reel";

export default defineConfig({
  mode: "e2e",
  name: "assertion-types",
  steps: [
    { action: "goto", url: "https://example.com" },
    { action: "wait", ms: 1000 },
  ],
  checkpoints: [
    {
      atStep: 0,
      expect: [
        { type: "expectUrl", url: /example\.com/ },
      ],
    },
    {
      atStep: 1,
      expect: [
        {
          type: "expectText",
          selector: { strategy: "custom", value: "h1" },
          text: "Example Domain",
        },
        {
          type: "expectText",
          selector: { strategy: "custom", value: "h1" },
          text: "Example",
          contains: true,
        },
        {
          type: "expectCount",
          selector: { strategy: "custom", value: "a" },
          count: 1,
        },
        {
          type: "expectHidden",
          selector: { strategy: "custom", value: "#does-not-exist" },
        },
      ],
    },
  ],
  report: { formats: ["dot", "json"], outputDir: "./output/assertions" },
});
