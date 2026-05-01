import { createRuntimeContext, closeRuntimeContext, runStepSequence } from "./core.js";
import type { DemoReelE2EConfig } from "../schemas.js";
import type { RuntimeResult } from "./types.js";

export interface E2ERuntimeOptions {
  verbose?: boolean;
  headed?: boolean;
  timeoutMs?: number;
}

export class E2ERuntime {
  async run(config: DemoReelE2EConfig, options: E2ERuntimeOptions = {}): Promise<RuntimeResult> {
    const startedAt = Date.now();
    const runtime = await createRuntimeContext({
      headed: options.headed,
      verbose: options.verbose,
      timeoutMs: options.timeoutMs,
    });

    try {
      if (!config.steps || config.steps.length === 0) {
        throw new Error("E2E mode requires top-level steps.");
      }

      if (config.setup && config.setup.length > 0) {
        await runStepSequence(runtime.page, config.setup, {
          verbose: options.verbose,
          label: "setup",
          tolerant: true,
        });
      }

      await runStepSequence(runtime.page, config.steps, {
        verbose: options.verbose,
        label: "e2e",
      });

      if (config.cleanup && config.cleanup.length > 0) {
        await runStepSequence(runtime.page, config.cleanup, {
          verbose: options.verbose,
          label: "cleanup",
          tolerant: true,
        });
      }

      return {
        ok: true,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return {
        ok: false,
        durationMs: Date.now() - startedAt,
        failure: {
          message: err.message,
          stack: err.stack,
        },
      };
    } finally {
      await closeRuntimeContext(runtime);
    }
  }
}
