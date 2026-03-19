import { defineConfig } from 'demo-reel';

export default defineConfig({
  // Viewport size for the browser
  viewport: { width: 1920, height: 1080 },
  
  // Video recording settings
  video: {
    enabled: true,
    size: { width: 1920, height: 1080 },
  },
  
  // Output file name (without extension)
  // Output will be: ./videos/onboarding-demo.webm
  name: 'onboarding-demo',
  outputDir: './videos',
  
  // Custom cursor overlay
  cursor: {
    start: { x: 160, y: 160 },
    persistPosition: true,
    type: 'svg',
    svg: {
      markup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
      </svg>`,
      width: 24,
      height: 24,
      hotspot: { x: 0, y: 0 },
    },
  },
  
  // Motion settings for natural cursor movement
  motion: {
    moveDurationMs: 600,
    moveStepsMin: 25,
    stepsPerPx: 12,
    clickDelayMs: 60,
    curve: {
      offsetRatio: 0.1,
      offsetMin: 4,
      offsetMax: 80,
      easing: 'easeInOutCubic',
    },
  },
  
  // Typing settings for human-like typing
  typing: {
    baseDelayMs: 70,
    spaceDelayMs: 120,
    punctuationDelayMs: 180,
    enterDelayMs: 200,
  },
  
  // Timing settings
  timing: {
    afterGotoDelayMs: 2000,  // Wait after page load
    endDelayMs: 2000,        // Wait at the end
  },
  
  // Demo steps
  steps: [
    { action: 'goto', url: 'https://your-app.com/login' },
    { 
      action: 'click', 
      selector: { strategy: 'id', value: 'username' } 
    },
    { 
      action: 'type', 
      selector: { strategy: 'id', value: 'username' },
      text: 'user@example.com'
    },
    { 
      action: 'click', 
      selector: { strategy: 'id', value: 'password' } 
    },
    { 
      action: 'type', 
      selector: { strategy: 'id', value: 'password' },
      text: 'password123'
    },
    { 
      action: 'click', 
      selector: { strategy: 'class', value: 'btn-primary' } 
    },
    { 
      action: 'waitFor', 
      kind: 'selector',
      selector: { strategy: 'class', value: 'dashboard' },
      state: 'visible'
    },
    { action: 'wait', ms: 2000 },
  ],
});
