import { readFile } from "fs/promises";
import { generateScript, validateScript, fixBrokenSteps } from "./generator.js";
import { generateVoiceSegments, generateNarrationAudio } from "./tts.js";
import { synchronizeTiming } from "./timing.js";
import { writeDemoConfig, writeScriptJson } from "./assembler.js";
import { demoScriptSchema, type VoiceConfig } from "./types.js";
import { resolveVoiceConfig } from "../voice-config.js";

function pickVoiceOverrides(source: Partial<VoiceConfig> | undefined) {
	if (!source) {
		return {};
	}

	return {
		provider: source.provider,
		voicePath: "voicePath" in source ? source.voicePath : undefined,
		voice: "voice" in source ? source.voice : undefined,
		speed: source.speed,
		pronunciation: source.pronunciation,
	};
}

export interface ScriptCliOptions {
	verbose?: boolean;
	headed?: boolean;
	noCache?: boolean;
}

/**
 * Generate a script from natural language description.
 * `demo-reel script generate "description" --url <url>`
 */
export async function scriptGenerate(
	description: string,
	url: string,
	outputName: string,
	options: ScriptCliOptions & { hints?: string[] } = {},
): Promise<string> {
	const { verbose, headed, hints } = options;

	if (verbose) {
		console.log("=== Script Generation ===");
	}

	const script = await generateScript({ description, url, hints, headed, verbose });

	const outputPath = `${outputName}.script.json`;
	await writeScriptJson(script, outputPath);

	console.log(`✓ Script generated → ${outputPath}`);
	return outputPath;
}

/**
 * Generate voiceover audio from a script file.
 * `demo-reel script voice <script.json>`
 */
export async function scriptVoice(
	scriptPath: string,
	voice: VoiceConfig,
	options: ScriptCliOptions = {},
): Promise<string> {
	const { verbose, noCache } = options;

	if (verbose) {
		console.log("=== Voice Generation ===");
	}

	const raw = await readFile(scriptPath, "utf-8");
	const script = demoScriptSchema.parse(JSON.parse(raw));

	if (verbose) {
		console.log(`Generating voice for ${script.scenes.length} scene(s)...`);
	}

	const segments = await generateVoiceSegments(script, voice, { noCache, verbose });

	const audioPath = scriptPath.replace(/\.script\.json$/, "-narration.mp3");
	const { timedScenes, narrationManifestPath } = await generateNarrationAudio(segments, audioPath, { verbose });

	// Update script file with timing info
	const timedScript = synchronizeTiming(script, timedScenes, audioPath);
	await writeScriptJson({ ...timedScript, narrationManifestPath }, scriptPath);

	console.log(`✓ Voice generated → ${audioPath}`);
	return audioPath;
}

/**
 * Build a .demo.ts from a timed script.
 * `demo-reel script build <script.json>`
 */
export async function scriptBuild(
	scriptPath: string,
	options: ScriptCliOptions & { resolution?: string; format?: string } = {},
): Promise<string> {
	const { verbose, resolution, format } = options;

	if (verbose) {
		console.log("=== Scenario Build ===");
	}

	const raw = await readFile(scriptPath, "utf-8");
	const script = JSON.parse(raw);

	if (!script.audioPath) {
		throw new Error(
			"Script has no audio timing data. Run `demo-reel script voice` first.",
		);
	}

	const outputPath = scriptPath.replace(/\.script\.json$/, ".demo.ts");
	await writeDemoConfig(script, outputPath, { resolution, format });

	console.log(`✓ Scenario built → ${outputPath}`);
	return outputPath;
}

/**
 * Validate a script by executing steps in a headless browser.
 * `demo-reel script validate <script.json>`
 */
export async function scriptValidate(
	scriptPath: string,
	options: ScriptCliOptions = {},
): Promise<boolean> {
	const { verbose, headed } = options;

	if (verbose) {
		console.log("=== Script Validation ===");
	}

	const raw = await readFile(scriptPath, "utf-8");
	const script = demoScriptSchema.parse(JSON.parse(raw));

	console.log(`Validating ${script.scenes.length} scene(s)...`);

	const failures = await validateScript(script, { headed, verbose });

	if (failures.length === 0) {
		console.log("✓ All steps passed");
		return true;
	}

	console.log(`\n✗ ${failures.length} step(s) failed:`);
	for (const f of failures) {
		const scene = script.scenes[f.scene];
		console.log(`  Scene ${f.scene + 1}, Step ${f.step + 1} (${(scene.steps[f.step] as { action: string }).action}): ${f.error}`);
	}

	return false;
}

/**
 * Fix broken steps in a script by re-crawling and using LLM.
 * `demo-reel script fix <script.json>`
 */
export async function scriptFix(
	scriptPath: string,
	options: ScriptCliOptions = {},
): Promise<void> {
	const { verbose, headed } = options;

	if (verbose) {
		console.log("=== Script Fix ===");
	}

	const raw = await readFile(scriptPath, "utf-8");
	const script = demoScriptSchema.parse(JSON.parse(raw));

	// First validate to find broken steps
	console.log("Validating current script...");
	const failures = await validateScript(script, { headed, verbose });

	if (failures.length === 0) {
		console.log("✓ No broken steps found");
		return;
	}

	console.log(`Found ${failures.length} broken step(s), fixing...`);

	const fixed = await fixBrokenSteps(script, failures, { verbose });

	await writeScriptJson(fixed, scriptPath);
	console.log(`✓ Fixed script written → ${scriptPath}`);

	// Re-validate
	console.log("Re-validating...");
	const remaining = await validateScript(fixed, { verbose });

	if (remaining.length === 0) {
		console.log("✓ All steps now pass");
	} else {
		console.log(`⚠ ${remaining.length} step(s) still failing — may need manual fixes`);
	}
}

/**
 * Full pipeline: describe → script → voice → build → record.
 * `demo-reel script "description" --url <url>`
 */
export async function scriptFullPipeline(
	description: string,
	url: string,
	options: ScriptCliOptions & {
		output?: string;
		voice?: Partial<VoiceConfig>;
		hints?: string[];
		resolution?: string;
		format?: string;
	} = {},
): Promise<string> {
	const outputName = options.output || "demo";
	const voiceOverrides = pickVoiceOverrides(options.voice);
	const voice = resolveVoiceConfig({
		provider: voiceOverrides.provider || "openai",
		voicePath: voiceOverrides.voicePath,
		voice: voiceOverrides.voice,
		speed: voiceOverrides.speed || 1.0,
		pronunciation: voiceOverrides.pronunciation,
	});

	// Step 1: Generate script
	console.log("\n▶ Generating script...");
	const scriptPath = await scriptGenerate(description, url, outputName, options);

	// Step 2: Validate script
	console.log("\n▶ Validating script...");
	const valid = await scriptValidate(scriptPath, options);

	if (!valid) {
		console.log("\n▶ Attempting to fix broken steps...");
		await scriptFix(scriptPath, options);
	}

	// Step 3: Generate voice
	console.log("\n▶ Generating voiceover...");
	await scriptVoice(scriptPath, voice, options);

	// Step 4: Build scenario
	console.log("\n▶ Building scenario...");
	const demoPath = await scriptBuild(scriptPath, options);

	console.log(`\n✓ Pipeline complete. Run \`demo-reel ${outputName}\` to record the video.`);

	return demoPath;
}
