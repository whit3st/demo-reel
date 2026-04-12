import { execSync, spawn, spawnSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { basename, dirname, extname, join, relative, resolve } from "path";
import {
  demoReelConfigSchema,
  demoReelConfigInputSchema,
  type DemoReelConfig,
  type DemoReelConfigInput,
} from "./schemas.js";
import { getNarrationManifestPath } from "./narration-manifest.js";
import { narrationManifestSchema, NARRATION_PROCESSING_VERSION } from "./narration-manifest.js";

const DEFAULT_IMAGE = "ghcr.io/whit3st/demo-reel:latest";
const LOCAL_IMAGE = "demo-reel:latest";
const ENV_PASSTHROUGH = [
  "ELEVENLABS_KEY",
  "ELEVENLABS_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
];

export type DemoConfig = DemoReelConfigInput;

export interface GenerateOptions {
  verbose?: boolean;
  noDocker?: boolean;
}

export function defineConfig(config: DemoConfig): DemoReelConfig {
  return validateConfig(config);
}

export const demo = defineConfig;

export function validateConfig(config: unknown): DemoReelConfig {
  return demoReelConfigSchema.parse(config);
}

function isDockerAvailable(): boolean {
  try {
    execSync("docker info", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function getImage(): string {
  try {
    execSync(`docker image inspect ${LOCAL_IMAGE}`, { stdio: "ignore" });
    return LOCAL_IMAGE;
  } catch {
    // No local image, fall through to the published image.
  }

  try {
    execSync(`docker image inspect ${DEFAULT_IMAGE}`, { stdio: "ignore" });
    return DEFAULT_IMAGE;
  } catch {
    console.log(`Pulling ${DEFAULT_IMAGE}...`);
    execSync(`docker pull ${DEFAULT_IMAGE}`, { stdio: "inherit" });
    return DEFAULT_IMAGE;
  }
}

function getDockerUserArgs(): string[] {
  if (typeof process.getuid !== "function" || typeof process.getgid !== "function") {
    return [];
  }

  return ["--user", `${process.getuid()}:${process.getgid()}`];
}

function getBaseName(config: DemoReelConfig): string {
  if (config.name) {
    return config.name;
  }

  if (config.outputPath) {
    const ext = extname(config.outputPath);
    return basename(config.outputPath, ext);
  }

  return "demo";
}

function getAudioPath(config: DemoReelConfig): string {
  if (config.outputPath) {
    const outputPath = config.outputPath.startsWith("/")
      ? config.outputPath
      : resolve(config.outputPath);
    const ext = extname(outputPath);
    return join(dirname(outputPath), `${basename(outputPath, ext)}-narration.mp3`);
  }

  const outputDir = config.outputDir ? resolve(config.outputDir) : resolve("./output");
  return join(outputDir, `${getBaseName(config)}-narration.mp3`);
}

function getNarratedScenesInPlaybackOrder(config: DemoReelConfig) {
  return (config.scenes ?? [])
    .map((scene, index) => ({ scene, index }))
    .filter(({ scene }) => Boolean(scene.narration))
    .sort((left, right) => {
      const stepIndexDiff = left.scene.stepIndex - right.scene.stepIndex;
      return stepIndexDiff !== 0 ? stepIndexDiff : left.index - right.index;
    })
    .map(({ scene, index }) => ({ scene, index }));
}

function shouldRegenerateNarrationArtifacts(audioPath: string, manifestPath: string): boolean {
  if (!existsSync(audioPath) || !existsSync(manifestPath)) {
    return true;
  }

  try {
    const manifest = narrationManifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf-8")));
    return manifest.processingVersion !== NARRATION_PROCESSING_VERSION;
  } catch {
    return true;
  }
}

export async function generate(config: DemoConfig, options: GenerateOptions = {}): Promise<void> {
  const { verbose = false, noDocker = false } = options;
  const resolvedConfig = validateConfig(config);
  const name = getBaseName(resolvedConfig);
  const narratedScenes = getNarratedScenesInPlaybackOrder(resolvedConfig);

  const hasNarration = narratedScenes.length > 0;
  const hasVoice = resolvedConfig.voice;
  const audioPath = getAudioPath(resolvedConfig);
  const narrationManifestPath = getNarrationManifestPath(audioPath);
  const voiceScriptPath = `.${name}.voice.tmp.json`;
  const shouldRegenerateNarration =
    hasNarration && hasVoice
      ? shouldRegenerateNarrationArtifacts(audioPath, narrationManifestPath)
      : false;
  mkdirSync(dirname(audioPath), { recursive: true });

  if (hasNarration && hasVoice && shouldRegenerateNarration) {
    if (verbose) {
      console.log("Generating voiceover via Docker...");
    }

    const scriptJson = {
      title: name,
      description: "auto-generated",
      url: "https://placeholder.local",
      scenes: narratedScenes.map(({ scene, index }) => ({
        narration: scene.narration,
        stepIndex: scene.stepIndex,
        sourceSceneIndex: index,
        steps: [{ action: "wait" as const, ms: 0 }],
      })),
      voice: resolvedConfig.voice,
    };
    writeFileSync(voiceScriptPath, JSON.stringify(scriptJson, null, 2), "utf-8");

    const image = getImage();
    const voiceArgs = [
      "run",
      "--rm",
      ...getDockerUserArgs(),
      "-v",
      `${process.cwd()}:/work:z`,
      "-w",
      "/work",
    ];

    for (const envVar of ENV_PASSTHROUGH) {
      if (process.env[envVar]) {
        voiceArgs.push("-e", `${envVar}=${process.env[envVar]}`);
      }
    }

    voiceArgs.push(
      "--entrypoint",
      "node",
      image,
      "/app/dist/script/voice-cli.js",
      voiceScriptPath,
      "--output",
      relative(process.cwd(), audioPath),
    );
    const voiceResult = spawnSync("docker", voiceArgs, { stdio: "inherit", env: process.env });
    if (voiceResult.status !== 0) {
      throw new Error(`Docker voice generation exited with code ${voiceResult.status}`);
    }
    if (voiceResult.error) {
      throw voiceResult.error;
    }
  }

  const configWithAudio: DemoConfig =
    hasNarration && existsSync(audioPath)
      ? {
          ...resolvedConfig,
          audio: {
            ...resolvedConfig.audio,
            narration: relative(process.cwd(), audioPath),
            narrationManifest: relative(process.cwd(), narrationManifestPath),
            narrationDelay: resolvedConfig.audio?.narrationDelay ?? 300,
          },
          outputFormat: "mp4",
        }
      : resolvedConfig;

  const jsonPath = `.${name}.tmp.json`;

  try {
    writeFileSync(jsonPath, JSON.stringify(configWithAudio, null, 2), "utf-8");
  } catch (error) {
    throw new Error(`Failed to write config: ${error instanceof Error ? error.message : error}`);
  }

  const relJsonPath = relative(process.cwd(), jsonPath);
  const cliArgs = [relJsonPath];
  if (verbose) {
    cliArgs.push("--verbose");
  }

  try {
    if (!noDocker && isDockerAvailable()) {
      const image = getImage();
      if (verbose) {
        console.log(`Using Docker image: ${image}`);
      }

      const dockerArgs = [
        "run",
        "--rm",
        ...getDockerUserArgs(),
        "-v",
        `${process.cwd()}:/work:z`,
        "-w",
        "/work",
      ];

      for (const envVar of ENV_PASSTHROUGH) {
        if (process.env[envVar]) {
          dockerArgs.push("-e", `${envVar}=${process.env[envVar]}`);
        }
      }

      dockerArgs.push(image, ...cliArgs);

      await new Promise<void>((resolvePromise, reject) => {
        const proc = spawn("docker", dockerArgs, {
          stdio: "inherit",
          env: process.env,
        });
        proc.on("close", (code) => {
          if (code === 0) {
            resolvePromise();
            return;
          }

          reject(new Error(`Docker exited with code ${code}`));
        });
        proc.on("error", reject);
      });
      return;
    }

    if (!noDocker) {
      console.log("Docker not available, running locally (requires Playwright, FFmpeg, etc.)");
    }

    const { loadConfig } = await import("./config-loader.js");
    const { runVideoScenario } = await import("./video-handler.js");

    const loaded = await loadConfig(resolve(jsonPath));
    await runVideoScenario(loaded.config, loaded.outputPath, loaded.configPath, { verbose });
  } finally {
    try {
      unlinkSync(jsonPath);
    } catch {
      // Best-effort cleanup for temp files.
    }

    try {
      unlinkSync(voiceScriptPath);
    } catch {
      // Best-effort cleanup for temp files.
    }
  }
}

export { demoReelConfigSchema, demoReelConfigInputSchema };
export type { DemoReelConfig, DemoReelConfigInput } from "./schemas.js";
export type * from "./types.js";
