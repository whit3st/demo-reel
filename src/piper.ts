import { spawn } from "child_process";
import { mkdir, stat, chmod } from "fs/promises";
import { join, dirname } from "path";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { tmpdir } from "os";

const PIPER_VERSION = "2023.11.14-2";
const PIPER_CACHE_DIR = join(
  process.env.HOME || process.env.USERPROFILE || tmpdir(),
  ".demo-reel",
  "piper",
);

const PIPER_RELEASE_BASE = `https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}`;
const PIPER_VOICES_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main";

function getPiperReleaseName(): string {
  const cpu = (() => {
    if (process.arch === "arm64") return "aarch64";
    if (process.arch === "arm") return "armv7l";
    if (process.platform === "darwin") return "x64";
    if (process.platform === "win32") return "amd64";
    return "x86_64";
  })();

  if (process.platform === "win32") {
    return `piper_windows_${cpu}.zip`;
  }
  return `piper_${process.platform}_${cpu}.tar.gz`;
}

function getPiperBinaryPath(): string {
  const name = process.platform === "win32" ? "piper.exe" : "piper";
  return join(PIPER_CACHE_DIR, "piper", name);
}

export async function ensurePiperBinary(): Promise<string> {
  const binaryPath = getPiperBinaryPath();

  try {
    await stat(binaryPath);
    return binaryPath;
  } catch {}

  await mkdir(PIPER_CACHE_DIR, { recursive: true });

  const releaseName = getPiperReleaseName();
  const url = `${PIPER_RELEASE_BASE}/${releaseName}`;
  const archivePath = join(PIPER_CACHE_DIR, releaseName);

  await downloadFile(url, archivePath);

  if (releaseName.endsWith(".zip")) {
    await extractZip(archivePath, PIPER_CACHE_DIR);
  } else {
    await extractTarGz(archivePath, PIPER_CACHE_DIR);
  }

  try {
    await stat(binaryPath);
  } catch {
    throw new Error(`Piper binary not found after extraction. Expected at: ${binaryPath}`);
  }

  await chmod(binaryPath, 0o755);

  return binaryPath;
}

function parseVoiceName(
  voice: string,
): { lang: string; country: string; name: string; quality: string } | null {
  const match = voice.match(/^([a-z]{2,3})_([A-Z]{2,3})-([a-z0-9_]+)-(low|medium|high)$/);
  if (!match) return null;
  return {
    lang: match[1],
    country: match[2],
    name: match[3],
    quality: match[4],
  };
}

export function getPiperVoiceUrl(voice: string): { model: string; config: string } | null {
  const parsed = parseVoiceName(voice);
  if (!parsed) return null;

  const { lang, country, name, quality } = parsed;
  const locale = `${lang}_${country}`;
  const model = `${PIPER_VOICES_BASE}/${lang}/${locale}/${name}/${quality}/${voice}.onnx`;
  const config = `${model}.json`;

  return { model, config };
}

export async function ensurePiperModel(voice: string, voiceDir: string): Promise<string> {
  const modelPath = join(voiceDir, `${voice}.onnx`);
  const configPath = join(voiceDir, `${voice}.onnx.json`);

  try {
    await stat(modelPath);
    await stat(configPath);
    return modelPath;
  } catch {}

  const urls = getPiperVoiceUrl(voice);
  if (!urls) {
    throw new Error(
      `Cannot auto-download voice "${voice}" — unrecognized name format.\n` +
        `Download manually from https://huggingface.co/rhasspy/piper-voices\n` +
        `Or use voicePath to point to a local .onnx file.`,
    );
  }

  await mkdir(voiceDir, { recursive: true });

  console.log(`Downloading Piper voice: ${voice}...`);
  await downloadFile(urls.model, modelPath);
  await downloadFile(urls.config, configPath);

  return modelPath;
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const dir = dirname(dest);
  await mkdir(dir, { recursive: true });

  const response = await fetch(url, { redirect: "follow" });

  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  const body = response.body;
  if (!body) {
    throw new Error(`Empty response body for ${url}`);
  }

  const nodeStream = Readable.fromWeb(body as never);
  const fileStream = createWriteStream(dest);
  await pipeline(nodeStream, fileStream);
}

async function extractTarGz(archivePath: string, destDir: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn("tar", ["xzf", archivePath, "-C", destDir], {
      stdio: "inherit",
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`tar exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}

async function extractZip(archivePath: string, destDir: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn("tar", ["xf", archivePath, "-C", destDir], {
      stdio: "inherit",
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`tar (zip) exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}
