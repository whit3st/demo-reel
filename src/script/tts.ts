import { mkdir, writeFile, readFile, stat, unlink } from "fs/promises";
import { join, dirname, relative } from "path";
import { createHash } from "crypto";
import { spawn } from "child_process";
import type { DemoScript, TimedScene } from "./types.js";
import { getVoiceName, type VoiceConfig } from "../voice-config.js";
import { ensurePiperBinary, ensurePiperModel } from "../piper.js";
import {
  getNarrationClipDir,
  getNarrationClipFileName,
  getNarrationManifestPath,
  NARRATION_PROCESSING_VERSION,
  type NarrationManifest,
} from "../narration-manifest.js";

const CACHE_DIR = ".demo-reel-cache/voice";
const VOICE_CACHE_VERSION = NARRATION_PROCESSING_VERSION;

// --- Provider interface ---

export interface TTSProvider {
  name: string;
  generate(text: string, options: VoiceConfig): Promise<{ audio: Buffer; durationMs: number }>;
}

// --- Audio utilities (re-exported from shared FFmpeg module) ---

import {
  getFfmpegPath as _getFfmpegPath,
  getFfprobePath as _getFfprobePath,
  runFFmpeg,
  runFfprobe,
  measureAudioDuration,
  wavToMp3,
  generateSilence,
  concatenateAudio,
} from "../ffmpeg/utils.js";

export { runFFmpeg, runFfprobe, measureAudioDuration, wavToMp3, generateSilence, concatenateAudio };

export const getFFmpegPath = _getFfmpegPath;

export async function getFFprobePath(ffmpegPath?: string): Promise<string> {
  if (ffmpegPath) {
    const adjacent = ffmpegPath.replace(/ffmpeg([^/\\]*)$/, "ffprobe$1");
    try {
      await stat(adjacent);
      return adjacent;
    } catch {
      return "ffprobe";
    }
  }
  return _getFfprobePath();
}

// --- Piper TTS Provider (local, free) ---

async function findPiperBinary(): Promise<string> {
  try {
    return await ensurePiperBinary();
  } catch {}

  for (const name of ["piper", "piper-tts"]) {
    try {
      const result = await new Promise<string>((resolve, reject) => {
        const proc = spawn("which", [name]);
        let out = "";
        proc.stdout.on("data", (d: Buffer) => {
          out += d.toString();
        });
        proc.on("close", (code) => (code === 0 ? resolve(out.trim()) : reject()));
        proc.on("error", reject);
      });
      if (result) return result;
    } catch {}
  }
  throw new Error("Piper not found. Install with: pip install piper-tts");
}

function getPiperModelDir(voice: string): string {
  if (voice.startsWith("/") || voice.includes(".onnx")) {
    return dirname(voice);
  }
  return (
    process.env.PIPER_VOICE_DIR ||
    join(process.env.HOME || process.env.USERPROFILE || ".", ".local", "share", "piper-voices")
  );
}

async function getPiperModelPath(options: VoiceConfig): Promise<string> {
  if ("voicePath" in options) {
    const voice = options.voicePath;
    if (voice.startsWith("/") || voice.includes(".onnx")) {
      return voice;
    }
  }

  const voiceDir = getPiperModelDir("voicePath" in options ? options.voicePath : options.voice);
  const voiceName = "voicePath" in options ? options.voicePath : options.voice;

  if ("voicePath" in options) {
    return join(voiceDir, `${voiceName}.onnx`);
  }

  try {
    return await ensurePiperModel(voiceName, voiceDir);
  } catch (error) {
    throw new Error(
      `Piper voice model not found: ${voiceName}\n` +
        `${error instanceof Error ? error.message : error}`,
    );
  }
}

async function generatePiper(
  text: string,
  options: Extract<VoiceConfig, { provider: "piper" }>,
): Promise<{ audio: Buffer; durationMs: number }> {
  const piperPath = await findPiperBinary();
  const modelPath = await getPiperModelPath(options);

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
    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Piper exited with code ${code}: ${stderr}`));
        return;
      }
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
  options: Extract<VoiceConfig, { provider: "openai" }>,
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

// --- ElevenLabs TTS Provider ---

async function generateElevenLabs(
  text: string,
  options: Extract<VoiceConfig, { provider: "elevenlabs" }>,
): Promise<{ audio: Buffer; durationMs: number }> {
  const apiKey = process.env.ELEVENLABS_KEY || process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ElevenLabs API key not found. Set ELEVENLABS_KEY or ELEVENLABS_API_KEY env var.",
    );
  }

  // Default to a good multilingual voice
  const voiceId = options.voice || "21m00Tcm4TlvDq8ikWAM"; // "Rachel" - good for multilingual

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        speed: options.speed,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ElevenLabs API error ${response.status}: ${body}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const audio = Buffer.from(arrayBuffer);
  const durationMs = await measureAudioDuration(audio);

  return { audio, durationMs };
}

// --- Provider registry ---

const providers: Record<string, TTSProvider> = {
  piper: {
    name: "piper",
    generate: (text, options) =>
      generatePiper(text, options as Extract<VoiceConfig, { provider: "piper" }>),
  },
  openai: {
    name: "openai",
    generate: (text, options) =>
      generateOpenAI(text, options as Extract<VoiceConfig, { provider: "openai" }>),
  },
  elevenlabs: {
    name: "elevenlabs",
    generate: (text, options) =>
      generateElevenLabs(text, options as Extract<VoiceConfig, { provider: "elevenlabs" }>),
  },
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
    .update(
      `${VOICE_CACHE_VERSION}|${text}|${voice.provider}|${getVoiceName(voice)}|${voice.speed}`,
    )
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

// --- Main voice generation pipeline ---

interface VoiceSegment {
  sceneIndex: number;
  stepIndex?: number;
  sourceSceneIndex?: number;
  narration: string;
  audio: Buffer;
  durationMs: number;
}

/**
 * Apply pronunciation replacements to text before sending to TTS.
 * Replacements are case-insensitive and match whole words.
 */
export function applyPronunciation(text: string, pronunciation?: Record<string, string>): string {
  if (!pronunciation) return text;
  let result = text;
  for (const [word, replacement] of Object.entries(pronunciation)) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    result = result.replace(regex, replacement);
  }
  return result;
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
        if (options.verbose)
          console.log(`  Scene ${i + 1}: cached (${(durationMs / 1000).toFixed(1)}s)`);
        segments.push({
          sceneIndex: i,
          stepIndex: scene.stepIndex,
          sourceSceneIndex: scene.sourceSceneIndex ?? i,
          narration: scene.narration,
          audio: cached,
          durationMs,
        });
        continue;
      }
    }

    if (options.verbose) console.log(`  Scene ${i + 1}: generating voice...`);

    // Apply pronunciation map before TTS
    const ttsText = applyPronunciation(scene.narration, voice.pronunciation);
    const generated = await provider.generate(ttsText, voice);
    const { audio, durationMs } = generated;
    await setCache(key, audio);
    if (options.verbose) console.log(`  Scene ${i + 1}: ${(durationMs / 1000).toFixed(1)}s`);

    // Store the original narration (for subtitles), not the pronunciation-adjusted text
    segments.push({
      sceneIndex: i,
      stepIndex: scene.stepIndex,
      sourceSceneIndex: scene.sourceSceneIndex ?? i,
      narration: scene.narration,
      audio,
      durationMs,
    });
  }

  return segments;
}

export async function generateNarrationAudio(
  segments: VoiceSegment[],
  outputPath: string,
  options: { gapMs?: number; verbose?: boolean } = {},
): Promise<{ timedScenes: TimedScene[]; narrationManifestPath: string }> {
  const gapMs = options.gapMs ?? 800;
  await mkdir(dirname(outputPath), { recursive: true });
  const clipDir = getNarrationClipDir(outputPath);
  const narrationManifestPath = getNarrationManifestPath(outputPath);
  await mkdir(clipDir, { recursive: true });

  const timedScenes: TimedScene[] = [];
  const manifest: NarrationManifest = {
    version: 1,
    processingVersion: NARRATION_PROCESSING_VERSION,
    audioPath: relative(dirname(narrationManifestPath), outputPath),
    clips: [],
  };
  let currentOffsetMs = 0;
  const concatSegments: { audio: Buffer; gapAfterMs: number }[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const isLast = i === segments.length - 1;
    const gap = isLast ? 0 : gapMs;
    const sourceSceneIndex = seg.sourceSceneIndex ?? seg.sceneIndex;
    const clipPath = join(clipDir, getNarrationClipFileName(sourceSceneIndex));
    await writeFile(clipPath, seg.audio);

    timedScenes.push({
      narration: seg.narration,
      steps: [],
      stepIndex: seg.stepIndex,
      sourceSceneIndex,
      audioDurationMs: seg.durationMs,
      audioOffsetMs: currentOffsetMs,
      gapAfterMs: gap,
    });

    manifest.clips.push({
      sceneIndex: sourceSceneIndex,
      stepIndex: seg.stepIndex,
      narration: seg.narration,
      filePath: relative(dirname(narrationManifestPath), clipPath),
      audioDurationMs: seg.durationMs,
      audioOffsetMs: currentOffsetMs,
      gapAfterMs: gap,
    });

    concatSegments.push({ audio: seg.audio, gapAfterMs: gap });
    currentOffsetMs += seg.durationMs + gap;
  }

  const concatenated = await concatenateAudio(concatSegments);
  await writeFile(outputPath, concatenated);
  await writeFile(narrationManifestPath, JSON.stringify(manifest, null, 2), "utf-8");

  if (options.verbose) {
    console.log(`Narration audio: ${outputPath} (${(currentOffsetMs / 1000).toFixed(1)}s)`);
    console.log(`Narration manifest: ${narrationManifestPath}`);
  }

  return { timedScenes, narrationManifestPath };
}
