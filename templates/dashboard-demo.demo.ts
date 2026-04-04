import { defineConfig } from "demo-reel";

// Dashboard demo with login using preSteps (silent login, then record dashboard)
export default defineConfig({
  video: {
    resolution: "4K",
  },
  name: "dashboard-demo",
  outputFormat: "mp4",
  outputDir: "./videos",
  cursor: {
    start: { x: 960, y: 540 },
    persistPosition: true,
    storageKey: "demo-reel.cursor-position",
    type: "svg",
    svg: {
      markup:
        '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 94.85 122.88" style="enable-background:new 0 0 94.85 122.88; z-index: 9999;" xml:space="preserve"><g><path d="M60.56,122.49c-1.63,0.83-3.68,0.29-4.56-1.22L38.48,91.1l-17.38,19.51c-5.24,5.88-12.16,7.34-12.85-1.57L0,1.59h0 C-0.04,1.03,0.2,0.46,0.65,0.13C1.17-0.1,1.78-0.02,2.24,0.3l0,0l88.92,60.87c7.37,5.05,2.65,10.31-5.06,11.91l-25.58,5.3 l17.37,30.26c0.86,1.51,0.31,3.56-1.22,4.55L60.56,122.49L60.56,122.49L60.56,122.49z"/></g></svg>',
      width: 18,
      height: 23,
      hotspot: { x: 0, y: 0 },
    },
  },
  motion: {
    moveDurationMs: 400,
    moveStepsMin: 20,
    stepsPerPx: 10,
    clickDelayMs: 60,
    curve: {
      offsetRatio: 0.1,
      offsetMin: 4,
      offsetMax: 80,
      easing: "easeInOutCubic",
    },
  },
  typing: {
    baseDelayMs: 70,
    spaceDelayMs: 120,
    punctuationDelayMs: 180,
    enterDelayMs: 200,
  },
  timing: {
    afterGotoDelayMs: 0,
    endDelayMs: 2000,
  },
  steps: [
    { action: "wait", ms: 10 },
    {
      action: "goto",
      url: "https://demo.epistola.app/tenants/demo",
    },
    { action: "wait", ms: 10 },
    {
      action: "click",
      selector: { strategy: "href", value: "/tenants/demo/templates" },
    },
    { action: "wait", ms: 10 },
    {
      action: "scroll",
      y: 200,
      x: 0,
      selector: {
        strategy: "href",
        value: "/tenants/demo/templates/demo-invoice",
      },
    },
    { action: "wait", ms: 10 },
    {
      action: "click",
      selector: {
        strategy: "href",
        value: "/tenants/demo/templates/demo-invoice",
      },
    },
    { action: "wait", ms: 10 },
    {
      action: "click",
      selector: {
        strategy: "href",
        value: "/tenants/demo/templates/demo-invoice/variants/demo-invoice-en/editor",
      },
    },
    { action: "wait", ms: 10 },
    {
      action: "click",
      selector: {
        strategy: "data-node-id",
        value: "n-header-columns",
      },
    },
    { action: "wait", ms: 10 },
    {
      action: "click",
      selector: {
        strategy: "class",
        value: "sidebar-tab",
        index: 2,
      },
    },
    { action: "wait", ms: 10 },
    {
      action: "click",
      selector: {
        strategy: "id",
        value: "inspector-style-backgroundColor",
      },
    },
    { action: "wait", ms: 10 },
    {
      action: "type",
      text: "#c3c3c3",
      clear: true,
      selector: {
        strategy: "id",
        value: "inspector-style-backgroundColor",
      },
    },
    { action: "wait", ms: 10 },
    {
      action: "press",
      key: "Enter",
      selector: {
        strategy: "id",
        value: "inspector-style-backgroundColor",
      },
    },
  ],
  auth: {
    loginSteps: [
      { action: "goto", url: "https://demo.epistola.app/login" },
      { action: "wait", ms: 100 },
      {
        action: "click",
        selector: { strategy: "id", value: "username" },
      },
      {
        action: "type",
        selector: { strategy: "id", value: "username" },
        text: "admin@local",
      },
      { action: "wait", ms: 500 },
      {
        action: "click",
        selector: { strategy: "id", value: "password" },
      },
      {
        action: "type",
        selector: { strategy: "id", value: "password" },
        text: "admin",
      },
      { action: "wait", ms: 500 },
      {
        action: "click",
        selector: { strategy: "class", value: "btn-primary" },
      },
    ],
    validate: {
      protectedUrl: "https://demo.epistola.app/tenants/demo",
      successIndicator: { strategy: "href", value: "/tenants/demo" },
    },
    storage: {
      name: "demo-session",
      types: ["cookies", "localStorage"],
    },
  },
});
