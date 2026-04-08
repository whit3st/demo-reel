// Consumer-facing API is in dist/index.js (committed, zero deps).
// This file is for internal use only (full dependency tree).

import {
  demoReelConfigSchema,
  demoReelConfigInputSchema,
  type DemoReelConfig,
} from "./schemas.js";

export function defineConfig(config: DemoReelConfig): DemoReelConfig {
  return demoReelConfigSchema.parse(config);
}

export const demo = defineConfig;

export function validateConfig(config: unknown): DemoReelConfig {
  return demoReelConfigSchema.parse(config);
}

export { demoReelConfigSchema, demoReelConfigInputSchema };
export type { DemoReelConfig, DemoReelConfigInput } from "./schemas.js";
export type * from "./types.js";
