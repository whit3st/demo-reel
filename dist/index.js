import { execSync, spawn } from "child_process";
import { existsSync, writeFileSync, unlinkSync, mkdirSync } from "fs";
import { resolve, dirname, join, relative } from "path";

const DEFAULT_IMAGE = "ghcr.io/whit3st/demo-reel:latest";
const LOCAL_IMAGE = "demo-reel:latest";
const ENV_PASSTHROUGH = [
	"ELEVENLABS_KEY",
	"ELEVENLABS_API_KEY",
	"OPENAI_API_KEY",
	"ANTHROPIC_API_KEY",
];

/** Type-safe config helper. Returns config unchanged — types do the work. */
export function defineConfig(config) {
	return config;
}

/** Alias for defineConfig */
export const demo = defineConfig;

function isDockerAvailable() {
	try {
		execSync("docker info", { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

function getImage() {
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
 * Generate a demo video from a config object.
 *
 * Serializes the config to a temp JSON file and runs it via Docker.
 * Falls back to local Playwright execution if Docker is unavailable.
 */
export async function generate(config, options = {}) {
	const { verbose = false, noDocker = false } = options;
	const name = config.name || "demo";
	const outputDir = config.outputDir || "./output";

	// Auto-generate voice if scenes have narration + voice config
	const hasNarration = config.scenes?.some(s => s.narration);
	const hasVoice = config.voice;
	const resolvedOutputDir = resolve(outputDir);
	mkdirSync(resolvedOutputDir, { recursive: true });
	const audioPath = join(resolvedOutputDir, `${name}-narration.mp3`);

	if (hasNarration && hasVoice && !existsSync(audioPath)) {
		if (verbose) console.log("Generating voiceover via Docker...");

		// Write a script JSON for the voice CLI
		const scriptJson = {
			title: name,
			description: "",
			url: "",
			scenes: config.scenes.filter(s => s.narration).map(s => ({ narration: s.narration, steps: [] })),
			voice: config.voice,
		};
		const scriptPath = `.${name}.voice.tmp.json`;
		writeFileSync(scriptPath, JSON.stringify(scriptJson, null, 2), "utf-8");

		try {
			const image = getImage();
			const voiceArgs = [
				"run", "--rm",
				"-v", `${process.cwd()}:/work:z`,
				"-w", "/work",
			];
			for (const envVar of ENV_PASSTHROUGH) {
				if (process.env[envVar]) voiceArgs.push("-e", `${envVar}=${process.env[envVar]}`);
			}
			voiceArgs.push(
				"--entrypoint", "node",
				image,
				"/app/dist/script/voice-cli.js",
				scriptPath,
			);
			execSync(`docker ${voiceArgs.join(" ")}`, { stdio: "inherit" });
		} finally {
			try { unlinkSync(scriptPath); } catch { /* ignore */ }
		}
	}

	// Inject audio config if narration was generated
	const configWithAudio = { ...config };
	if (hasNarration && existsSync(audioPath)) {
		configWithAudio.audio = {
			...config.audio,
			narration: relative(process.cwd(), audioPath),
			narrationDelay: config.audio?.narrationDelay ?? 300,
		};
		configWithAudio.outputFormat = "mp4";
	}

	const jsonPath = `.${name}.tmp.json`;

	try {
		writeFileSync(jsonPath, JSON.stringify(configWithAudio, null, 2), "utf-8");
	} catch (err) {
		throw new Error(`Failed to write config: ${err.message}`);
	}

	const relJsonPath = relative(process.cwd(), jsonPath);
	const cliArgs = [relJsonPath];
	if (verbose) cliArgs.push("--verbose");

	try {
		if (!noDocker && isDockerAvailable()) {
			const image = getImage();
			if (verbose) console.log(`Using Docker image: ${image}`);

			const dockerArgs = [
				"run", "--rm",
				"-v", `${process.cwd()}:/work:z`,
				"-w", "/work",
			];

			for (const envVar of ENV_PASSTHROUGH) {
				if (process.env[envVar]) {
					dockerArgs.push("-e", `${envVar}=${process.env[envVar]}`);
				}
			}

			dockerArgs.push(image, ...cliArgs);

			await new Promise((resolvePromise, reject) => {
				const proc = spawn("docker", dockerArgs, {
					stdio: "inherit",
					env: process.env,
				});
				proc.on("close", (code) => {
					if (code === 0) resolvePromise();
					else reject(new Error(`Docker exited with code ${code}`));
				});
				proc.on("error", reject);
			});
		} else {
			if (!noDocker) {
				console.log("Docker not available, running locally (requires Playwright, FFmpeg, etc.)");
			}
			const { loadConfig } = await import("./config-loader.js");
			const { runVideoScenario } = await import("./video-handler.js");

			const loaded = await loadConfig(resolve(jsonPath));
			await runVideoScenario(loaded.config, loaded.outputPath, loaded.configPath, { verbose });
		}
	} finally {
		try { unlinkSync(jsonPath); } catch { /* ignore */ }
	}
}
