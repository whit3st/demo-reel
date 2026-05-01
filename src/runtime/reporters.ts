import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import type { DemoReelE2EConfig } from "../schemas.js";
import type { E2ESuiteResult } from "./e2e-runtime.js";
import type { RuntimeResult } from "./types.js";

export interface E2EReporter {
  writeScenario(config: DemoReelE2EConfig, result: RuntimeResult): Promise<void>;
  writeSuite(configs: DemoReelE2EConfig[], result: E2ESuiteResult): Promise<void>;
}

interface ReportContext {
  generatedAt: string;
  mode: "scenario" | "suite";
  exitCode: 0 | 1 | 2;
  durationMs: number;
}

function toScenarioRecord(config: DemoReelE2EConfig, result: RuntimeResult) {
  const steps = config.steps ?? [];
  return {
    name: config.name ?? "unnamed-scenario",
    ok: result.ok,
    flaky: result.flaky ?? false,
    retryCount: result.retryCount ?? 0,
    exitCode: result.exitCode ?? (result.ok ? 0 : 2),
    durationMs: result.durationMs,
    steps: steps.map((step, index) => ({ index, action: step.action })),
    attempts: (result.attempts ?? []).map((attempt) => ({
      attempt: attempt.attempt,
      ok: attempt.ok,
      durationMs: attempt.durationMs,
      artifacts: attempt.artifacts,
      failure: attempt.failure,
    })),
    failure: result.failure,
  };
}

class JsonReporter implements E2EReporter {
  async writeScenario(config: DemoReelE2EConfig, result: RuntimeResult): Promise<void> {
    const payload = {
      context: {
        generatedAt: new Date().toISOString(),
        mode: "scenario",
        exitCode: result.exitCode ?? (result.ok ? 0 : 2),
        durationMs: result.durationMs,
      } satisfies ReportContext,
      scenario: toScenarioRecord(config, result),
    };

    await mkdir(config.report.outputDir, { recursive: true });
    await writeFile(join(config.report.outputDir, "report.json"), JSON.stringify(payload, null, 2), "utf-8");
  }

  async writeSuite(configs: DemoReelE2EConfig[], result: E2ESuiteResult): Promise<void> {
    const outputDir = configs[0]?.report.outputDir;
    if (!outputDir) {
      return;
    }

    const payload = {
      context: {
        generatedAt: new Date().toISOString(),
        mode: "suite",
        exitCode: result.exitCode,
        durationMs: result.durationMs,
      } satisfies ReportContext,
      scenarios: configs.map((config, index) => toScenarioRecord(config, result.results[index])),
    };

    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, "report.json"), JSON.stringify(payload, null, 2), "utf-8");
  }
}

class JunitReporter implements E2EReporter {
  private escape(value: string): string {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  private toTestCase(name: string, result: RuntimeResult): string {
    const seconds = (result.durationMs / 1000).toFixed(3);
    if (result.ok) {
      return `<testcase name="${this.escape(name)}" time="${seconds}"/>`;
    }

    const type = result.failure?.type === "assertion" ? "assertion" : "runtime";
    const message = this.escape(result.failure?.message ?? "unknown failure");
    return `<testcase name="${this.escape(name)}" time="${seconds}"><failure type="${type}" message="${message}"/></testcase>`;
  }

  async writeScenario(config: DemoReelE2EConfig, result: RuntimeResult): Promise<void> {
    const outputDir = config.report.outputDir;
    await mkdir(outputDir, { recursive: true });

    const failures = result.ok ? 0 : 1;
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<testsuites tests="1" failures="${failures}">`,
      `<testsuite name="demo-reel" tests="1" failures="${failures}" time="${(result.durationMs / 1000).toFixed(3)}">`,
      this.toTestCase(config.name ?? "unnamed-scenario", result),
      "</testsuite>",
      "</testsuites>",
    ].join("\n");

    await writeFile(join(outputDir, "junit.xml"), xml, "utf-8");
  }

  async writeSuite(configs: DemoReelE2EConfig[], result: E2ESuiteResult): Promise<void> {
    const outputDir = configs[0]?.report.outputDir;
    if (!outputDir) {
      return;
    }

    await mkdir(outputDir, { recursive: true });
    const failures = result.results.filter((entry) => !entry.ok).length;
    const cases = configs.map((config, index) => this.toTestCase(config.name ?? `scenario-${index + 1}`, result.results[index]));

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<testsuites tests="${configs.length}" failures="${failures}">`,
      `<testsuite name="demo-reel" tests="${configs.length}" failures="${failures}" time="${(result.durationMs / 1000).toFixed(3)}">`,
      ...cases,
      "</testsuite>",
      "</testsuites>",
    ].join("\n");

    await writeFile(join(outputDir, "junit.xml"), xml, "utf-8");
  }
}

class DotReporter implements E2EReporter {
  async writeScenario(config: DemoReelE2EConfig, result: RuntimeResult): Promise<void> {
    const marker = result.ok ? (result.flaky ? "~" : ".") : "F";
    console.log(`${marker} ${config.name ?? "unnamed-scenario"} (${result.durationMs}ms)`);
  }

  async writeSuite(configs: DemoReelE2EConfig[], result: E2ESuiteResult): Promise<void> {
    const line = result.results
      .map((entry) => (entry.ok ? (entry.flaky ? "~" : ".") : "F"))
      .join("");
    console.log(line);
    console.log(`Scenarios: ${configs.length}, Passed: ${result.results.filter((entry) => entry.ok).length}, Failed: ${result.results.filter((entry) => !entry.ok).length}`);
  }
}

class NoopReporter implements E2EReporter {
  async writeScenario(): Promise<void> {}
  async writeSuite(): Promise<void> {}
}

export function createE2EReporters(formats: Array<"dot" | "json" | "junit" | "html">): E2EReporter[] {
  return formats.map((format) => {
    if (format === "json") {
      return new JsonReporter();
    }
    if (format === "junit") {
      return new JunitReporter();
    }
    if (format === "dot") {
      return new DotReporter();
    }

    return new NoopReporter();
  });
}
