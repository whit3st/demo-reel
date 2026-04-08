// Re-export consumer-facing API from define.ts (zero-dep)
export { defineConfig, demo } from "./define.js";

// Internal API (requires full dependency tree)
import {
  demoReelConfigSchema,
  demoReelConfigInputSchema,
  type DemoReelConfig,
} from "./schemas.js";

export function validateConfig(config: unknown): DemoReelConfig {
  return demoReelConfigSchema.parse(config);
}

export { demoReelConfigSchema, demoReelConfigInputSchema };
export type { DemoReelConfig, DemoReelConfigInput } from "./schemas.js";
export type * from "./types.js";
