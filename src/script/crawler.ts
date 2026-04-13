import { chromium, type Page, type ElementHandle } from "playwright";
import type { CrawledElement, CrawledPage } from "./types.js";
import type { SelectorConfig } from "../schemas.js";

const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input:not([type=hidden])",
  "select",
  "textarea",
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="tab"]',
  "[contenteditable]",
].join(", ");

function inferRole(tag: string, type: string | null): CrawledElement["role"] {
  if (tag === "a") return "link";
  if (tag === "button" || type === "submit" || type === "button") return "button";
  if (tag === "select") return "select";
  if (tag === "textarea") return "textarea";
  if (type === "checkbox") return "checkbox";
  if (type === "radio") return "radio";
  if (tag === "input") return "input";
  return "other";
}

/**
 * Build the best stable selector for an element.
 * Priority: data-testid > id > aria-label (unique) > text content match > CSS path
 */
function buildSelector(
  tag: string,
  attrs: Record<string, string>,
  _text: string,
  _index: number,
): SelectorConfig {
  if (attrs["data-testid"]) {
    return { strategy: "testId", value: attrs["data-testid"] };
  }

  if (attrs["id"]) {
    return { strategy: "id", value: attrs["id"] };
  }

  if (tag === "a" && attrs["href"] && attrs["href"] !== "#") {
    return { strategy: "href", value: attrs["href"] };
  }

  if (attrs["data-node-id"]) {
    return { strategy: "data-node-id", value: attrs["data-node-id"] };
  }

  // Fall back to class if it looks unique enough (single class, not utility)
  if (attrs["class"]) {
    const classes = attrs["class"].split(/\s+/).filter((c) => c.length > 3);
    if (classes.length === 1) {
      return { strategy: "class", value: classes[0] };
    }
  }

  // Last resort: CSS selector based on tag + attributes
  const parts = [tag];
  if (attrs["type"]) {
    parts[0] = `${tag}[type="${attrs["type"]}"]`;
  }
  if (attrs["name"]) {
    parts[0] = `${tag}[name="${attrs["name"]}"]`;
  }
  if (attrs["placeholder"]) {
    parts[0] = `${tag}[placeholder="${attrs["placeholder"]}"]`;
  }

  return { strategy: "custom", value: parts[0] };
}

async function extractElement(
  handle: ElementHandle,
  index: number,
): Promise<CrawledElement | null> {
  try {
    const data = await handle.evaluate((node) => {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      const type = el.getAttribute("type");
      const text =
        el.getAttribute("aria-label") ||
        el.getAttribute("placeholder") ||
        el.innerText?.trim().slice(0, 100) ||
        "";

      const attrs: Record<string, string> = {};
      for (const attr of [
        "id",
        "class",
        "href",
        "type",
        "name",
        "placeholder",
        "aria-label",
        "data-testid",
        "data-node-id",
        "role",
        "value",
      ]) {
        const val = el.getAttribute(attr);
        if (val) attrs[attr] = val;
      }

      const rect = el.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0;

      return { tag, type, text, attrs, rect, visible };
    });

    if (!data.visible) return null;

    const role = inferRole(data.tag, data.type);
    const selector = buildSelector(data.tag, data.attrs, data.text, index);

    return {
      tag: data.tag,
      text: data.text,
      selector,
      role,
      attributes: data.attrs,
      boundingBox: {
        x: Math.round(data.rect.x),
        y: Math.round(data.rect.y),
        width: Math.round(data.rect.width),
        height: Math.round(data.rect.height),
      },
    };
  } catch {
    return null;
  }
}

/**
 * Crawl a single page and extract all interactive elements.
 */
export async function crawlPage(page: Page): Promise<CrawledPage> {
  await page.waitForLoadState("networkidle").catch(() => {
    // Fall back to domcontentloaded if networkidle times out
  });

  const title = await page.title();
  const url = page.url();

  const headings = await page.evaluate(() => {
    const headingEls = document.querySelectorAll("h1, h2, h3");
    return Array.from(headingEls)
      .map((el) => (el as HTMLElement).innerText?.trim())
      .filter((t) => t && t.length > 0)
      .slice(0, 10);
  });

  const handles = await page.$$(INTERACTIVE_SELECTOR);
  const elements: CrawledElement[] = [];

  for (let i = 0; i < handles.length; i++) {
    const element = await extractElement(handles[i], i);
    if (element) {
      elements.push(element);
    }
  }

  return { url, title, headings, elements };
}

/**
 * Crawl a URL by launching a browser, navigating, and extracting elements.
 * Optionally accepts auth cookies to restore session.
 */
export async function crawlUrl(
  url: string,
  options: {
    headed?: boolean;
    cookies?: Array<{
      name: string;
      value: string;
      domain: string;
      path: string;
    }>;
  } = {},
): Promise<CrawledPage> {
  const browser = await chromium.launch({ headless: !options.headed });
  const context = await browser.newContext();

  if (options.cookies) {
    await context.addCookies(options.cookies);
  }

  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {
      // Retry with just load
      return page.goto(url, { waitUntil: "load", timeout: 15000 });
    });

    return await crawlPage(page);
  } finally {
    await context.close();
    await browser.close();
  }
}

/**
 * Format crawled page as context string for LLM consumption.
 */
export function formatPageContext(page: CrawledPage): string {
  const lines: string[] = [];
  lines.push(`URL: ${page.url}`);
  lines.push(`Title: ${page.title}`);

  if (page.headings.length > 0) {
    lines.push(`Headings: ${page.headings.join(" | ")}`);
  }

  lines.push("");
  lines.push(`Interactive elements (${page.elements.length}):`);

  for (const el of page.elements) {
    const selectorStr =
      el.selector.strategy === "custom"
        ? `custom: "${el.selector.value}"`
        : `${el.selector.strategy}: "${el.selector.value}"`;

    const textPart = el.text ? ` — "${el.text}"` : "";
    lines.push(`  [${el.role}] <${el.tag}> ${selectorStr}${textPart}`);
  }

  return lines.join("\n");
}
