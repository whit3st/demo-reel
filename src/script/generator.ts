import type { DemoScript, ScriptScene } from "./types.js";
import { crawlUrl, formatPageContext } from "./crawler.js";
import { chromium } from "playwright";
import { runStepSimple } from "../runner.js";
import type { Step } from "../schemas.js";

const SYSTEM_PROMPT = `You are a demo video script writer. You generate structured browser automation scripts with voiceover narration for product demo videos.

You will receive:
1. A description of what the demo should show
2. A crawled DOM context showing the interactive elements on the current page
3. Optional hints from the user

Your job is to produce a JSON object with scenes. Each scene has:
- "narration": What the voiceover says (1-3 sentences, conversational and professional)
- "steps": An array of demo-reel automation steps using ONLY selectors from the crawled context
- "emphasis": Optional note about what to visually highlight

CRITICAL RULES:
- ONLY use selectors that appear in the crawled DOM context. Never invent selectors.
- Each step must have an "action" field. Supported actions: goto, click, hover, type, press, scroll, select, check, upload, wait, waitFor
- For "click", "hover", "type", "press", "scroll", "select", "check", "upload" steps: include a "selector" object with "strategy" and "value" fields
- For "type" steps: include a "text" field
- For "press" steps: include a "key" field (e.g., "Enter", "Tab")
- For "goto" steps: include a "url" field
- For "wait" steps: include an "ms" field (milliseconds)
- For "waitFor" with kind "selector": include "kind": "selector", "selector", and optionally "state"
- Use delayBeforeMs/delayAfterMs on steps to create natural pacing
- Keep narration concise — viewers watch demos at 1-2 minutes max
- Make narration sound natural, not robotic. Use "let's", "we'll", "notice how"
- Start with a brief intro scene that navigates to the page
- End with a brief conclusion/summary scene`;

interface GenerateOptions {
	description: string;
	url: string;
	hints?: string[];
	headed?: boolean;
	verbose?: boolean;
	apiKey?: string;
}

function buildUserPrompt(
	description: string,
	pageContext: string,
	hints?: string[],
): string {
	let prompt = `## Demo Description\n${description}\n\n## Current Page Context\n${pageContext}`;

	if (hints && hints.length > 0) {
		prompt += `\n\n## Hints\n${hints.map((h) => `- ${h}`).join("\n")}`;
	}

	prompt += `\n\n## Output Format
Return a JSON object with this exact structure:
{
  "title": "Demo title",
  "scenes": [
    {
      "narration": "What the voiceover says",
      "steps": [
        { "action": "goto", "url": "https://..." },
        { "action": "click", "selector": { "strategy": "id", "value": "..." } }
      ],
      "emphasis": "optional focus note"
    }
  ]
}

Return ONLY the JSON object, no markdown fences or explanation.`;

	return prompt;
}

function parseScriptResponse(text: string): { title: string; scenes: ScriptScene[] } {
	// Strip markdown code fences if present
	let cleaned = text.trim();
	if (cleaned.startsWith("```")) {
		cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
	}

	const parsed = JSON.parse(cleaned);

	if (!parsed.title || !Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
		throw new Error("Invalid script response: missing title or scenes");
	}

	return parsed;
}

/**
 * Generate a demo script using Claude API + DOM crawling.
 *
 * Approach: Crawl key pages upfront, generate full script, then validate.
 */
export async function generateScript(options: GenerateOptions): Promise<DemoScript> {
	const { description, url, hints, headed, verbose, apiKey } = options;

	// Step 1: Crawl the starting page
	if (verbose) {
		console.log(`Crawling ${url}...`);
	}

	const startPage = await crawlUrl(url, { headed });
	const pageContext = formatPageContext(startPage);

	if (verbose) {
		console.log(`Found ${startPage.elements.length} interactive elements`);
	}

	// Step 2: Call Claude API to generate the script
	if (verbose) {
		console.log("Generating script with Claude...");
	}

	// @ts-ignore — @anthropic-ai/sdk is an optional peer dependency
	const { default: Anthropic } = await import("@anthropic-ai/sdk");
	const client = new Anthropic(apiKey ? { apiKey } : undefined);

	const message = await client.messages.create({
		model: "claude-sonnet-4-20250514",
		max_tokens: 4096,
		system: SYSTEM_PROMPT,
		messages: [
			{
				role: "user",
				content: buildUserPrompt(description, pageContext, hints),
			},
		],
	});

	const responseText = (message.content as any[])
		.filter((block: any) => block.type === "text")
		.map((block: any) => block.text)
		.join("");

	if (!responseText) {
		throw new Error("Empty response from Claude API");
	}

	const { title, scenes } = parseScriptResponse(responseText);

	if (verbose) {
		console.log(`Generated ${scenes.length} scene(s): "${title}"`);
	}

	return {
		title,
		description,
		url,
		scenes,
	};
}

/**
 * Validate a generated script by executing steps in a headless browser.
 * Returns a list of failed steps with error messages.
 */
export async function validateScript(
	script: DemoScript,
	options: { headed?: boolean; verbose?: boolean } = {},
): Promise<{ scene: number; step: number; error: string }[]> {
	const failures: { scene: number; step: number; error: string }[] = [];
	const browser = await chromium.launch({ headless: !options.headed });
	const context = await browser.newContext();
	const page = await context.newPage();

	try {
		for (let si = 0; si < script.scenes.length; si++) {
			const scene = script.scenes[si];
			for (let sti = 0; sti < scene.steps.length; sti++) {
				const step = scene.steps[sti] as Step;
				try {
					await runStepSimple(page, step);
					if (options.verbose) {
						console.log(`  ✓ Scene ${si + 1}, Step ${sti + 1}: ${step.action}`);
					}
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					failures.push({ scene: si, step: sti, error: message });
					if (options.verbose) {
						console.log(`  ✗ Scene ${si + 1}, Step ${sti + 1}: ${step.action} — ${message}`);
					}
				}
			}
		}
	} finally {
		await context.close();
		await browser.close();
	}

	return failures;
}

/**
 * Fix broken steps by re-crawling and asking the LLM to generate replacements.
 */
export async function fixBrokenSteps(
	script: DemoScript,
	failures: { scene: number; step: number; error: string }[],
	options: { verbose?: boolean; apiKey?: string } = {},
): Promise<DemoScript> {
	if (failures.length === 0) return script;

	// Re-crawl from the starting URL to get current DOM state
	if (options.verbose) {
		console.log(`Re-crawling ${script.url} to fix ${failures.length} broken step(s)...`);
	}

	const page = await crawlUrl(script.url);
	const pageContext = formatPageContext(page);

	const failureDescriptions = failures
		.map((f) => {
			const scene = script.scenes[f.scene];
			const step = scene.steps[f.step];
			return `Scene ${f.scene + 1} ("${scene.narration.slice(0, 50)}..."), Step ${f.step + 1} (${(step as Step).action}): ${f.error}`;
		})
		.join("\n");

	// @ts-ignore — @anthropic-ai/sdk is an optional peer dependency
	const { default: Anthropic } = await import("@anthropic-ai/sdk");
	const client = new Anthropic(options.apiKey ? { apiKey: options.apiKey } : undefined);

	const message = await client.messages.create({
		model: "claude-sonnet-4-20250514",
		max_tokens: 4096,
		system: SYSTEM_PROMPT,
		messages: [
			{
				role: "user",
				content: `The following script has broken steps. Fix ONLY the broken steps using the current page context. Return the complete updated script.

## Current Page Context
${pageContext}

## Broken Steps
${failureDescriptions}

## Current Script
${JSON.stringify(script, null, 2)}

Return the full corrected JSON script (same format as before). Fix only the broken steps, keep everything else unchanged.`,
			},
		],
	});

	const responseText = (message.content as any[])
		.filter((block: any) => block.type === "text")
		.map((block: any) => block.text)
		.join("");

	const { title, scenes } = parseScriptResponse(responseText);

	return {
		...script,
		title,
		scenes,
	};
}
