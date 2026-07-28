import { mkdir, writeFile, readFile, stat } from "fs/promises";
import { join } from "path";
import { createHash } from "crypto";
import { getVoiceName, type VoiceConfig } from "../voice-config.js";
import { NARRATION_PROCESSING_VERSION } from "../narration-manifest.js";

const CACHE_DIR = ".demo-reel-cache/voice";
const VOICE_CACHE_VERSION = NARRATION_PROCESSING_VERSION;

export function cacheKey(text: string, voice: VoiceConfig): string {
  // Appended only when present, so keys for providers without a language stay
  // byte-identical to previously cached ones.
  const language = "language" in voice && voice.language ? `|${voice.language}` : "";
  return createHash("sha256")
    .update(
      `${VOICE_CACHE_VERSION}|${text}|${voice.provider}|${getVoiceName(voice)}|${voice.speed}${language}`,
    )
    .digest("hex")
    .slice(0, 16);
}

export async function getCached(key: string): Promise<Buffer | null> {
  const path = join(process.cwd(), CACHE_DIR, `${key}.mp3`);
  try {
    await stat(path);
    return await readFile(path);
  } catch {
    return null;
  }
}

export async function setCache(key: string, audio: Buffer): Promise<void> {
  const dir = join(process.cwd(), CACHE_DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${key}.mp3`), audio);
}
