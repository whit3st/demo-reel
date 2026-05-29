import type { DemoReelConfig } from "../schemas.js";
import type { NarrationPlacement } from "../audio-processor.js";
import type { NarrationManifest } from "../narration-manifest.js";
import type { SceneTimestamp } from "../runner/types.js";
import type { BrowserPool } from "../browser/pool.js";

export class PipelineContext {
  config: DemoReelConfig;
  readonly configPath: string;
  readonly outputPath: string;
  readonly verbose: boolean;
  readonly dryRun: boolean;
  readonly headed: boolean;
  readonly noCache: boolean;

  audioPath?: string;
  narrationManifest?: NarrationManifest;
  narrationManifestPath?: string;
  narrationPlacements?: NarrationPlacement[];
  tempVideoPath?: string;
  finalVideoPath?: string;
  sceneTimestamps?: SceneTimestamp[];
  warnings: string[] = [];
  browserPool?: BrowserPool;

  constructor(params: {
    config: DemoReelConfig;
    configPath: string;
    outputPath: string;
    verbose: boolean;
    dryRun: boolean;
    headed: boolean;
    noCache: boolean;
  }) {
    this.config = params.config;
    this.configPath = params.configPath;
    this.outputPath = params.outputPath;
    this.verbose = params.verbose;
    this.dryRun = params.dryRun;
    this.headed = params.headed;
    this.noCache = params.noCache;
  }
}
