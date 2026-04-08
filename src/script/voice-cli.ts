#!/usr/bin/env -S node --import tsx/esm
/**
 * Generate voiceover audio for a demo script.
 *
 * Voice config priority: CLI flags > script.json voice field > product config.json > defaults
 *
 * Usage: node dist/script/voice-cli.js <script.json> [options]
 */
import { readFile, mkdir, stat } from "fs/promises";
import { dirname, join, basename, resolve } from "path";
import { demoScriptSchema, voiceConfigSchema, type VoiceConfig } from "./types.js";
import { generateVoiceSegments, generateNarrationAudio } from "./tts.js";
import { synchronizeTiming } from "./timing.js";
import { writeScriptJson } from "./assembler.js";

/**
 * Walk up from scriptPath looking for a config.json with voice settings.
 * Stops at the demos/ directory or after 3 levels.
 */
async function loadProductConfig(scriptPath: string): Promise<Partial<VoiceConfig>> {
	let dir = dirname(resolve(scriptPath));
	for (let i = 0; i < 4; i++) {
		const configPath = join(dir, "config.json");
		try {
			await stat(configPath);
			const raw = await readFile(configPath, "utf-8");
			const config = JSON.parse(raw);
			if (config.voice) {
				return config.voice;
			}
		} catch {
			// No config here, keep walking up
		}
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return {};
}

async function main() {
	const args = process.argv.slice(2);
	let scriptPath: string | undefined;

	// CLI overrides (undefined means "not set, use lower priority")
	let cliProvider: string | undefined;
	let cliVoice: string | undefined;
	let cliSpeed: number | undefined;
	let cliPronunciation: Record<string, string> | undefined;

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--provider") {
			cliProvider = args[++i];
		} else if (args[i] === "--voice") {
			cliVoice = args[++i];
		} else if (args[i] === "--speed") {
			cliSpeed = parseFloat(args[++i]);
		} else if (args[i] === "--pronunciation") {
			const val = args[++i];
			if (val.startsWith("{")) {
				cliPronunciation = JSON.parse(val);
			} else {
				cliPronunciation = JSON.parse(await readFile(val, "utf-8"));
			}
		} else if (!args[i].startsWith("-")) {
			scriptPath = args[i];
		}
	}

	if (!scriptPath) {
		console.error("Usage: node dist/script/voice-cli.js <script.json> [--provider piper] [--voice nl_NL-mls-medium] [--speed 1.0]");
		console.error("\nVoice config priority: CLI flags > script.json > product config.json > defaults");
		process.exit(1);
	}

	try {
		const raw = await readFile(scriptPath, "utf-8");
		const script = demoScriptSchema.parse(JSON.parse(raw));

		// Build voice config with priority chain:
		// 1. Defaults
		const defaults = voiceConfigSchema.parse({});

		// 2. Product config.json
		const productConfig = await loadProductConfig(scriptPath);

		// 3. Script-level voice config
		const scriptVoice: Partial<VoiceConfig> = script.voice ?? {};

		// 4. CLI overrides
		const voice: VoiceConfig = {
			provider: (cliProvider ?? scriptVoice.provider ?? productConfig.provider ?? defaults.provider) as VoiceConfig["provider"],
			voice: cliVoice ?? scriptVoice.voice ?? productConfig.voice ?? defaults.voice,
			speed: cliSpeed ?? scriptVoice.speed ?? productConfig.speed ?? defaults.speed,
			pronunciation: cliPronunciation ?? scriptVoice.pronunciation ?? productConfig.pronunciation ?? defaults.pronunciation,
		};

		console.error(`Voice: ${voice.provider}/${voice.voice} (speed: ${voice.speed})`);
		if (voice.pronunciation) {
			console.error(`Pronunciation: ${Object.entries(voice.pronunciation).map(([k, v]) => `${k}→${v}`).join(", ")}`);
		}
		console.error(`Generating voice for ${script.scenes.length} scene(s)...`);

		const segments = await generateVoiceSegments(script, voice, { verbose: true });

		// Output narration to output/ subfolder next to the script file
		const scriptDir = dirname(scriptPath);
		const scriptBase = basename(scriptPath, ".script.json");
		const outputDir = join(scriptDir, "output");
		await mkdir(outputDir, { recursive: true });
		const audioPath = join(outputDir, `${scriptBase}-narration.mp3`);
		const timedScenes = await generateNarrationAudio(segments, audioPath, { verbose: true });

		// Save voice config into the script so it's reproducible
		const timedScript = synchronizeTiming(script, timedScenes, audioPath);
		await writeScriptJson({ ...timedScript, voice }, scriptPath);

		console.log(audioPath);
	} catch (error) {
		console.error(`Error: ${error instanceof Error ? error.message : error}`);
		process.exit(1);
	}
}

main();
