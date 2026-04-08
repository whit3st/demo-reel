#!/usr/bin/env node
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { execFileSync } from "child_process";
import { createRequire } from "module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Resolve tsx from our package's dependency tree (works with pnpm strict hoisting)
const require = createRequire(join(root, "package.json"));
const tsxEsm = join(dirname(require.resolve("tsx")), "esm", "index.mjs");

const args = ["--import", tsxEsm, join(root, "src", "docker-cli.ts"), ...process.argv.slice(2)];

try {
	execFileSync("node", args, { stdio: "inherit", env: process.env });
} catch (err) {
	process.exit(err.status ?? 1);
}
