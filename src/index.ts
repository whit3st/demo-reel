import { demoReelConfigSchema, type DemoReelConfig } from './schemas.js';

export function defineConfig(config: DemoReelConfig): DemoReelConfig {
  return config;
}

export function validateConfig(config: unknown): DemoReelConfig {
  return demoReelConfigSchema.parse(config);
}

export { demoReelConfigSchema };
export type { DemoReelConfig } from './schemas.js';
export type * from './types.js';
