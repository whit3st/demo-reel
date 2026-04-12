#!/usr/bin/env node
/**
 * Generate voiceover audio for a demo script.
 *
 * Voice config priority: CLI flags > script.json voice field > product config.json > defaults
 *
 * Usage: node dist/script/voice-cli.js <script.json> [options]
 */
import { readFile, mkdir, stat } from "fs/promises";
import { dirname, join, basename, resolve } from "path";
import { demoScriptSchema, type VoiceConfig } from "./types.js";
import { generateVoiceSegments, generateNarrationAudio } from "./tts.js";
import { synchronizeTiming } from "./timing.js";
import { writeScriptJson } from "./assembler.js";
import { getVoiceName, resolveVoiceConfig } from "../voice-config.js";

/**
 * Walk up from scriptPath looking for a config.json with voice settings.
 * Stops at the demos/ directory or after 3 levels.
 */
interface VoiceConfigOverridesSource {
  provider?: VoiceConfig["provider"];
  voice?: string;
  voicePath?: string;
  speed?: number;
  pronunciation?: Record<string, string>;
}

async function loadProductConfig(scriptPath: string): Promise<VoiceConfigOverridesSource> {
  let dir = dirname(resolve(scriptPath));
  for (let i = 0; i < 4; i++) {
    const configPath = join(dir, "config.json");
    try {
      await stat(configPath);
      const raw = await readFile(configPath, "utf-8");
      const config = JSON.parse(raw);
      if (config.voice) {
        return config.voice;
      }
    } catch {
      // No config here, keep walking up
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return {};
}

function pickVoiceOverrides(source: unknown): VoiceConfigOverridesSource {
  if (!source || typeof source !== "object") {
    return {};
  }

  const value = source as Record<string, unknown>;
  return {
    provider:
      value.provider === "piper" || value.provider === "openai" || value.provider === "elevenlabs"
        ? value.provider
        : undefined,
    voice: typeof value.voice === "string" ? value.voice : undefined,
    voicePath: typeof value.voicePath === "string" ? value.voicePath : undefined,
    speed: typeof value.speed === "number" ? value.speed : undefined,
    pronunciation:
      typeof value.pronunciation === "object" && value.pronunciation !== null
        ? (value.pronunciation as Record<string, string>)
        : undefined,
  };
}

async function main() {
  const args = process.argv.slice(2);
  let scriptPath: string | undefined;

  // CLI overrides (undefined means "not set, use lower priority")
  let cliProvider: string | undefined;
  let cliVoice: string | undefined;
  let cliSpeed: number | undefined;
  let cliPronunciation: Record<string, string> | undefined;
  let cliOutput: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--provider") {
      cliProvider = args[++i];
    } else if (args[i] === "--voice") {
      cliVoice = args[++i];
    } else if (args[i] === "--speed") {
      cliSpeed = parseFloat(args[++i]);
    } else if (args[i] === "--output" || args[i] === "-o") {
      cliOutput = args[++i];
    } else if (args[i] === "--pronunciation") {
      const val = args[++i];
      if (val.startsWith("{")) {
        cliPronunciation = JSON.parse(val);
      } else {
        cliPronunciation = JSON.parse(await readFile(val, "utf-8"));
      }
    } else if (!args[i].startsWith("-")) {
      scriptPath = args[i];
    }
  }

  if (!scriptPath) {
    console.error(
      "Usage: node dist/script/voice-cli.js <script.json> [--provider piper] [--voice nl_NL-mls-medium] [--speed 1.0]",
    );
    console.error(
      "\nVoice config priority: CLI flags > script.json > product config.json > defaults",
    );
    process.exit(1);
  }

  try {
    const raw = await readFile(scriptPath, "utf-8");
    const script = demoScriptSchema.parse(JSON.parse(raw));

    // Build voice config with priority chain:
    // 1. Product config.json
    const productConfig = await loadProductConfig(scriptPath);

    // 2. Script-level voice config
    const scriptVoice = pickVoiceOverrides(script.voice);

    // 3. CLI overrides
    const voice = resolveVoiceConfig({
      provider:
        (cliProvider as VoiceConfig["provider"] | undefined) ??
        scriptVoice.provider ??
        productConfig.provider,
      voicePath: scriptVoice.voicePath ?? productConfig.voicePath,
      voice: cliVoice ?? scriptVoice.voice ?? productConfig.voice,
      speed: cliSpeed ?? scriptVoice.speed ?? productConfig.speed,
      pronunciation: cliPronunciation ?? scriptVoice.pronunciation ?? productConfig.pronunciation,
    });

    console.error(`Voice: ${voice.provider}/${getVoiceName(voice)} (speed: ${voice.speed})`);
    if (voice.pronunciation) {
      console.error(
        `Pronunciation: ${Object.entries(voice.pronunciation)
          .map(([k, v]) => `${k}→${v}`)
          .join(", ")}`,
      );
    }
    console.error(`Generating voice for ${script.scenes.length} scene(s)...`);

    const segments = await generateVoiceSegments(script, voice, { verbose: true });

    let audioPath: string;
    if (cliOutput) {
      audioPath = cliOutput;
      await mkdir(dirname(cliOutput), { recursive: true });
    } else {
      const scriptDir = dirname(scriptPath);
      const scriptBase = basename(scriptPath, ".script.json");
      const voiceOutputDir = join(scriptDir, "output");
      await mkdir(voiceOutputDir, { recursive: true });
      audioPath = join(voiceOutputDir, `${scriptBase}-narration.mp3`);
    }
    const { timedScenes, narrationManifestPath } = await generateNarrationAudio(
      segments,
      audioPath,
      { verbose: true },
    );

    // Save voice config into the script so it's reproducible
    const timedScript = synchronizeTiming(script, timedScenes, audioPath);
    await writeScriptJson({ ...timedScript, voice, narrationManifestPath }, scriptPath);

    console.log(audioPath);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

main();
