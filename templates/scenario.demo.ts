import { defineConfig } from "demo-reel";

// Example scenario file: create multiple .demo.ts files
// Run with: npx demo-reel --all
// Or individually: npx demo-reel checkout-flow

export default defineConfig({
  video: {
    resolution: "FHD",
  },

  // This will output to ./checkout-flow.webm
  name: "checkout-flow",

  cursor: {
    start: { x: 100, y: 100 },
    persistPosition: true,
    type: "dot",
    size: 12,
    borderWidth: 2,
    borderColor: "#ff6b6b",
    shadowColor: "#000000",
  },

  motion: {
    moveDurationMs: 500,
    moveStepsMin: 20,
    stepsPerPx: 15,
    clickDelayMs: 50,
    curve: {
      offsetRatio: 0.08,
      offsetMin: 3,
      offsetMax: 60,
      easing: "easeInOutCubic",
    },
  },

  typing: {
    baseDelayMs: 60,
    spaceDelayMs: 100,
    punctuationDelayMs: 150,
    enterDelayMs: 180,
  },

  timing: {
    afterGotoDelayMs: 1500,
    endDelayMs: 1500,
  },

  steps: [
    { action: "goto", url: "https://example.com/products" },
    { action: "wait", ms: 1000 },
    {
      action: "click",
      selector: { strategy: "testId", value: "add-to-cart" },
    },
    {
      action: "waitFor",
      kind: "selector",
      selector: { strategy: "class", value: "cart-badge" },
    },
    {
      action: "click",
      selector: { strategy: "href", value: "/cart" },
    },
    { action: "wait", ms: 1000 },
  ],
});
