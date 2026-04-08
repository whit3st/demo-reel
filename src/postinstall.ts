#!/usr/bin/env node
/**
 * Postinstall script: copies the /demo-script Claude Code skill
 * into the consuming project's .claude/commands/ directory.
 */
import { mkdirSync, copyFileSync, existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Skip during Docker build or CI
if (process.env.DOCKER_BUILD || process.env.CI) {
	process.exit(0);
}

// Find the project root (where package.json is, not our own package)
// When installed as a dependency, __dirname is inside node_modules/demo-reel/dist/
const projectRoot = process.env.INIT_CWD || process.cwd();

const skillSource = join(__dirname, "..", ".claude", "commands", "demo-script.md");
const skillDest = join(projectRoot, ".claude", "commands", "demo-script.md");

// Don't overwrite if installing in our own repo
if (projectRoot === join(__dirname, "..")) {
	process.exit(0);
}

// Don't install if source doesn't exist
if (!existsSync(skillSource)) {
	process.exit(0);
}

try {
	// Check if skill already exists and is identical
	if (existsSync(skillDest)) {
		const existing = readFileSync(skillDest, "utf-8");
		const incoming = readFileSync(skillSource, "utf-8");
		if (existing === incoming) {
			process.exit(0); // Already up to date
		}
	}

	mkdirSync(dirname(skillDest), { recursive: true });
	copyFileSync(skillSource, skillDest);
	console.log("demo-reel: installed /demo-script skill → .claude/commands/demo-script.md");
} catch {
	// Don't fail the install if we can't copy the skill
}
