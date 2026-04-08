export { crawlUrl, crawlPage, formatPageContext } from "./crawler.js";
export { generateScript, validateScript, fixBrokenSteps } from "./generator.js";
export { generateVoiceSegments, generateNarrationAudio } from "./tts.js";
export { synchronizeTiming } from "./timing.js";
export { writeDemoConfig, writeScriptJson, generateDemoConfig } from "./assembler.js";
export {
	scriptGenerate,
	scriptVoice,
	scriptBuild,
	scriptValidate,
	scriptFix,
	scriptFullPipeline,
} from "./cli.js";
export type {
	CrawledElement,
	CrawledPage,
	ScriptScene,
	DemoScript,
	TimedScene,
	TimedScript,
	VoiceConfig,
	ScriptConfig,
} from "./types.js";
