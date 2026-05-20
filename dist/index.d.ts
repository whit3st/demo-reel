import { demoReelConfigSchema, demoReelConfigInputSchema, type DemoReelConfig, type DemoReelConfigInput, type DemoReelVideoConfig } from "./schemas.js";
export type DemoConfig = DemoReelConfigInput;
export interface GenerateOptions {
    verbose?: boolean;
    noDocker?: boolean;
}
export declare function defineConfig(config: DemoConfig): DemoReelConfig;
export declare const demo: typeof defineConfig;
export declare function validateConfig(config: unknown): DemoReelVideoConfig;
export type { DemoReelE2EConfig, DemoReelE2EConfigInput } from "./schemas.js";
export declare function generate(config: DemoConfig, options?: GenerateOptions): Promise<void>;
export { demoReelConfigSchema, demoReelConfigInputSchema };
export type { DemoReelConfig, DemoReelConfigInput } from "./schemas.js";
export type * from "./types.js";
export { syncNarration, logSyncReport, buildSceneWindows, injectPadding, } from "./narration-sync.js";
export { VideoRuntime, E2ERuntime, createRuntimeContext, closeRuntimeContext, runStepSequence, runHooks, toRuntimeResult, AssertionFailure, evaluateAssertion, runCheckpointAssertions, selectCheckpointsForStep, selectCheckpointsForLabel, createE2EReporters, } from "./runtime/index.js";
export type { NarrationClipInfo, SceneWindow, SyncReport, SyncConfig, SyncInput, SyncOutput, } from "./narration-sync.js";
export type { VideoRuntimeInput, VideoRuntimeOptions, E2ERuntimeOptions, E2ESuiteResult, CoreRunOptions, AssertionFailureDetails, E2EReporter, RuntimeContext, RuntimeResult, } from "./runtime/index.js";
//# sourceMappingURL=index.d.ts.map