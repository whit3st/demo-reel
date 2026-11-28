#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const violations = [];

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

const sourceFiles = [...walk(join(root, "src"))].filter((path) => path.endsWith(".ts"));
const rel = (path) => relative(root, path);

function fail(file, line, rule, detail) {
  violations.push(`${rel(file)}:${line}  [${rule}] ${detail}`);
}

// 1. Strict-typing ratchet: no `any` escapes on live source.
for (const file of sourceFiles) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    if (/(?::\s*any\b|\bas\s+any\b|<any>)/.test(line)) {
      fail(file, index + 1, "no-any", "use a real type or `unknown` plus a narrowing boundary");
    }
  });
}

// 2. Pure-core barrier: modules with zero I/O must not reach for the shell.
const pureModules = [
  "src/narration-sync.ts",
  "src/narration-placement.ts",
  "src/step-duration.ts",
  "src/random.ts",
];
const shellImports = [
  /from\s+["'](?:node:)?fs(?:\/promises)?["']/,
  /from\s+["'](?:node:)?child_process["']/,
  /from\s+["']playwright["']/,
  /import\s*\(\s*["'](?:node:)?fs/,
  /import\s*\(\s*["']playwright["']/,
];
for (const module of pureModules) {
  const file = join(root, module);
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    if (shellImports.some((pattern) => pattern.test(line))) {
      fail(
        file,
        index + 1,
        "pure-core",
        `${module} must stay free of filesystem/process/browser I/O`,
      );
    }
  });
}

// 3. Schemas are the validation core; they must not depend on the runners or
//    the recording shell.
for (const file of sourceFiles.filter((path) => rel(path).startsWith("src/schemas/"))) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    if (/from\s+["'](?:playwright|(?:node:)?fs|(?:node:)?child_process)["']/.test(line)) {
      fail(file, index + 1, "cross-layer", "schemas must not import I/O or browser layers");
    }
    if (/from\s+["'][^"']*(?:video-handler|runner\/index|browser\/)["']/.test(line)) {
      fail(file, index + 1, "cross-layer", "schemas must not import runtime execution layers");
    }
  });
}

// 4. One source of truth for duration constants.
const durationOwners = new Set(["src/step-duration.ts"]);
for (const file of sourceFiles) {
  if (durationOwners.has(rel(file))) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    if (
      /\b(?:TYPING_MS_PER_CHAR|CLICK_DURATION_MS|GOTO_DURATION_MS|DEFAULT_STEP_DURATION_MS)\b/.test(
        line,
      )
    ) {
      fail(
        file,
        index + 1,
        "single-source",
        "step-duration constants live only in src/step-duration.ts",
      );
    }
  });
}

// 5. Signal teardown must go through the cleanup registry. `process.exit` is
//    allowed only at CLI boundaries and in the registry itself. The three
//    script entrypoints below are one-shot commands that never acquire a
//    pooled browser; they are explicitly allowlisted rather than orphaned.
const exitOwners = new Set([
  "src/cli.ts",
  "src/process-cleanup.ts",
  "src/script/crawl-cli.ts",
  "src/script/explore.ts",
  "src/script/voice-cli.ts",
]);
for (const file of sourceFiles) {
  if (exitOwners.has(rel(file))) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    if (/\bprocess\.exit\s*\(/.test(line)) {
      fail(file, index + 1, "cleanup-owner", "exit through the CLI/process-cleanup registry");
    }
  });
}

if (violations.length > 0) {
  console.error(`Architecture ratchet failed with ${violations.length} violation(s):\n`);
  for (const violation of violations) console.error(`  ${violation}`);
  console.error("\nFix the code or update scripts/check-architecture.mjs deliberately.");
  process.exit(1);
}

console.log(
  `Architecture ratchet passed (${sourceFiles.length} files): no any, pure core clean, single source, cleanup owner enforced.`,
);
