#!/usr/bin/env node
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { execFileSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Find tsx ESM loader relative to our package
const tsxPath = join(root, "node_modules", "tsx", "dist", "esm", "index.mjs");

// Re-exec node with tsx loaded, running the actual CLI
const args = ["--import", tsxPath, join(root, "src", "docker-cli.ts"), ...process.argv.slice(2)];

try {
	execFileSync("node", args, { stdio: "inherit", env: process.env });
} catch (err) {
	process.exit(err.status ?? 1);
}
