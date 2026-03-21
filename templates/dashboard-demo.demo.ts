import { defineConfig } from 'demo-reel';

// Dashboard demo with login using preSteps (silent login, then record dashboard)
export default defineConfig({
  viewport: { width: 1920, height: 1080 },
  video: {
    enabled: true,
    size: { width: 1920, height: 1080 },
  },
  name: 'dashboard-demo',
  outputDir: './videos',
  cursor: {
    start: { x: 960, y: 540 },
    persistPosition: true,
    storageKey: 'demo-reel.cursor-position',
    type: 'svg',
    svg: {
      markup:
        '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 94.85 122.88" style="enable-background:new 0 0 94.85 122.88" xml:space="preserve"><g><path d="M60.56,122.49c-1.63,0.83-3.68,0.29-4.56-1.22L38.48,91.1l-17.38,19.51c-5.24,5.88-12.16,7.34-12.85-1.57L0,1.59h0 C-0.04,1.03,0.2,0.46,0.65,0.13C1.17-0.1,1.78-0.02,2.24,0.3l0,0l88.92,60.87c7.37,5.05,2.65,10.31-5.06,11.91l-25.58,5.3 l17.37,30.26c0.86,1.51,0.31,3.56-1.22,4.55L60.56,122.49L60.56,122.49L60.56,122.49z"/></g></svg>',
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
      easing: 'easeInOutCubic',
    },
  },
  typing: {
    baseDelayMs: 70,
    spaceDelayMs: 120,
    punctuationDelayMs: 180,
    enterDelayMs: 200,
  },
  timing: {
    afterGotoDelayMs: 1500,
    endDelayMs: 2000,
  },
  // Pre-steps run silently before recording starts
  // Use this to login or setup state before the demo
  preSteps: [
    { action: 'goto', url: 'https://demo.epistola.app/login' },
    { action: 'wait', ms: 1000 },
    {
      action: 'click',
      selector: { strategy: 'id', value: 'username' },
    },
    {
      action: 'type',
      selector: { strategy: 'id', value: 'username' },
      text: 'admin@local',
    },
    { action: 'wait', ms: 500 },
    {
      action: 'click',
      selector: { strategy: 'id', value: 'password' },
    },
    {
      action: 'type',
      selector: { strategy: 'id', value: 'password' },
      text: 'admin',
    },
    { action: 'wait', ms: 500 },
    {
      action: 'click',
      selector: { strategy: 'class', value: 'btn-primary' },
    },
    {
      action: 'waitFor',
      kind: 'selector',
      selector: { strategy: 'href', value: '/tenants/demo-tenant' },
      state: 'visible',
    },
  ],
  // Recording starts here after preSteps complete
  steps: [
    {
      action: 'goto',
      url: 'https://demo.epistola.app/tenants/demo-tenant',
    },
    { action: 'wait', ms: 1000 },
    {
      action: 'hover',
      selector: { strategy: 'href', value: '/tenants/demo-tenant/templates' },
    },
    { action: 'wait', ms: 1000 },
  ],
});
