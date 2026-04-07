#!/usr/bin/env node
/**
 * Standalone voice generation script for use with Claude Code.
 * Usage: node dist/script/voice-cli.js <script.json> [--voice alloy] [--speed 1.0]
 *
 * Reads a .script.json, generates voiceover audio, updates the script with timing,
 * and outputs the narration MP3 path.
 */
import { readFile } from "fs/promises";
import { demoScriptSchema, type VoiceConfig } from "./types.js";
import { generateVoiceSegments, generateNarrationAudio } from "./tts.js";
import { synchronizeTiming } from "./timing.js";
import { writeScriptJson } from "./assembler.js";

async function main() {
	const args = process.argv.slice(2);
	let scriptPath: string | undefined;
	let voiceName = "alloy";
	let speed = 1.0;

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--voice") {
			voiceName = args[++i];
		} else if (args[i] === "--speed") {
			speed = parseFloat(args[++i]);
		} else if (!args[i].startsWith("-")) {
			scriptPath = args[i];
		}
	}

	if (!scriptPath) {
		console.error("Usage: node dist/script/voice-cli.js <script.json> [--voice alloy] [--speed 1.0]");
		process.exit(1);
	}

	const voice: VoiceConfig = { provider: "openai", voice: voiceName, speed };

	try {
		const raw = await readFile(scriptPath, "utf-8");
		const script = demoScriptSchema.parse(JSON.parse(raw));

		console.error(`Generating voice for ${script.scenes.length} scene(s)...`);

		const segments = await generateVoiceSegments(script, voice, { verbose: true });

		const audioPath = scriptPath.replace(/\.script\.json$/, "-narration.mp3");
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
