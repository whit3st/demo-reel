import { z } from "zod";
import { selectorSchema, stepSchema } from "../schemas.js";
import { voiceConfigSchema } from "../voice-config.js";
export type { VoiceConfig } from "../voice-config.js";

// --- Crawled DOM types ---

export const crawledElementSchema = z.object({
	tag: z.string().describe("HTML tag name (button, input, a, select, etc.)"),
	text: z.string().describe("Visible text, aria-label, or placeholder"),
	selector: selectorSchema.describe("Best stable selector for this element"),
	role: z
		.enum(["link", "button", "input", "select", "checkbox", "radio", "textarea", "other"])
		.describe("Semantic role of the element"),
	attributes: z.record(z.string()).describe("Relevant HTML attributes"),
	boundingBox: z
		.object({
			x: z.number(),
			y: z.number(),
			width: z.number(),
			height: z.number(),
		})
		.optional()
		.describe("Element position and size on page"),
});

export type CrawledElement = z.infer<typeof crawledElementSchema>;

export const crawledPageSchema = z.object({
	url: z.string().url().describe("Page URL after navigation"),
	title: z.string().describe("Page title"),
	headings: z.array(z.string()).describe("Visible headings on page (h1-h3)"),
	elements: z.array(crawledElementSchema).describe("Interactive elements on page"),
});

export type CrawledPage = z.infer<typeof crawledPageSchema>;

// --- Script types ---

export const scriptSceneSchema = z.object({
	narration: z.string().describe("What the voiceover says during this scene"),
	steps: z.array(stepSchema).min(1).describe("demo-reel steps to execute during this scene"),
	emphasis: z.string().optional().describe("What to highlight or focus on visually"),
	stepIndex: z.number().int().min(0).optional().describe("Step index where this scene starts when rendered"),
	sourceSceneIndex: z.number().int().min(0).optional().describe("Stable source index for this scene across timing/audio artifacts"),
});

export type ScriptScene = z.infer<typeof scriptSceneSchema>;

export const demoScriptSchema = z.object({
	title: z.string().describe("Demo title"),
	description: z.string().describe("Original user description"),
	url: z.string().url().describe("Starting URL"),
	scenes: z.array(scriptSceneSchema).min(1).describe("Ordered scenes of the demo"),
	voice: voiceConfigSchema.optional().describe("TTS voice configuration for this demo"),
});

export type DemoScript = z.infer<typeof demoScriptSchema>;

// --- Timed script types (after voice generation) ---

export const timedSceneSchema = scriptSceneSchema.extend({
	audioDurationMs: z.number().int().min(0).describe("Duration of narration audio for this scene"),
	audioOffsetMs: z.number().int().min(0).describe("Offset in the concatenated audio file"),
	gapAfterMs: z.number().int().min(0).describe("Silence gap after this scene"),
});

export type TimedScene = z.infer<typeof timedSceneSchema>;

export const timedScriptSchema = demoScriptSchema.extend({
	scenes: z.array(timedSceneSchema).min(1),
	audioPath: z.string().describe("Path to generated narration MP3"),
	narrationManifestPath: z
		.string()
		.optional()
		.describe("Path to per-scene narration manifest JSON for exact placement during rendering"),
	totalDurationMs: z.number().int().min(0).describe("Total audio duration including gaps"),
});

export type TimedScript = z.infer<typeof timedScriptSchema>;

// --- Script config (input for defineScript) ---

export const scriptConfigSchema = z.object({
	description: z.string().min(1).describe("Natural language description of the demo"),
	url: z.string().url().describe("Starting URL of the web app"),
	voice: voiceConfigSchema.optional().describe("Voice generation settings"),
	hints: z.array(z.string()).optional().describe("Hints to guide the script generator"),
	output: z
		.object({
			name: z.string().min(1).optional().describe("Output filename without extension"),
			format: z.enum(["mp4", "webm"]).default("mp4").describe("Output video format"),
			resolution: z
				.enum(["HD", "FHD", "2K", "4K"])
				.default("FHD")
				.describe("Video resolution"),
		})
		.optional()
		.describe("Output settings"),
});

export type ScriptConfig = z.infer<typeof scriptConfigSchema>;
