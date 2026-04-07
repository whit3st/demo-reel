#!/usr/bin/env node
/**
 * Standalone voice generation script for use with Claude Code.
 * Usage: node dist/script/voice-cli.js <script.json> [--voice alloy] [--speed 1.0]
 *
 * Reads a .script.json, generates voiceover audio, updates the script with timing,
 * and outputs the narration MP3 path.
 */
import { readFile, mkdir } from "fs/promises";
import { dirname, join, basename } from "path";
import { demoScriptSchema, type VoiceConfig } from "./types.js";
import { generateVoiceSegments, generateNarrationAudio } from "./tts.js";
import { synchronizeTiming } from "./timing.js";
import { writeScriptJson } from "./assembler.js";

async function main() {
	const args = process.argv.slice(2);
	let scriptPath: string | undefined;
	let providerName = "piper";
	let voiceName = "nl_NL-mls-medium";
	let speed = 1.0;
	let pronunciation: Record<string, string> | undefined;

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--provider") {
			providerName = args[++i];
		} else if (args[i] === "--voice") {
			voiceName = args[++i];
		} else if (args[i] === "--speed") {
			speed = parseFloat(args[++i]);
		} else if (args[i] === "--pronunciation") {
			// Accept inline JSON or a file path
			const val = args[++i];
			if (val.startsWith("{")) {
				pronunciation = JSON.parse(val);
			} else {
				pronunciation = JSON.parse(await readFile(val, "utf-8"));
			}
		} else if (!args[i].startsWith("-")) {
			scriptPath = args[i];
		}
	}

	if (!scriptPath) {
		console.error("Usage: node dist/script/voice-cli.js <script.json> [--provider piper] [--voice nl_NL-mls-medium] [--speed 1.0] [--pronunciation '{\"template\":\"templayt\"}']");
		process.exit(1);
	}

	const voice: VoiceConfig = { provider: providerName as VoiceConfig["provider"], voice: voiceName, speed, pronunciation };

	try {
		const raw = await readFile(scriptPath, "utf-8");
		const script = demoScriptSchema.parse(JSON.parse(raw));

		console.error(`Generating voice for ${script.scenes.length} scene(s)...`);

		const segments = await generateVoiceSegments(script, voice, { verbose: true });

		// Output narration to output/ subfolder next to the script file
		const scriptDir = dirname(scriptPath);
		const scriptBase = basename(scriptPath, ".script.json");
		const outputDir = join(scriptDir, "output");
		await mkdir(outputDir, { recursive: true });
		const audioPath = join(outputDir, `${scriptBase}-narration.mp3`);
		const timedScenes = await generateNarrationAudio(segments, audioPath, { verbose: true });

		const timedScript = synchronizeTiming(script, timedScenes, audioPath);
		await writeScriptJson(timedScript, scriptPath);

		// Output the audio path to stdout for Claude Code to pick up
		console.log(audioPath);
	} catch (error) {
		console.error(`Error: ${error instanceof Error ? error.message : error}`);
		process.exit(1);
	}
}

main();
