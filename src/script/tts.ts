import { mkdir, writeFile, readFile, stat, unlink } from "fs/promises";
import { join, dirname } from "path";
import { createHash } from "crypto";
import { spawn } from "child_process";
import type { VoiceConfig, DemoScript, TimedScene } from "./types.js";

const CACHE_DIR = ".demo-reel-cache/voice";

// --- Provider interface ---

export interface TTSProvider {
	name: string;
	generate(text: string, options: VoiceConfig): Promise<{ audio: Buffer; durationMs: number }>;
}

// --- Audio utilities (shared by all providers) ---

async function getFFmpegPath(): Promise<string> {
	const mod: any = await import("ffmpeg-static");
	const ffmpegPath = mod.default || mod;
	if (!ffmpegPath || typeof ffmpegPath !== "string") {
		throw new Error("ffmpeg-static not found");
	}
	return ffmpegPath;
}

function getFFprobePath(ffmpegPath: string): string {
	return ffmpegPath.replace(/ffmpeg([^/\\]*)$/, "ffprobe$1");
}

export async function measureAudioDuration(audioBuffer: Buffer): Promise<number> {
	const ffmpegPath = await getFFmpegPath();
	const ffprobePath = getFFprobePath(ffmpegPath);

	return new Promise((resolve, reject) => {
		const proc = spawn(ffprobePath, [
			"-v", "quiet",
			"-show_entries", "format=duration",
			"-of", "default=noprint_wrappers=1:nokey=1",
			"-i", "pipe:0",
		]);

		let output = "";
		proc.stdout.on("data", (data: Buffer) => { output += data.toString(); });
		proc.stderr.on("data", () => {});

		proc.on("close", (code) => {
			if (code !== 0) { reject(new Error(`ffprobe exited with code ${code}`)); return; }
			const seconds = parseFloat(output.trim());
			if (isNaN(seconds)) { reject(new Error("Could not parse audio duration")); return; }
			resolve(Math.round(seconds * 1000));
		});

		proc.stdin.write(audioBuffer);
		proc.stdin.end();
	});
}

function runFFmpeg(ffmpegPath: string, args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const proc = spawn(ffmpegPath, args);
		let stderr = "";
		proc.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });
		proc.on("close", (code) => {
			if (code !== 0) { reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-200)}`)); return; }
			resolve();
		});
		proc.on("error", reject);
	});
}

/** Convert WAV buffer to MP3 buffer via FFmpeg. */
async function wavToMp3(wavBuffer: Buffer): Promise<Buffer> {
	const ffmpegPath = await getFFmpegPath();
	const tempDir = join(process.cwd(), ".demo-reel-cache", "temp");
	await mkdir(tempDir, { recursive: true });

	const wavPath = join(tempDir, `convert-${Date.now()}.wav`);
	const mp3Path = join(tempDir, `convert-${Date.now()}.mp3`);

	await writeFile(wavPath, wavBuffer);
	await runFFmpeg(ffmpegPath, ["-i", wavPath, "-codec:a", "libmp3lame", "-q:a", "2", "-y", mp3Path]);

	const mp3Buffer = await readFile(mp3Path);
	await unlink(wavPath).catch(() => {});
	await unlink(mp3Path).catch(() => {});
	return mp3Buffer;
}

// --- Piper TTS Provider (local, free) ---

const PIPER_DEFAULT_MODEL_DIR = join(
	process.env.HOME || process.env.USERPROFILE || ".",
	".local", "share", "piper-voices",
);

async function findPiperBinary(): Promise<string> {
	// Check common locations
	for (const name of ["piper", "piper-tts"]) {
		try {
			const result = await new Promise<string>((resolve, reject) => {
				const proc = spawn("which", [name]);
				let out = "";
				proc.stdout.on("data", (d: Buffer) => { out += d.toString(); });
				proc.on("close", (code) => code === 0 ? resolve(out.trim()) : reject());
				proc.on("error", reject);
			});
			if (result) return result;
		} catch { /* continue */ }
	}
	throw new Error("Piper not found. Install with: pip install piper-tts");
}

function resolvePiperModel(voice: string): string {
	// If it's an absolute path, use it directly
	if (voice.startsWith("/") || voice.includes(".onnx")) {
		return voice;
	}
	// Otherwise look in the default model directory
	return join(PIPER_DEFAULT_MODEL_DIR, `${voice}.onnx`);
}

async function generatePiper(
	text: string,
	options: VoiceConfig,
): Promise<{ audio: Buffer; durationMs: number }> {
	const piperPath = await findPiperBinary();
	const modelPath = resolvePiperModel(options.voice);

	// Verify model exists
	try {
		await stat(modelPath);
	} catch {
		throw new Error(
			`Piper voice model not found: ${modelPath}\n` +
			`Download Dutch voice: curl -sL https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_NL/mls/medium/nl_NL-mls-medium.onnx -o ${PIPER_DEFAULT_MODEL_DIR}/nl_NL-mls-medium.onnx`,
		);
	}

	const tempDir = join(process.cwd(), ".demo-reel-cache", "temp");
	await mkdir(tempDir, { recursive: true });
	const wavPath = join(tempDir, `piper-${Date.now()}.wav`);

	// Run piper: echo text | piper --model <model> --output_file <wav>
	await new Promise<void>((resolve, reject) => {
		const args = ["--model", modelPath, "--output_file", wavPath];
		if (options.speed !== 1.0) {
			args.push("--length_scale", String(1.0 / options.speed));
		}
		const proc = spawn(piperPath, args);
		let stderr = "";
		proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
		proc.on("close", (code) => {
			if (code !== 0) { reject(new Error(`Piper exited with code ${code}: ${stderr}`)); return; }
			resolve();
		});
		proc.on("error", reject);
		proc.stdin.write(text);
		proc.stdin.end();
	});

	const wavBuffer = await readFile(wavPath);
	await unlink(wavPath).catch(() => {});

	// Convert WAV to MP3
	const audio = await wavToMp3(wavBuffer);
	const durationMs = await measureAudioDuration(audio);

	return { audio, durationMs };
}

// --- OpenAI TTS Provider ---

async function generateOpenAI(
	text: string,
	options: VoiceConfig,
): Promise<{ audio: Buffer; durationMs: number }> {
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
	const durationMs = await measureAudioDuration(audio);

	return { audio, durationMs };
}

// --- Provider registry ---

const providers: Record<string, TTSProvider> = {
	piper: { name: "piper", generate: generatePiper },
	openai: { name: "openai", generate: generateOpenAI },
};

export function getTTSProvider(name: string): TTSProvider {
	const provider = providers[name];
	if (!provider) {
		throw new Error(
			`Unknown TTS provider: "${name}". Available: ${Object.keys(providers).join(", ")}`,
		);
	}
	return provider;
}

export function registerTTSProvider(provider: TTSProvider): void {
	providers[provider.name] = provider;
}

// --- Caching ---

function cacheKey(text: string, voice: VoiceConfig): string {
	return createHash("sha256")
		.update(`${text}|${voice.provider}|${voice.voice}|${voice.speed}`)
		.digest("hex")
		.slice(0, 16);
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

// --- Concatenation ---

async function generateSilence(ffmpegPath: string, outputPath: string, durationMs: number): Promise<void> {
	await runFFmpeg(ffmpegPath, [
		"-f", "lavfi", "-i", `anullsrc=r=44100:cl=mono`,
		"-t", (durationMs / 1000).toString(),
		"-q:a", "9", "-y", outputPath,
	]);
}

async function concatenateAudio(segments: { audio: Buffer; gapAfterMs: number }[]): Promise<Buffer> {
	const ffmpegPath = await getFFmpegPath();
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

		if (segments[i].gapAfterMs > 0) {
			const silencePath = join(tempDir, `silence-${i}.mp3`);
			await generateSilence(ffmpegPath, silencePath, segments[i].gapAfterMs);
			inputFiles.push(silencePath);
			filterParts.push(`[${inputIndex}:a]`);
			inputIndex++;
		}
	}

	const outputPath = join(tempDir, "concatenated.mp3");
	const args: string[] = [];
	for (const file of inputFiles) args.push("-i", file);
	const concatFilter = `${filterParts.join("")}concat=n=${filterParts.length}:v=0:a=1[out]`;
	args.push("-filter_complex", concatFilter, "-map", "[out]", "-y", outputPath);

	await runFFmpeg(ffmpegPath, args);
	const result = await readFile(outputPath);

	for (const file of inputFiles) await unlink(file).catch(() => {});
	await unlink(outputPath).catch(() => {});

	return result;
}

// --- Main voice generation pipeline ---

interface VoiceSegment {
	sceneIndex: number;
	narration: string;
	audio: Buffer;
	durationMs: number;
}

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

		if (!options.noCache) {
			const cached = await getCached(key);
			if (cached) {
				const durationMs = await measureAudioDuration(cached);
				if (options.verbose) console.log(`  Scene ${i + 1}: cached (${(durationMs / 1000).toFixed(1)}s)`);
				segments.push({ sceneIndex: i, narration: scene.narration, audio: cached, durationMs });
				continue;
			}
		}

		if (options.verbose) console.log(`  Scene ${i + 1}: generating voice...`);
		const { audio, durationMs } = await provider.generate(scene.narration, voice);
		await setCache(key, audio);
		if (options.verbose) console.log(`  Scene ${i + 1}: ${(durationMs / 1000).toFixed(1)}s`);

		segments.push({ sceneIndex: i, narration: scene.narration, audio, durationMs });
	}

	return segments;
}

export async function generateNarrationAudio(
	segments: VoiceSegment[],
	outputPath: string,
	options: { gapMs?: number; verbose?: boolean } = {},
): Promise<TimedScene[]> {
	const gapMs = options.gapMs ?? 800;
	await mkdir(dirname(outputPath), { recursive: true });

	const timedScenes: TimedScene[] = [];
	let currentOffsetMs = 0;
	const concatSegments: { audio: Buffer; gapAfterMs: number }[] = [];

	for (let i = 0; i < segments.length; i++) {
		const seg = segments[i];
		const isLast = i === segments.length - 1;
		const gap = isLast ? 0 : gapMs;

		timedScenes.push({
			narration: seg.narration,
			steps: [],
			audioDurationMs: seg.durationMs,
			audioOffsetMs: currentOffsetMs,
			gapAfterMs: gap,
		});

		concatSegments.push({ audio: seg.audio, gapAfterMs: gap });
		currentOffsetMs += seg.durationMs + gap;
	}

	const concatenated = await concatenateAudio(concatSegments);
	await writeFile(outputPath, concatenated);

	if (options.verbose) {
		console.log(`Narration audio: ${outputPath} (${(currentOffsetMs / 1000).toFixed(1)}s)`);
	}

	return timedScenes;
}
