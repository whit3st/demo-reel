import { spawn, type ChildProcess } from "child_process";
import { mkdir, readFile, unlink } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";
import type { TTSProvider } from "./types.js";
import { measureAudioDuration, runFFmpeg, getFfmpegPath } from "../ffmpeg/utils.js";

const DEFAULT_VENV_PYTHON = join(
  homedir(),
  ".local",
  "share",
  "demo-reel-tts",
  "venv",
  "bin",
  "python",
);

interface PendingRequest {
  resolve: (path: string) => void;
  reject: (error: Error) => void;
}

interface Worker {
  proc: ChildProcess;
  ready: Promise<void>;
  pending: Map<string, PendingRequest>;
}

let worker: Worker | null = null;
let requestCounter = 0;

function resolvePython(): string {
  const explicit = process.env.DEMO_REEL_CHATTERBOX_PYTHON;
  if (explicit) return explicit;
  if (existsSync(DEFAULT_VENV_PYTHON)) return DEFAULT_VENV_PYTHON;
  return "python3";
}

function resolveWorkerScript(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "chatterbox_worker.py"),
    join(here, "..", "..", "src", "voice", "chatterbox_worker.py"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`chatterbox_worker.py not found. Looked in: ${candidates.join(", ")}`);
}

function startWorker(): Worker {
  const python = resolvePython();
  const script = resolveWorkerScript();
  const proc = spawn(python, [script], { stdio: ["pipe", "pipe", "pipe"] });

  const pending = new Map<string, PendingRequest>();
  let stderr = "";
  let buffer = "";

  proc.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
    if (stderr.length > 8000) stderr = stderr.slice(-8000);
  });

  const ready = new Promise<void>((resolve, reject) => {
    const failAll = (error: Error) => {
      reject(error);
      for (const [, request] of pending) request.reject(error);
      pending.clear();
      worker = null;
    };

    proc.on("error", (error) => {
      failAll(new Error(`Failed to start Chatterbox worker via "${python}": ${error.message}`));
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        failAll(new Error(`Chatterbox worker exited with code ${code}.\n${stderr.slice(-1500)}`));
      }
    });

    proc.stdout?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
        if (!line) continue;

        let message: any;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }

        if (message.ready) {
          resolve();
          continue;
        }

        const request = message.id ? pending.get(message.id) : undefined;
        if (!request) continue;
        pending.delete(message.id);
        if (message.ok) {
          request.resolve(message.path);
        } else {
          request.reject(new Error(`Chatterbox generation failed: ${message.error}`));
        }
      }
    });
  });

  return { proc, ready, pending };
}

async function ensureWorker(): Promise<Worker> {
  if (!worker) {
    worker = startWorker();
    process.once("exit", () => shutdownChatterbox());
  }
  await worker.ready;
  return worker;
}

export function shutdownChatterbox(): void {
  if (!worker) return;
  try {
    worker.proc.stdin?.write(`${JSON.stringify({ cmd: "shutdown" })}\n`);
    worker.proc.kill();
  } catch {}
  worker = null;
}

function synthesize(w: Worker, text: string, outPath: string, audioPromptPath?: string) {
  const id = String(++requestCounter);
  return new Promise<string>((resolve, reject) => {
    w.pending.set(id, { resolve, reject });
    w.proc.stdin?.write(
      `${JSON.stringify({ id, text, out: outPath, audio_prompt_path: audioPromptPath ?? null })}\n`,
    );
  });
}

async function encodeMp3(wavPath: string, speed: number): Promise<Buffer> {
  const ffmpegPath = await getFfmpegPath();
  const mp3Path = wavPath.replace(/\.wav$/, ".mp3");

  const args = ["-i", wavPath];
  // Chatterbox has no pace control, so speed is applied here. atempo accepts
  // 0.5-2.0 in a single pass, which matches the schema's allowed range.
  if (speed !== 1.0) args.push("-filter:a", `atempo=${speed}`);
  args.push("-codec:a", "libmp3lame", "-q:a", "2", "-y", mp3Path);

  await runFFmpeg(ffmpegPath, args);
  const mp3 = await readFile(mp3Path);
  await unlink(mp3Path).catch(() => {});
  return mp3;
}

export const chatterboxProvider: TTSProvider = {
  name: "chatterbox",
  generate: async (text, options) => {
    const w = await ensureWorker();

    const tempDir = join(process.cwd(), ".demo-reel-cache", "temp");
    await mkdir(tempDir, { recursive: true });
    const wavPath = join(tempDir, `chatterbox-${Date.now()}-${requestCounter}.wav`);

    const voicePath = "voicePath" in options ? options.voicePath : undefined;
    await synthesize(w, text, wavPath, voicePath);

    const audio = await encodeMp3(wavPath, options.speed);
    await unlink(wavPath).catch(() => {});
    const durationMs = await measureAudioDuration(audio);

    return { audio, durationMs };
  },
};
