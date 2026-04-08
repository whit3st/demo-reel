#!/usr/bin/env -S node --import tsx/esm
/**
 * Docker CLI wrapper for demo-reel.
 *
 * When installed as a git dependency in client projects, this wrapper:
 * 1. Compiles .demo.ts configs to .demo.json (so Docker doesn't need tsx)
 * 2. Runs the Docker image with the project dir mounted
 * 3. Falls back to local execution with --no-docker flag
 */
import { execSync, spawn } from "child_process";
import { existsSync, writeFileSync, unlinkSync, readFileSync, mkdirSync } from "fs";
import { resolve, dirname, basename, extname, join } from "path";

import { pathToFileURL } from "url";

const DEFAULT_IMAGE = "ghcr.io/whit3st/demo-reel:latest";
const LOCAL_IMAGE = "demo-reel:latest";
const SKILL_URL = "https://raw.githubusercontent.com/whit3st/demo-reel/main/.claude/commands/demo-script.md";
const SKILL_PATH = ".claude/commands/demo-script.md";
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

/**
 * If config has scenes with narration + voice settings, generate voiceover audio.
 * Mutates the config JSON in place to add the audio.narration path.
 */
async function generateVoiceIfNeeded(configJsonPath: string, verbose: boolean): Promise<void> {
	const config = JSON.parse(readFileSync(configJsonPath, "utf-8"));

	// Check if we have scenes with narration text and voice config
	const hasNarration = config.scenes?.some((s: any) => s.narration);
	const hasVoice = config.voice;
	if (!hasNarration || !hasVoice) return;

	// Build a script object for the TTS pipeline
	const script = {
		title: config.name || "demo",
		description: "",
		url: "",
		scenes: config.scenes.map((s: any) => ({
			narration: s.narration,
			steps: [],
		})),
		voice: config.voice,
	};

	// Determine output path for narration
	const configDir = dirname(configJsonPath);
	const configBase = basename(configJsonPath, extname(configJsonPath)).replace(/\.tmp$/, "");
	const outputDir = join(configDir, "output");
	mkdirSync(outputDir, { recursive: true });
	const audioPath = join(outputDir, `${configBase}-narration.mp3`);

	// Import TTS modules dynamically
	const { generateVoiceSegments, generateNarrationAudio } = await import("./script/tts.js");

	if (verbose) console.log("Generating voiceover...");

	const segments = await generateVoiceSegments(script, config.voice, { verbose });
	await generateNarrationAudio(segments, audioPath, { verbose });

	// Update config with audio path (relative to config file location)
	const relAudioPath = "./" + audioPath.split(configDir + "/").pop();
	config.audio = { ...config.audio, narration: relAudioPath, narrationDelay: config.audio?.narrationDelay ?? 300 };
	config.outputFormat = "mp4";
	writeFileSync(configJsonPath, JSON.stringify(config, null, 2), "utf-8");

	if (verbose) console.log(`✓ Voiceover: ${audioPath}`);
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

	// Handle setup command — shows how to install the Claude Code plugin
	if (filteredArgs[0] === "setup") {
		console.log(`demo-reel setup

Install the /demo-script Claude Code plugin to build demo scripts interactively.

Option 1 — Claude Code plugin (recommended):
  /plugin marketplace add whit3st/demo-reel
  /plugin install demo-reel@whit3st-demo-reel

Option 2 — Manual copy:
  mkdir -p .claude/commands
  curl -sL ${SKILL_URL} -o ${SKILL_PATH}

Then use /demo-script in Claude Code to create demo videos collaboratively.`);
		return;
	}

	// Hint about the plugin if skill not installed
	if (!existsSync(join(process.cwd(), SKILL_PATH)) && !filteredArgs.includes("--help") && !filteredArgs.includes("-h")) {
		console.log(`tip: Run "demo-reel setup" to learn how to install the /demo-script Claude Code plugin\n`);
	}

	// Handle explore subcommand (runs in Docker, no config needed)
	if (filteredArgs[0] === "explore") {
		const image = getImage();
		const exploreArgs = filteredArgs.slice(1);
		const cwd = process.cwd();
		const dockerArgs = [
			"run", "--rm",
			"-v", `${cwd}:/work:z`,
			"-w", "/work",
		];
		for (const envVar of ENV_PASSTHROUGH) {
			if (process.env[envVar]) {
				dockerArgs.push("-e", `${envVar}=${process.env[envVar]}`);
			}
		}
		dockerArgs.push("--entrypoint", "node", image, "/app/dist/script/crawl-cli.js", ...exploreArgs);
		const proc = spawn("docker", dockerArgs, { stdio: "inherit" });
		proc.on("close", (code) => process.exit(code ?? 1));
		return;
	}

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

	// Generate voice if the config has scenes with narration
	const verbose = filteredArgs.includes("--verbose") || filteredArgs.includes("-v");
	if (configJsonPath) {
		await generateVoiceIfNeeded(configJsonPath, verbose);
	}

	runDocker(image, processedArgs, configJsonPath);
}

main().catch((err) => {
	console.error(`Error: ${err.message}`);
	process.exit(1);
});
