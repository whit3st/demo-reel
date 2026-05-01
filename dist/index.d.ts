import { demoReelConfigSchema, demoReelConfigInputSchema, type DemoReelVideoConfig, type DemoReelVideoConfigInput } from "./schemas.js";
export type DemoConfig = DemoReelVideoConfigInput;
export interface GenerateOptions {
    verbose?: boolean;
    noDocker?: boolean;
}
export declare function defineConfig(config: DemoConfig): DemoReelVideoConfig;
export declare const demo: typeof defineConfig;
export declare function validateConfig(config: unknown): DemoReelVideoConfig;
export declare function generate(config: DemoConfig, options?: GenerateOptions): Promise<void>;
export { demoReelConfigSchema, demoReelConfigInputSchema };
export type { DemoReelConfig, DemoReelConfigInput } from "./schemas.js";
export type * from "./types.js";
export { syncNarration, logSyncReport, buildSceneWindows, injectPadding, } from "./narration-sync.js";
export type { NarrationClipInfo, SceneWindow, SyncReport, SyncConfig, SyncInput, SyncOutput, } from "./narration-sync.js";
//# sourceMappingURL=index.d.ts.map