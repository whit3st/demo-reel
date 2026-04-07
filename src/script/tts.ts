import { mkdir, writeFile, readFile, stat } from "fs/promises";
import { join, dirname } from "path";
import { createHash } from "crypto";
import { spawn } from "child_process";
import type { VoiceConfig, DemoScript, TimedScene } from "./types.js";

const CACHE_DIR = ".demo-reel-cache/voice";

export interface TTSProvider {
	name: string;
	generate(text: string, options: VoiceConfig): Promise<{ audio: Buffer; durationMs: number }>;
}

// --- OpenAI TTS Provider ---

async function generateOpenAI(
	text: string,
	options: VoiceConfig,
): Promise<{ audio: Buffer; durationMs: number }> {
	// Dynamic import to avoid requiring openai when not using this provider
	// @ts-ignore — openai is an optional peer dependency
	const openaiModule: any = await import("openai");
	const OpenAI = openaiModule.default;
	const client = new OpenAI();

	const response = await client.audio.speech.create({
		model: "tts-1",
		voice: options.voice as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer",
		input: text,
		speed: options.speed,
		response_format: "mp3",
	});

	const arrayBuffer = await response.arrayBuffer();
	const audio = Buffer.from(arrayBuffer);

	// Measure duration using ffprobe
	const durationMs = await measureAudioDuration(audio);

	return { audio, durationMs };
}

const providers: Record<string, TTSProvider> = {
	openai: {
		name: "openai",
		generate: generateOpenAI,
	},
};

/**
 * Get a TTS provider by name.
 */
export function getTTSProvider(name: string): TTSProvider {
	const provider = providers[name];
	if (!provider) {
		throw new Error(
			`Unknown TTS provider: "${name}". Available: ${Object.keys(providers).join(", ")}`,
		);
	}
	return provider;
}

// --- Audio utilities ---

/**
 * Measure audio duration in milliseconds using ffprobe.
 */
async function getFFmpegPath(): Promise<string> {
	const mod: any = await import("ffmpeg-static");
	const ffmpegPath = mod.default || mod;
	if (!ffmpegPath || typeof ffmpegPath !== "string") {
		throw new Error("ffmpeg-static not found");
	}
	return ffmpegPath;
}

async function measureAudioDuration(audioBuffer: Buffer): Promise<number> {
	const ffmpegPath = await getFFmpegPath();

	// ffprobe is alongside ffmpeg
	const ffprobePath = ffmpegPath.replace(/ffmpeg([^/\\]*)$/, "ffprobe$1");

	return new Promise((resolve, reject) => {
		const proc = spawn(ffprobePath, [
			"-v", "quiet",
			"-show_entries", "format=duration",
			"-of", "default=noprint_wrappers=1:nokey=1",
			"-i", "pipe:0",
		]);

		let output = "";
		proc.stdout.on("data", (data) => {
			output += data.toString();
		});

		proc.stderr.on("data", () => {
			// ignore stderr
		});

		proc.on("close", (code) => {
			if (code !== 0) {
				reject(new Error(`ffprobe exited with code ${code}`));
				return;
			}
			const seconds = parseFloat(output.trim());
			if (isNaN(seconds)) {
				reject(new Error("Could not parse audio duration"));
				return;
			}
			resolve(Math.round(seconds * 1000));
		});

		proc.stdin.write(audioBuffer);
		proc.stdin.end();
	});
}

/**
 * Concatenate audio buffers with silence gaps between them.
 * Returns the concatenated MP3 buffer.
 */
async function concatenateAudio(
	segments: { audio: Buffer; gapAfterMs: number }[],
): Promise<Buffer> {
	const ffmpegPath = await getFFmpegPath();

	// Write segments to temp files, build FFmpeg concat filter
	const tempDir = join(process.cwd(), ".demo-reel-cache", "temp");
	await mkdir(tempDir, { recursive: true });

	const inputFiles: string[] = [];
	const filterParts: string[] = [];
	let inputIndex = 0;

	for (let i = 0; i < segments.length; i++) {
		const segPath = join(tempDir, `seg-${i}.mp3`);
		await writeFile(segPath, segments[i].audio);
		inputFiles.push(segPath);

		filterParts.push(`[${inputIndex}:a]`);
		inputIndex++;

		// Add silence gap if needed
		if (segments[i].gapAfterMs > 0) {
			const silencePath = join(tempDir, `silence-${i}.mp3`);
			await generateSilence(ffmpegPath, silencePath, segments[i].gapAfterMs);
			inputFiles.push(silencePath);
			filterParts.push(`[${inputIndex}:a]`);
			inputIndex++;
		}
	}

	const outputPath = join(tempDir, "concatenated.mp3");

	// Build FFmpeg command for concatenation
	const args: string[] = [];
	for (const file of inputFiles) {
		args.push("-i", file);
	}

	const concatFilter = `${filterParts.join("")}concat=n=${filterParts.length}:v=0:a=1[out]`;
	args.push("-filter_complex", concatFilter, "-map", "[out]", "-y", outputPath);

	await runFFmpeg(ffmpegPath, args);

	const result = await readFile(outputPath);

	// Cleanup temp files
	const { unlink } = await import("fs/promises");
	for (const file of inputFiles) {
		await unlink(file).catch(() => {});
	}
	await unlink(outputPath).catch(() => {});

	return result;
}

async function generateSilence(
	ffmpegPath: string,
	outputPath: string,
	durationMs: number,
): Promise<void> {
	const durationSec = durationMs / 1000;
	await runFFmpeg(ffmpegPath, [
		"-f", "lavfi",
		"-i", `anullsrc=r=44100:cl=mono`,
		"-t", durationSec.toString(),
		"-q:a", "9",
		"-y", outputPath,
	]);
}

function runFFmpeg(ffmpegPath: string, args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const proc = spawn(ffmpegPath, args);

		proc.on("close", (code) => {
			if (code !== 0) {
				reject(new Error(`FFmpeg exited with code ${code}`));
				return;
			}
			resolve();
		});

		proc.on("error", reject);
	});
}

// --- Caching ---

function cacheKey(text: string, voice: VoiceConfig): string {
	const hash = createHash("sha256")
		.update(`${text}|${voice.provider}|${voice.voice}|${voice.speed}`)
		.digest("hex")
		.slice(0, 16);
	return hash;
}

async function getCached(key: string): Promise<Buffer | null> {
	const path = join(process.cwd(), CACHE_DIR, `${key}.mp3`);
	try {
		await stat(path);
		return await readFile(path);
	} catch {
		return null;
	}
}

async function setCache(key: string, audio: Buffer): Promise<void> {
	const dir = join(process.cwd(), CACHE_DIR);
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, `${key}.mp3`), audio);
}

// --- Main voice generation pipeline ---

interface VoiceSegment {
	sceneIndex: number;
	narration: string;
	audio: Buffer;
	durationMs: number;
}

/**
 * Generate voice audio for all scenes in a script.
 * Returns per-scene audio segments with measured durations.
 */
export async function generateVoiceSegments(
	script: DemoScript,
	voice: VoiceConfig,
	options: { noCache?: boolean; verbose?: boolean } = {},
): Promise<VoiceSegment[]> {
	const provider = getTTSProvider(voice.provider);
	const segments: VoiceSegment[] = [];

	for (let i = 0; i < script.scenes.length; i++) {
		const scene = script.scenes[i];
		const key = cacheKey(scene.narration, voice);

		// Check cache
		if (!options.noCache) {
			const cached = await getCached(key);
			if (cached) {
				const durationMs = await measureAudioDuration(cached);
				if (options.verbose) {
					console.log(`  Scene ${i + 1}: cached (${(durationMs / 1000).toFixed(1)}s)`);
				}
				segments.push({ sceneIndex: i, narration: scene.narration, audio: cached, durationMs });
				continue;
			}
		}

		if (options.verbose) {
			console.log(`  Scene ${i + 1}: generating voice...`);
		}

		const { audio, durationMs } = await provider.generate(scene.narration, voice);

		// Cache the result
		await setCache(key, audio);

		if (options.verbose) {
			console.log(`  Scene ${i + 1}: ${(durationMs / 1000).toFixed(1)}s`);
		}

		segments.push({ sceneIndex: i, narration: scene.narration, audio, durationMs });
	}

	return segments;
}

/**
 * Generate the full narration MP3 from voice segments.
 * Concatenates segments with silence gaps between scenes.
 */
export async function generateNarrationAudio(
	segments: VoiceSegment[],
	outputPath: string,
	options: { gapMs?: number; verbose?: boolean } = {},
): Promise<TimedScene[]> {
	const gapMs = options.gapMs ?? 800;

	await mkdir(dirname(outputPath), { recursive: true });

	// Build timed scenes with audio offset tracking
	const timedScenes: TimedScene[] = [];
	let currentOffsetMs = 0;

	const concatSegments: { audio: Buffer; gapAfterMs: number }[] = [];

	for (let i = 0; i < segments.length; i++) {
		const seg = segments[i];
		const isLast = i === segments.length - 1;
		const gap = isLast ? 0 : gapMs;

		timedScenes.push({
			narration: seg.narration,
			steps: [], // Will be filled by timing engine
			audioDurationMs: seg.durationMs,
			audioOffsetMs: currentOffsetMs,
			gapAfterMs: gap,
		});

		concatSegments.push({ audio: seg.audio, gapAfterMs: gap });
		currentOffsetMs += seg.durationMs + gap;
	}

	// Concatenate all segments into one MP3
	const concatenated = await concatenateAudio(concatSegments);
	await writeFile(outputPath, concatenated);

	if (options.verbose) {
		console.log(`Narration audio: ${outputPath} (${(currentOffsetMs / 1000).toFixed(1)}s)`);
	}

	return timedScenes;
}
