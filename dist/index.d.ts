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
export { VideoRuntime, E2ERuntime, createRuntimeContext, closeRuntimeContext, runStepSequence, runHooks, toRuntimeResult, AssertionFailure, evaluateAssertion, runCheckpointAssertions, selectCheckpointsForStep, selectCheckpointsForLabel, createE2EReporters, } from "./runtime/index.js";
export type { NarrationClipInfo, SceneWindow, SyncReport, SyncConfig, SyncInput, SyncOutput, } from "./narration-sync.js";
export type { VideoRuntimeInput, VideoRuntimeOptions, E2ERuntimeOptions, E2ESuiteResult, CoreRunOptions, AssertionFailureDetails, E2EReporter, RuntimeContext, RuntimeResult, } from "./runtime/index.js";
//# sourceMappingURL=index.d.ts.map