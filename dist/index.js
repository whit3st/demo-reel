import { execSync, spawn } from "child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "fs";
import { basename, dirname, extname, join, relative, resolve } from "path";
import { demoReelConfigSchema, demoReelConfigInputSchema, } from "./schemas.js";
const DEFAULT_IMAGE = "ghcr.io/whit3st/demo-reel:latest";
const LOCAL_IMAGE = "demo-reel:latest";
const ENV_PASSTHROUGH = [
    "ELEVENLABS_KEY",
    "ELEVENLABS_API_KEY",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
];
export function defineConfig(config) {
    return validateConfig(config);
}
export const demo = defineConfig;
export function validateConfig(config) {
    return demoReelConfigSchema.parse(config);
}
function isDockerAvailable() {
    try {
        execSync("docker info", { stdio: "ignore" });
        return true;
    }
    catch {
        return false;
    }
}
function getImage() {
    try {
        execSync(`docker image inspect ${LOCAL_IMAGE}`, { stdio: "ignore" });
        return LOCAL_IMAGE;
    }
    catch {
        // No local image, fall through to the published image.
    }
    try {
        execSync(`docker image inspect ${DEFAULT_IMAGE}`, { stdio: "ignore" });
        return DEFAULT_IMAGE;
    }
    catch {
        console.log(`Pulling ${DEFAULT_IMAGE}...`);
        execSync(`docker pull ${DEFAULT_IMAGE}`, { stdio: "inherit" });
        return DEFAULT_IMAGE;
    }
}
function getBaseName(config) {
    if (config.name) {
        return config.name;
    }
    if (config.outputPath) {
        const ext = extname(config.outputPath);
        return basename(config.outputPath, ext);
    }
    return "demo";
}
function getAudioPath(config) {
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
export async function generate(config, options = {}) {
    const { verbose = false, noDocker = false } = options;
    const resolvedConfig = validateConfig(config);
    const name = getBaseName(resolvedConfig);
    const narratedScenes = resolvedConfig.scenes?.filter((scene) => scene.narration) ?? [];
    const hasNarration = narratedScenes.length > 0;
    const hasVoice = resolvedConfig.voice;
    const audioPath = getAudioPath(resolvedConfig);
    mkdirSync(dirname(audioPath), { recursive: true });
    if (hasNarration && hasVoice && !existsSync(audioPath)) {
        if (verbose) {
            console.log("Generating voiceover via Docker...");
        }
        const scriptJson = {
            title: name,
            description: "auto-generated",
            url: "https://placeholder.local",
            scenes: narratedScenes.map((scene) => ({
                narration: scene.narration,
                steps: [{ action: "wait", ms: 0 }],
            })),
            voice: resolvedConfig.voice,
        };
        const scriptPath = `.${name}.voice.tmp.json`;
        writeFileSync(scriptPath, JSON.stringify(scriptJson, null, 2), "utf-8");
        try {
            const image = getImage();
            const voiceArgs = ["run", "--rm", "-v", `${process.cwd()}:/work:z`, "-w", "/work"];
            for (const envVar of ENV_PASSTHROUGH) {
                if (process.env[envVar]) {
                    voiceArgs.push("-e", `${envVar}=${process.env[envVar]}`);
                }
            }
            voiceArgs.push("--entrypoint", "node", image, "/app/dist/script/voice-cli.js", scriptPath, "--output", relative(process.cwd(), audioPath));
            execSync(`docker ${voiceArgs.join(" ")}`, { stdio: "inherit" });
        }
        finally {
            try {
                unlinkSync(scriptPath);
            }
            catch {
                // Best-effort cleanup for temp files.
            }
        }
    }
    const configWithAudio = hasNarration && existsSync(audioPath)
        ? {
            ...resolvedConfig,
            audio: {
                ...resolvedConfig.audio,
                narration: relative(process.cwd(), audioPath),
                narrationDelay: resolvedConfig.audio?.narrationDelay ?? 300,
            },
            outputFormat: "mp4",
        }
        : resolvedConfig;
    const jsonPath = `.${name}.tmp.json`;
    try {
        writeFileSync(jsonPath, JSON.stringify(configWithAudio, null, 2), "utf-8");
    }
    catch (error) {
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
            const dockerArgs = ["run", "--rm", "-v", `${process.cwd()}:/work:z`, "-w", "/work"];
            for (const envVar of ENV_PASSTHROUGH) {
                if (process.env[envVar]) {
                    dockerArgs.push("-e", `${envVar}=${process.env[envVar]}`);
                }
            }
            dockerArgs.push(image, ...cliArgs);
            await new Promise((resolvePromise, reject) => {
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
    }
    finally {
        try {
            unlinkSync(jsonPath);
        }
        catch {
            // Best-effort cleanup for temp files.
        }
    }
}
export { demoReelConfigSchema, demoReelConfigInputSchema };
//# sourceMappingURL=index.js.map