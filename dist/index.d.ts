import { demoReelConfigSchema, demoReelConfigInputSchema, type DemoReelConfig, type DemoReelConfigInput } from "./schemas.js";
export type DemoConfig = DemoReelConfigInput;
export interface GenerateOptions {
    verbose?: boolean;
    noDocker?: boolean;
}
export declare function defineConfig(config: DemoConfig): DemoReelConfig;
export declare const demo: typeof defineConfig;
export declare function validateConfig(config: unknown): DemoReelConfig;
export declare function generate(config: DemoConfig, options?: GenerateOptions): Promise<void>;
export { demoReelConfigSchema, demoReelConfigInputSchema };
export type { DemoReelConfig, DemoReelConfigInput } from "./schemas.js";
export type * from "./types.js";
//# sourceMappingURL=index.d.ts.map