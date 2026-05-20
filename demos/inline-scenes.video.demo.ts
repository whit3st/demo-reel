import { defineConfig } from "demo-reel";

export default defineConfig({
  mode: "video",
  name: "inline-scenes",
  video: { resolution: "HD" },
  outputDir: "./output",
  cursor: "dot",
  motion: "smooth",
  typing: "humanlike",
  scenes: [
    {
      narration: "Opening the example domain.",
      steps: [
        { action: "goto", url: "https://example.com" },
      ],
    },
    {
      narration: "Waiting for the page to load and inspecting the heading.",
      steps: [
        { action: "wait", ms: 1000 },
      ],
    },
    {
      narration: "And that is the example domain, plain and simple.",
      steps: [
        { action: "wait", ms: 1500 },
      ],
    },
  ],
});
