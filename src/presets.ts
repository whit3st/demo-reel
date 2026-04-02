import type { CursorConfig, MotionConfig, TypingConfig, TimingConfig } from './schemas.js';

type CursorPresetName = 'dot' | 'arrow' | 'none';
type MotionPresetName = 'smooth' | 'snappy' | 'instant';
type TypingPresetName = 'humanlike' | 'fast' | 'instant';
type TimingPresetName = 'normal' | 'fast' | 'instant';

export const cursorPresets: Record<CursorPresetName, CursorConfig> = {
  dot: {
    type: 'dot',
    size: 12,
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowColor: '#000000',
    start: { x: 0, y: 0 },
    persistPosition: true,
  },
  arrow: {
    type: 'svg',
    start: { x: 0, y: 0 },
    persistPosition: true,
    svg: {
      markup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
      </svg>`,
      width: 24,
      height: 24,
      hotspot: { x: 0, y: 0 },
    },
  },
  none: {
    type: 'dot',
    size: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: 'transparent',
    start: { x: 0, y: 0 },
    persistPosition: false,
  },
};

export const motionPresets: Record<MotionPresetName, MotionConfig> = {
  smooth: {
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
  snappy: {
    moveDurationMs: 300,
    moveStepsMin: 15,
    stepsPerPx: 8,
    clickDelayMs: 30,
    curve: {
      offsetRatio: 0.05,
      offsetMin: 2,
      offsetMax: 30,
      easing: 'easeInOutCubic',
    },
  },
  instant: {
    moveDurationMs: 0,
    moveStepsMin: 1,
    stepsPerPx: 1,
    clickDelayMs: 0,
    curve: {
      offsetRatio: 0,
      offsetMin: 0,
      offsetMax: 0,
      easing: 'easeInOutCubic',
    },
  },
};

export const typingPresets: Record<TypingPresetName, TypingConfig> = {
  humanlike: {
    baseDelayMs: 80,
    spaceDelayMs: 120,
    punctuationDelayMs: 200,
    enterDelayMs: 220,
  },
  fast: {
    baseDelayMs: 40,
    spaceDelayMs: 60,
    punctuationDelayMs: 100,
    enterDelayMs: 110,
  },
  instant: {
    baseDelayMs: 0,
    spaceDelayMs: 0,
    punctuationDelayMs: 0,
    enterDelayMs: 0,
  },
};

export const timingPresets: Record<TimingPresetName, TimingConfig> = {
  normal: {
    afterGotoDelayMs: 2000,
    endDelayMs: 2000,
  },
  fast: {
    afterGotoDelayMs: 1000,
    endDelayMs: 1000,
  },
  instant: {
    afterGotoDelayMs: 0,
    endDelayMs: 0,
  },
};
