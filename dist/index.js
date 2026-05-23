import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { basename, dirname, extname, join, relative, resolve } from "path";
import { demoReelConfigSchema, demoReelConfigInputSchema, } from "./schemas.js";
import { getNarrationManifestPath } from "./narration-manifest.js";
import { narrationManifestSchema, NARRATION_PROCESSING_VERSION } from "./narration-manifest.js";
import { syncNarration, logSyncReport } from "./narration-sync.js";
export function defineConfig(config) {
    return validateConfig(config);
}
export const demo = defineConfig;
export function validateConfig(config) {
    return demoReelConfigSchema.parse(config);
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
function getNarratedScenesInPlaybackOrder(config) {
    return (config.scenes ?? [])
        .map((scene, index) => ({ scene, index }))
        .filter(({ scene }) => Boolean(scene.narration))
        .sort((left, right) => {
        const stepIndexDiff = left.scene.stepIndex - right.scene.stepIndex;
        return stepIndexDiff !== 0 ? stepIndexDiff : left.index - right.index;
    })
        .map(({ scene, index }) => ({ scene, index }));
}
function shouldRegenerateNarrationArtifacts(audioPath, manifestPath) {
    if (!existsSync(audioPath) || !existsSync(manifestPath)) {
        return true;
    }
    try {
        const manifest = narrationManifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf-8")));
        return manifest.processingVersion !== NARRATION_PROCESSING_VERSION;
    }
    catch {
        return true;
    }
}
export async function generate(config, options = {}) {
    const { verbose = false } = options;
    const resolvedConfig = validateConfig(config);
    const name = getBaseName(resolvedConfig);
    const narratedScenes = getNarratedScenesInPlaybackOrder(resolvedConfig);
    const hasNarration = narratedScenes.length > 0;
    const hasVoice = resolvedConfig.voice;
    const audioPath = getAudioPath(resolvedConfig);
    const narrationManifestPath = getNarrationManifestPath(audioPath);
    const shouldRegenerate = hasNarration && hasVoice
        ? shouldRegenerateNarrationArtifacts(audioPath, narrationManifestPath)
        : false;
    mkdirSync(dirname(audioPath), { recursive: true });
    if (hasNarration && hasVoice && shouldRegenerate) {
        if (verbose) {
            console.log("Generating voiceover...");
        }
        const { generateVoiceSegments, generateNarrationAudio } = await import("./script/tts.js");
        const { resolveVoiceConfig } = await import("./voice-config.js");
        const resolvedVoice = resolveVoiceConfig(resolvedConfig.voice);
        const script = {
            title: name,
            description: "auto-generated",
            url: "https://placeholder.local",
            scenes: narratedScenes.map(({ scene, index }) => ({
                narration: scene.narration,
                stepIndex: scene.stepIndex,
                sourceSceneIndex: index,
                steps: [{ action: "wait", ms: 0 }],
            })),
            voice: resolvedVoice,
        };
        const segments = await generateVoiceSegments(script, resolvedVoice, { verbose });
        await generateNarrationAudio(segments, audioPath, { verbose });
    }
    const configWithAudio = hasNarration && existsSync(audioPath)
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
    if (hasNarration && existsSync(narrationManifestPath) && resolvedConfig.scenes) {
        try {
            const syncMode = resolvedConfig.timing.narrationSyncMode ?? "auto";
            if (syncMode !== "off") {
                const rawManifest = JSON.parse(readFileSync(narrationManifestPath, "utf-8"));
                const manifest = narrationManifestSchema.parse(rawManifest);
                const clips = manifest.clips.map((clip) => ({
                    sceneIndex: clip.sceneIndex,
                    narration: clip.narration,
                    audioDurationMs: clip.audioDurationMs,
                    gapAfterMs: clip.gapAfterMs ?? 0,
                }));
                const syncOutput = syncNarration({
                    steps: configWithAudio.steps,
                    scenes: resolvedConfig.scenes,
                    clips,
                    config: {
                        narrationSyncMode: syncMode,
                        narrationGapMs: resolvedConfig.timing.narrationGapMs ?? 300,
                        maxAutoPadMs: resolvedConfig.timing.maxAutoPadMs ?? 5000,
                        maxSyncPasses: resolvedConfig.timing.maxSyncPasses ?? 2,
                    },
                });
                if (syncOutput.hasOverflow && syncMode === "strict") {
                    throw new Error(`Narration sync overflow: scenes ${syncOutput.report.overflowScenes.join(", ")} exceed maxAutoPadMs`);
                }
                if (verbose) {
                    logSyncReport(syncOutput.report, verbose);
                }
                if (syncOutput.report.appliedPadMs > 0) {
                    configWithAudio.steps = syncOutput.steps;
                    if (resolvedConfig.scenes) {
                        configWithAudio.scenes = resolvedConfig.scenes.map((scene, i) => ({
                            ...scene,
                            stepIndex: syncOutput.sceneStepIndices[i],
                        }));
                    }
                    if (verbose) {
                        console.log(`✓ Narration sync applied: ${syncOutput.report.appliedPadMs}ms total padding`);
                    }
                }
            }
        }
        catch (error) {
            if (verbose) {
                console.warn(`Narration sync skipped: ${error instanceof Error ? error.message : String(error)}`);
            }
            if (error instanceof Error &&
                error.message.startsWith("Narration sync") &&
                error.message.includes("strict")) {
                throw error;
            }
        }
    }
    const jsonPath = `.${name}.tmp.json`;
    try {
        writeFileSync(jsonPath, JSON.stringify(configWithAudio, null, 2), "utf-8");
    }
    catch (error) {
        throw new Error(`Failed to write config: ${error instanceof Error ? error.message : error}`);
    }
    try {
        const { loadConfig } = await import("./config-loader.js");
        const { runVideoScenario } = await import("./video-handler.js");
        const loaded = await loadConfig(resolve(jsonPath));
        await runVideoScenario(loaded.config, loaded.outputPath, loaded.configPath, { verbose });
    }
    finally {
        try {
            unlinkSync(jsonPath);
        }
        catch { }
    }
}
export { demoReelConfigSchema, demoReelConfigInputSchema };
export { runScenarioForTest, runSteps, runStepSimple, runAssertion, formatStepForLog, } from "./runner.js";
export { syncNarration, logSyncReport, buildSceneWindows, injectPadding, } from "./narration-sync.js";
//# sourceMappingURL=index.js.map