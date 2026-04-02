import { demoReelConfigSchema, demoReelConfigInputSchema, type DemoReelConfig, type DemoReelConfigInput } from './schemas.js';

export function defineConfig(config: DemoReelConfigInput): DemoReelConfig {
  return demoReelConfigSchema.parse(config);
}

export function validateConfig(config: unknown): DemoReelConfig {
  return demoReelConfigSchema.parse(config);
}

export { demoReelConfigSchema, demoReelConfigInputSchema };
export type { DemoReelConfig, DemoReelConfigInput } from './schemas.js';
export type * from './types.js';
