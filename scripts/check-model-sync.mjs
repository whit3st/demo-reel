#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const formalDir = join(root, "formal");

function git(args, allowFailure = false) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  } catch (error) {
    if (allowFailure) return "";
    throw error;
  }
}

const specs = readdirSync(formalDir)
  .filter((name) => name.endsWith(".tla"))
  .map((name) => join(formalDir, name));

const declarations = specs.map((file) => {
  const header = readFileSync(file, "utf8").slice(0, 4000);
  const match = header.match(/Models:\s*(.+)/);
  if (!match) {
    console.error(`Model-sync: ${relative(root, file)} has no "Models:" header.`);
    process.exit(1);
  }
  const models = match[1]
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  return { spec: relative(root, file), models };
});

const base = process.env.MODEL_SYNC_BASE || "origin/main";
const hasBase = git(["rev-parse", "--verify", base], true);
if (!hasBase) {
  console.log(`Model-sync: base '${base}' unavailable; skipping (local runs).`);
  process.exit(0);
}

const changed = new Set([
  ...git(["diff", "--name-only", base], true)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean),
  ...git(["ls-files", "--others", "--exclude-standard"], true)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean),
]);
const changedSpecs = changed;

let failures = 0;
for (const declaration of declarations) {
  const touched = declaration.models.filter((model) => changed.has(model));
  if (touched.length === 0) continue;
  if (changedSpecs.has(declaration.spec)) continue;

  const log = git(["log", "--format=%B", `${base}..HEAD`], true);
  if (/Model-unchanged:\s*\S+/.test(log)) {
    console.log(
      `Model-sync: ${declaration.spec} unchanged for ${touched.join(", ")} (Model-unchanged commit found).`,
    );
    continue;
  }

  failures += 1;
  console.error(
    `Model-sync: ${declaration.spec} models ${touched.join(", ")} but the spec did not change.`,
  );
  console.error(`  Update the spec, or add "Model-unchanged: <reason>" to a commit message.`);
}

if (failures > 0) process.exit(1);
console.log(`Model-sync: ${declarations.length} spec(s) in sync with their modeled sources.`);
