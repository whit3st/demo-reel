import { mkdir, readFile, unlink } from "fs/promises";
import { join, dirname } from "path";
import { spawn } from "child_process";
import type { VoiceConfig } from "../voice-config.js";
import type { TTSProvider } from "./types.js";
import { ensurePiperBinary, ensurePiperModel } from "../piper.js";
import { wavToMp3, measureAudioDuration } from "../ffmpeg/utils.js";

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

export const piperProvider: TTSProvider = {
  name: "piper",
  generate: async (text, options) => {
    const piperPath = await findPiperBinary();
    const modelPath = await getPiperModelPath(options);

    const tempDir = join(process.cwd(), ".demo-reel-cache", "temp");
    await mkdir(tempDir, { recursive: true });
    const wavPath = join(tempDir, `piper-${Date.now()}.wav`);

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

    const audio = await wavToMp3(wavBuffer);
    const durationMs = await measureAudioDuration(audio);

    return { audio, durationMs };
  },
};
