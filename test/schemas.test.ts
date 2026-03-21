import { describe, it, expect } from 'vitest';
import {
  demoReelConfigSchema,
  stepSchema,
  selectorSchema,
  authConfigSchema,
  sizeSchema,
} from '../src/schemas.js';
import { z } from 'zod';

describe('Schema Validation', () => {
  describe('Selector Schema', () => {
    it('should validate valid selector with id strategy', () => {
      const result = selectorSchema.safeParse({
        strategy: 'id',
        value: 'username',
      });
      expect(result.success).toBe(true);
    });

    it('should validate valid selector with class strategy', () => {
      const result = selectorSchema.safeParse({
        strategy: 'class',
        value: 'btn-primary',
      });
      expect(result.success).toBe(true);
    });

    it('should validate valid selector with href strategy', () => {
      const result = selectorSchema.safeParse({
        strategy: 'href',
        value: '/dashboard',
      });
      expect(result.success).toBe(true);
    });

    it('should validate valid selector with testId strategy', () => {
      const result = selectorSchema.safeParse({
        strategy: 'testId',
        value: 'submit-button',
      });
      expect(result.success).toBe(true);
    });

    it('should reject selector with # prefix for id strategy', () => {
      const result = selectorSchema.safeParse({
        strategy: 'id',
        value: '#username',
      });
      expect(result.success).toBe(false);
    });

    it('should reject selector with . prefix for class strategy', () => {
      const result = selectorSchema.safeParse({
        strategy: 'class',
        value: '.btn-primary',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty selector value', () => {
      const result = selectorSchema.safeParse({
        strategy: 'id',
        value: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Step Schema', () => {
    it('should validate goto step', () => {
      const result = stepSchema.safeParse({
        action: 'goto',
        url: 'https://example.com',
      });
      expect(result.success).toBe(true);
    });

    it('should validate click step', () => {
      const result = stepSchema.safeParse({
        action: 'click',
        selector: { strategy: 'id', value: 'button' },
      });
      expect(result.success).toBe(true);
    });

    it('should validate type step', () => {
      const result = stepSchema.safeParse({
        action: 'type',
        selector: { strategy: 'id', value: 'input' },
        text: 'Hello World',
      });
      expect(result.success).toBe(true);
    });

    it('should validate wait step', () => {
      const result = stepSchema.safeParse({
        action: 'wait',
        ms: 1000,
      });
      expect(result.success).toBe(true);
    });

    it('should validate waitFor selector step', () => {
      const result = stepSchema.safeParse({
        action: 'waitFor',
        kind: 'selector',
        selector: { strategy: 'id', value: 'element' },
        state: 'visible',
      });
      expect(result.success).toBe(true);
    });

    it('should validate waitFor url step', () => {
      const result = stepSchema.safeParse({
        action: 'waitFor',
        kind: 'url',
        url: 'https://example.com/success',
      });
      expect(result.success).toBe(true);
    });

    it('should reject goto step with invalid URL', () => {
      const result = stepSchema.safeParse({
        action: 'goto',
        url: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });

    it('should reject wait step with negative ms', () => {
      const result = stepSchema.safeParse({
        action: 'wait',
        ms: -100,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Auth Config Schema', () => {
    it('should validate auth config with all required fields', () => {
      const result = authConfigSchema.safeParse({
        loginSteps: [
          { action: 'goto', url: 'https://example.com/login' },
          { action: 'type', selector: { strategy: 'id', value: 'username' }, text: 'user' },
          { action: 'click', selector: { strategy: 'id', value: 'submit' } },
        ],
        validate: {
          protectedUrl: 'https://example.com/dashboard',
          successIndicator: { strategy: 'id', value: 'dashboard' },
        },
        storage: {
          name: 'test-session',
          types: ['cookies'],
        },
      });
      expect(result.success).toBe(true);
    });

    it('should validate auth config with optional behavior', () => {
      const result = authConfigSchema.safeParse({
        loginSteps: [
          { action: 'goto', url: 'https://example.com/login' },
        ],
        validate: {
          protectedUrl: 'https://example.com/dashboard',
          successIndicator: { strategy: 'id', value: 'dashboard' },
        },
        storage: {
          name: 'test-session',
          types: ['cookies', 'localStorage'],
        },
        behavior: {
          autoReauth: true,
          forceReauth: false,
          clearInvalid: true,
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject auth config without loginSteps', () => {
      const result = authConfigSchema.safeParse({
        validate: {
          protectedUrl: 'https://example.com/dashboard',
          successIndicator: { strategy: 'id', value: 'dashboard' },
        },
        storage: {
          name: 'test-session',
          types: ['cookies'],
        },
      });
      expect(result.success).toBe(false);
    });

    it('should reject auth config with empty loginSteps', () => {
      const result = authConfigSchema.safeParse({
        loginSteps: [],
        validate: {
          protectedUrl: 'https://example.com/dashboard',
          successIndicator: { strategy: 'id', value: 'dashboard' },
        },
        storage: {
          name: 'test-session',
          types: ['cookies'],
        },
      });
      expect(result.success).toBe(false);
    });

    it('should reject auth config with invalid storage type', () => {
      const result = authConfigSchema.safeParse({
        loginSteps: [
          { action: 'goto', url: 'https://example.com/login' },
        ],
        validate: {
          protectedUrl: 'https://example.com/dashboard',
          successIndicator: { strategy: 'id', value: 'dashboard' },
        },
        storage: {
          name: 'test-session',
          types: ['invalidType'],
        },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Size Schema', () => {
    it('should validate valid size', () => {
      const result = sizeSchema.safeParse({
        width: 1920,
        height: 1080,
      });
      expect(result.success).toBe(true);
    });

    it('should reject size with zero width', () => {
      const result = sizeSchema.safeParse({
        width: 0,
        height: 1080,
      });
      expect(result.success).toBe(false);
    });

    it('should reject size with negative height', () => {
      const result = sizeSchema.safeParse({
        width: 1920,
        height: -100,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Full Config Schema', () => {
    it('should validate minimal valid config', () => {
      const result = demoReelConfigSchema.safeParse({
        viewport: { width: 1920, height: 1080 },
        video: { enabled: true, size: { width: 1920, height: 1080 } },
        cursor: {
          start: { x: 100, y: 100 },
          persistPosition: false,
          type: 'dot',
          size: 10,
          borderWidth: 2,
          borderColor: '#000',
          shadowColor: '#fff',
        },
        motion: {
          moveDurationMs: 500,
          moveStepsMin: 20,
          stepsPerPx: 10,
          clickDelayMs: 100,
          curve: {
            offsetRatio: 0.1,
            offsetMin: 5,
            offsetMax: 50,
            easing: 'easeInOutCubic',
          },
        },
        typing: {
          baseDelayMs: 50,
          spaceDelayMs: 100,
          punctuationDelayMs: 150,
          enterDelayMs: 200,
        },
        timing: {
          afterGotoDelayMs: 1000,
          endDelayMs: 2000,
        },
        steps: [
          { action: 'goto', url: 'https://example.com' },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should reject config without required fields', () => {
      const result = demoReelConfigSchema.safeParse({
        steps: [
          { action: 'goto', url: 'https://example.com' },
        ],
      });
      expect(result.success).toBe(false);
    });

    it('should reject config with empty steps array', () => {
      const result = demoReelConfigSchema.safeParse({
        viewport: { width: 1920, height: 1080 },
        video: { enabled: true, size: { width: 1920, height: 1080 } },
        cursor: {
          start: { x: 100, y: 100 },
          persistPosition: false,
          type: 'dot',
          size: 10,
          borderWidth: 2,
          borderColor: '#000',
          shadowColor: '#fff',
        },
        motion: {
          moveDurationMs: 500,
          moveStepsMin: 20,
          stepsPerPx: 10,
          clickDelayMs: 100,
          curve: {
            offsetRatio: 0.1,
            offsetMin: 5,
            offsetMax: 50,
            easing: 'easeInOutCubic',
          },
        },
        typing: {
          baseDelayMs: 50,
          spaceDelayMs: 100,
          punctuationDelayMs: 150,
          enterDelayMs: 200,
        },
        timing: {
          afterGotoDelayMs: 1000,
          endDelayMs: 2000,
        },
        steps: [],
      });
      expect(result.success).toBe(false);
    });
  });
});
