#!/usr/bin/env node
/**
 * Docker CLI wrapper for demo-reel.
 *
 * When installed as a git dependency in client projects, this wrapper:
 * 1. Compiles .demo.ts configs to .demo.json (so Docker doesn't need tsx)
 * 2. Runs the Docker image with the project dir mounted
 * 3. Falls back to local execution with --no-docker flag
 */
import { execSync, spawn } from "child_process";
import { existsSync, writeFileSync, unlinkSync } from "fs";
import { resolve, dirname, basename, extname, join } from "path";
import { pathToFileURL } from "url";

const DEFAULT_IMAGE = "ghcr.io/whit3st/demo-reel:latest";
const LOCAL_IMAGE = "demo-reel:latest";
const ENV_PASSTHROUGH = [
	"ELEVENLABS_KEY",
	"ELEVENLABS_API_KEY",
	"OPENAI_API_KEY",
	"ANTHROPIC_API_KEY",
];

function isDockerAvailable(): boolean {
	try {
		execSync("docker info", { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

function getImage(): string {
	// Prefer local image (from docker build), fall back to ghcr.io
	try {
		execSync(`docker image inspect ${LOCAL_IMAGE}`, { stdio: "ignore" });
		return LOCAL_IMAGE;
	} catch {
		// No local image, try remote
	}
	try {
		execSync(`docker image inspect ${DEFAULT_IMAGE}`, { stdio: "ignore" });
		return DEFAULT_IMAGE;
	} catch {
		console.log(`Pulling ${DEFAULT_IMAGE}...`);
		execSync(`docker pull ${DEFAULT_IMAGE}`, { stdio: "inherit" });
		return DEFAULT_IMAGE;
	}
}

/**
 * Compile a .demo.ts file to a temporary .demo.json by importing it with tsx.
 * Returns the path to the temp JSON file.
 */
async function compileConfig(tsPath: string): Promise<string> {
	const absPath = resolve(tsPath);
	const dir = dirname(absPath);
	const base = basename(absPath, extname(absPath));
	const jsonPath = join(dir, `.${base}.tmp.json`);

	// Dynamic import with tsx (which is a dependency, so available)
	const module = await import(pathToFileURL(absPath).href);
	const config = module.default || module;

	writeFileSync(jsonPath, JSON.stringify(config, null, 2), "utf-8");
	return jsonPath;
}

function runDocker(image: string, args: string[], configJsonPath?: string): void {
	const cwd = process.cwd();

	const dockerArgs: string[] = [
		"run", "--rm",
		"-v", `${cwd}:/work:z`,
		"-w", "/work",
	];

	// Pass through environment variables
	for (const envVar of ENV_PASSTHROUGH) {
		if (process.env[envVar]) {
			dockerArgs.push("-e", `${envVar}=${process.env[envVar]}`);
		}
	}

	dockerArgs.push(image);

	// Replace the .ts path with the .json path in args
	if (configJsonPath) {
		const relJson = configJsonPath.startsWith(cwd)
			? configJsonPath.slice(cwd.length + 1)
			: configJsonPath;
		dockerArgs.push(...args.map((arg) => {
			// Replace any arg that looks like the original .ts path
			if (arg.endsWith(".demo.ts") || arg.endsWith(".demo.js")) {
				return relJson;
			}
			// Also handle scenario names (without extension) — append .json
			return arg;
		}));
	} else {
		dockerArgs.push(...args);
	}

	const proc = spawn("docker", dockerArgs, {
		stdio: "inherit",
		env: process.env,
	});

	proc.on("close", (code) => {
		// Clean up temp JSON file
		if (configJsonPath && existsSync(configJsonPath)) {
			try { unlinkSync(configJsonPath); } catch { /* ignore */ }
		}
		process.exit(code ?? 1);
	});

	proc.on("error", (err) => {
		console.error(`Failed to run Docker: ${err.message}`);
		process.exit(1);
	});
}

async function runLocal(_args: string[]): Promise<void> {
	// Import and run the real CLI directly
	await import("./cli.js");
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);

	// Check for --no-docker flag
	const noDocker = args.includes("--no-docker");
	const filteredArgs = args.filter((a) => a !== "--no-docker");

	if (noDocker || !isDockerAvailable()) {
		if (!noDocker && !isDockerAvailable()) {
			console.log("Docker not available, running locally (requires Playwright, FFmpeg, etc.)");
		}
		// Fall back to local CLI — just re-export process.argv and import cli
		process.argv = ["node", "demo-reel", ...filteredArgs];
		await runLocal(filteredArgs);
		return;
	}

	const image = getImage();

	// Find config file in args — look for .demo.ts files that need compilation
	let configJsonPath: string | undefined;
	const processedArgs: string[] = [];

	for (const arg of filteredArgs) {
		if (arg.endsWith(".demo.ts")) {
			// Compile TypeScript config to JSON
			const absPath = resolve(arg);
			if (existsSync(absPath)) {
				console.log(`Compiling ${arg} → JSON...`);
				configJsonPath = await compileConfig(absPath);
				const relPath = configJsonPath.startsWith(process.cwd())
					? configJsonPath.slice(process.cwd().length + 1)
					: configJsonPath;
				processedArgs.push(relPath);
			} else {
				processedArgs.push(arg);
			}
		} else {
			processedArgs.push(arg);
		}
	}

	// Check if a scenario name resolves to a .demo.ts
	if (!configJsonPath && processedArgs.length > 0) {
		const firstArg = processedArgs[0];
		if (!firstArg.startsWith("-")) {
			// Could be a scenario name — check if .demo.ts exists
			for (const ext of [".demo.ts", ".demo.js"]) {
				const candidate = resolve(firstArg + ext);
				if (existsSync(candidate) && candidate.endsWith(".demo.ts")) {
					console.log(`Compiling ${firstArg}${ext} → JSON...`);
					configJsonPath = await compileConfig(candidate);
					const relPath = configJsonPath.startsWith(process.cwd())
						? configJsonPath.slice(process.cwd().length + 1)
						: configJsonPath;
					processedArgs[0] = relPath;
					break;
				}
			}
		}
	}

	runDocker(image, processedArgs, configJsonPath);
}

main().catch((err) => {
	console.error(`Error: ${err.message}`);
	process.exit(1);
});
