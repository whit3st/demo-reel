import { createRuntimeContext, closeRuntimeContext, runStepSequence } from "./core.js";
import type { DemoReelE2EConfig } from "../schemas.js";
import type { RuntimeAttemptResult, RuntimeResult } from "./types.js";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { createE2EReporters } from "./reporters.js";
import {
  AssertionFailure,
  runCheckpointAssertions,
  selectCheckpointsForLabel,
  selectCheckpointsForStep,
} from "./assertions.js";

export interface E2ERuntimeOptions {
  verbose?: boolean;
  headed?: boolean;
  timeoutMs?: number;
}

export interface E2ESuiteResult {
  ok: boolean;
  durationMs: number;
  results: RuntimeResult[];
  exitCode: 0 | 1 | 2;
}

export class E2ERuntime {
  private async persistAttemptOutcome(
    config: DemoReelE2EConfig,
    iteration: number,
    attemptInIteration: number,
    result: RuntimeAttemptResult,
  ): Promise<void> {
    const attemptDir = join(config.report.outputDir, `iteration-${iteration + 1}`, `attempt-${attemptInIteration + 1}`);
    await mkdir(attemptDir, { recursive: true });
    const attemptJsonPath = join(attemptDir, "result.json");

    await writeFile(
      attemptJsonPath,
      JSON.stringify(
        {
          ...result,
          artifacts: {
            ...(result.artifacts ?? {}),
            dir: attemptDir,
          },
        },
        null,
        2,
      ),
      "utf-8",
    );

    result.artifacts = {
      ...(result.artifacts ?? {}),
      dir: attemptDir,
      outcomePath: attemptJsonPath,
    };
  }

  private async runAttempt(
    config: DemoReelE2EConfig,
    options: E2ERuntimeOptions,
    attempt: number,
  ): Promise<RuntimeAttemptResult> {
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

      for (const checkpoint of selectCheckpointsForLabel(config.checkpoints, "setup")) {
        await runCheckpointAssertions(runtime.page, checkpoint);
      }

      for (let stepIndex = 0; stepIndex < config.steps.length; stepIndex++) {
        const step = config.steps[stepIndex];
        await runStepSequence(runtime.page, [step], {
          verbose: options.verbose,
          label: "e2e",
        });

        for (const checkpoint of selectCheckpointsForStep(config.checkpoints, stepIndex)) {
          await runCheckpointAssertions(runtime.page, checkpoint);
        }
      }

      for (const checkpoint of selectCheckpointsForLabel(config.checkpoints, "steps")) {
        await runCheckpointAssertions(runtime.page, checkpoint);
      }

      if (config.cleanup && config.cleanup.length > 0) {
        await runStepSequence(runtime.page, config.cleanup, {
          verbose: options.verbose,
          label: "cleanup",
          tolerant: true,
        });
      }

      for (const checkpoint of selectCheckpointsForLabel(config.checkpoints, "cleanup")) {
        await runCheckpointAssertions(runtime.page, checkpoint);
      }

      for (const checkpoint of selectCheckpointsForLabel(config.checkpoints, "complete")) {
        await runCheckpointAssertions(runtime.page, checkpoint);
      }

      return {
        attempt,
        ok: true,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      if (error instanceof AssertionFailure) {
        return {
          attempt,
          ok: false,
          durationMs: Date.now() - startedAt,
          failure: {
            type: "assertion",
            message: error.message,
            target: error.details.target,
            expected: error.details.expected,
            actual: error.details.actual,
            context: error.details.assertion.type,
            stack: error.stack,
          },
        };
      }

      const err = error instanceof Error ? error : new Error(String(error));
      return {
        attempt,
        ok: false,
        durationMs: Date.now() - startedAt,
        failure: {
          type: "runtime",
          message: err.message,
          stack: err.stack,
        },
      };
    } finally {
      await closeRuntimeContext(runtime);
    }
  }

  async run(config: DemoReelE2EConfig, options: E2ERuntimeOptions = {}): Promise<RuntimeResult> {
    const suiteStartedAt = Date.now();
    const repeat = config.execution?.repeat ?? 1;
    const retries = config.execution?.retries ?? 0;
    const failFast = config.execution?.failFast ?? false;

    const attempts: RuntimeAttemptResult[] = [];
    let firstFailure: RuntimeAttemptResult | undefined;
    let passedIterations = 0;

    for (let iteration = 0; iteration < repeat; iteration++) {
      let iterationPassed = false;

      for (let retryIndex = 0; retryIndex <= retries; retryIndex++) {
        const attemptNumber = iteration * (retries + 1) + retryIndex + 1;
        const result = await this.runAttempt(config, options, attemptNumber);
        await this.persistAttemptOutcome(config, iteration, retryIndex, result);
        attempts.push(result);

        if (result.ok) {
          iterationPassed = true;
          passedIterations += 1;
          break;
        }

        if (!firstFailure) {
          firstFailure = result;
        }
      }

      if (!iterationPassed && failFast) {
        break;
      }
    }

    const ok = passedIterations === repeat;
    const durationMs = Date.now() - suiteStartedAt;
    const hasAssertionFailure = attempts.some((attempt) => attempt.failure?.type === "assertion");
    const exitCode: 0 | 1 | 2 = ok ? 0 : hasAssertionFailure ? 1 : 2;
    const flaky = ok && attempts.some((attempt) => !attempt.ok);

    const summary: RuntimeResult = {
      ok,
      durationMs,
      attempts,
      retryCount: retries,
      flaky,
      failure: firstFailure?.failure,
      exitCode,
    };

    const reporters = createE2EReporters(config.report.formats);
    await Promise.all(reporters.map((reporter) => reporter.writeScenario(config, summary)));

    return summary;
  }

  async runSuite(configs: DemoReelE2EConfig[], options: E2ERuntimeOptions = {}): Promise<E2ESuiteResult> {
    const startedAt = Date.now();

    if (configs.length === 0) {
      return { ok: true, durationMs: 0, results: [], exitCode: 0 };
    }

    const parallel = Math.max(
      1,
      ...configs.map((config) => config.execution?.parallel ?? 1),
    );
    const failFast = configs.some((config) => config.execution?.failFast ?? false);

    const queue = configs.map((config, index) => ({ config, index }));
    const orderedResults: Array<RuntimeResult | undefined> = new Array(configs.length);
    let shouldStop = false;

    const worker = async (): Promise<void> => {
      while (!shouldStop) {
        const next = queue.shift();
        if (!next) {
          return;
        }

        const result = await this.run(next.config, options);
        orderedResults[next.index] = result;

        if (!result.ok && failFast) {
          shouldStop = true;
          return;
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(parallel, configs.length) }, () => worker()));

    const results = orderedResults.filter((result): result is RuntimeResult => Boolean(result));
    const ok = results.length === configs.length && results.every((result) => result.ok);
    const exitCode: 0 | 1 | 2 = ok
      ? 0
      : results.some((result) => result.exitCode === 2)
        ? 2
        : 1;

    const suiteResult: E2ESuiteResult = {
      ok,
      durationMs: Date.now() - startedAt,
      results,
      exitCode,
    };

    const reporters = createE2EReporters(configs[0]?.report.formats ?? []);
    await Promise.all(reporters.map((reporter) => reporter.writeSuite(configs, suiteResult)));

    return suiteResult;
  }
}
