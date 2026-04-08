#!/usr/bin/env node
/**
 * Docker CLI wrapper for demo-reel.
 *
 * When installed as a git dependency in client projects, this wrapper:
 * 1. Compiles .demo.ts configs to .demo.json (so Docker doesn't need tsx)
 * 2. Auto-generates voiceover if scenes have narration + voice config
 * 3. Runs the Docker image with the project dir mounted
 * 4. Falls back to local execution with --no-docker flag
 */
import { execSync, spawn } from "child_process";
import { existsSync, writeFileSync, unlinkSync, readFileSync, mkdirSync } from "fs";
import { resolve, dirname, basename, extname, join, relative } from "path";
import { pathToFileURL } from "url";

const DEFAULT_IMAGE = "ghcr.io/whit3st/demo-reel:latest";
const LOCAL_IMAGE = "demo-reel:latest";
const SKILL_URL = "https://raw.githubusercontent.com/whit3st/demo-reel/main/.claude-plugin/commands/demo-script.md";
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
	try {
		execSync(`docker image inspect ${LOCAL_IMAGE}`, { stdio: "ignore" });
		return LOCAL_IMAGE;
	} catch { /* no local image */ }
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
 */
async function compileConfig(tsPath: string): Promise<string> {
	const absPath = resolve(tsPath);
	const dir = dirname(absPath);
	const base = basename(absPath, extname(absPath));
	const jsonPath = join(dir, `.${base}.tmp.json`);

	try {
		const module = await import(pathToFileURL(absPath).href);
		const config = module.default || module;

		if (!config || typeof config !== "object" || !config.steps) {
			throw new Error("Config must export an object with a 'steps' array");
		}

		writeFileSync(jsonPath, JSON.stringify(config, null, 2), "utf-8");
		return jsonPath;
	} catch (err) {
		throw new Error(`Failed to compile ${tsPath}: ${err instanceof Error ? err.message : err}`);
	}
}

/**
 * If config has scenes with narration + voice settings, generate voiceover audio.
 * Mutates the config JSON in place to add the audio.narration path.
 */
async function generateVoiceIfNeeded(configJsonPath: string, verbose: boolean): Promise<void> {
	let config: any;
	try {
		config = JSON.parse(readFileSync(configJsonPath, "utf-8"));
	} catch (err) {
		throw new Error(`Failed to read config: ${err instanceof Error ? err.message : err}`);
	}

	const hasNarration = config.scenes?.some((s: any) => s.narration);
	const hasVoice = config.voice;
	if (!hasNarration || !hasVoice) return;

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

	const configDir = dirname(configJsonPath);
	const configBase = basename(configJsonPath, extname(configJsonPath)).replace(/\.tmp$/, "");
	const outputDir = join(configDir, "output");
	mkdirSync(outputDir, { recursive: true });
	const audioPath = join(outputDir, `${configBase}-narration.mp3`);

	try {
		const { generateVoiceSegments, generateNarrationAudio } = await import("./script/tts.js");

		if (verbose) console.log("Generating voiceover...");

		const segments = await generateVoiceSegments(script, config.voice, { verbose });
		await generateNarrationAudio(segments, audioPath, { verbose });
	} catch (err) {
		throw new Error(`Voice generation failed: ${err instanceof Error ? err.message : err}`);
	}

	const relAudioPath = "./" + relative(configDir, audioPath);
	config.audio = {
		...config.audio,
		narration: relAudioPath,
		narrationDelay: config.audio?.narrationDelay ?? 300,
	};
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

	for (const envVar of ENV_PASSTHROUGH) {
		if (process.env[envVar]) {
			dockerArgs.push("-e", `${envVar}=${process.env[envVar]}`);
		}
	}

	dockerArgs.push(image);

	if (configJsonPath) {
		const relJson = relative(cwd, configJsonPath);
		dockerArgs.push(...args.map((arg) =>
			arg.endsWith(".demo.ts") || arg.endsWith(".demo.js") ? relJson : arg,
		));
	} else {
		dockerArgs.push(...args);
	}

	const proc = spawn("docker", dockerArgs, {
		stdio: "inherit",
		env: process.env,
	});

	proc.on("close", (code) => {
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

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const noDocker = args.includes("--no-docker");
	const filteredArgs = args.filter((a) => a !== "--no-docker");

	// setup: show how to install the Claude Code plugin
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

	// Hint about the plugin
	if (!existsSync(join(process.cwd(), SKILL_PATH)) && !filteredArgs.includes("--help") && !filteredArgs.includes("-h")) {
		console.log(`tip: Run "demo-reel setup" to learn how to install the /demo-script Claude Code plugin\n`);
	}

	// explore: runs crawler in Docker
	if (filteredArgs[0] === "explore") {
		if (noDocker || !isDockerAvailable()) {
			console.error("explore requires Docker");
			process.exit(1);
		}
		const image = getImage();
		const cwd = process.cwd();
		const dockerArgs = [
			"run", "--rm", "-v", `${cwd}:/work:z`, "-w", "/work",
			"--entrypoint", "node", image, "/app/dist/script/crawl-cli.js",
			...filteredArgs.slice(1),
		];
		const proc = spawn("docker", dockerArgs, { stdio: "inherit" });
		proc.on("close", (code) => process.exit(code ?? 1));
		return;
	}

	// --no-docker: fall back to local CLI
	if (noDocker || !isDockerAvailable()) {
		if (!noDocker) console.log("Docker not available, running locally (requires Playwright, FFmpeg, etc.)");
		process.argv = ["node", "demo-reel", ...filteredArgs];
		await import("./cli.js");
		return;
	}

	const image = getImage();
	const verbose = filteredArgs.includes("--verbose") || filteredArgs.includes("-v");

	// Find and compile .demo.ts configs
	let configJsonPath: string | undefined;
	const processedArgs: string[] = [];

	for (const arg of filteredArgs) {
		if (arg.endsWith(".demo.ts")) {
			const absPath = resolve(arg);
			if (existsSync(absPath)) {
				console.log(`Compiling ${arg} → JSON...`);
				configJsonPath = await compileConfig(absPath);
				processedArgs.push(relative(process.cwd(), configJsonPath));
			} else {
				processedArgs.push(arg);
			}
		} else {
			processedArgs.push(arg);
		}
	}

	// Check if scenario name resolves to .demo.ts
	if (!configJsonPath && processedArgs.length > 0 && !processedArgs[0].startsWith("-")) {
		const candidate = resolve(processedArgs[0] + ".demo.ts");
		if (existsSync(candidate)) {
			console.log(`Compiling ${processedArgs[0]}.demo.ts → JSON...`);
			configJsonPath = await compileConfig(candidate);
			processedArgs[0] = relative(process.cwd(), configJsonPath);
		}
	}

	// Auto-generate voice if needed
	if (configJsonPath) {
		try {
			await generateVoiceIfNeeded(configJsonPath, verbose);
		} catch (err) {
			// Clean up temp file on voice generation failure
			if (existsSync(configJsonPath)) {
				try { unlinkSync(configJsonPath); } catch { /* ignore */ }
			}
			throw err;
		}
	}

	runDocker(image, processedArgs, configJsonPath);
}

main().catch((err) => {
	console.error(`Error: ${err instanceof Error ? err.message : err}`);
	process.exit(1);
});
