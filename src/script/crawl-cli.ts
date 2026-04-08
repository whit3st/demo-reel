#!/usr/bin/env -S node --import tsx/esm
/**
 * Standalone crawler script for use with Claude Code.
 * Usage: node dist/script/crawl-cli.js <url>
 * Outputs crawled page data as JSON to stdout.
 */
import { crawlUrl, formatPageContext } from "./crawler.js";

async function main() {
	const url = process.argv[2];
	const format = process.argv[3]; // "json" or "text" (default: text)

	if (!url) {
		console.error("Usage: node dist/script/crawl-cli.js <url> [json|text]");
		process.exit(1);
	}

	try {
		const page = await crawlUrl(url);

		if (format === "json") {
			console.log(JSON.stringify(page, null, 2));
		} else {
			console.log(formatPageContext(page));
		}
	} catch (error) {
		console.error(`Error crawling ${url}: ${error instanceof Error ? error.message : error}`);
		process.exit(1);
	}
}

main();
