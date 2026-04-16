#!/usr/bin/env node
/**
 * Explore a site by clicking through the UI like a real user.
 * Logs in, then clicks sidebar/nav links to discover pages.
 *
 * Usage: node --import tsx/esm src/script/explore.ts <base-url> [options]
 */
import { chromium, type Page } from "playwright";
import { writeFile } from "fs/promises";
import { pathToFileURL } from "url";

interface PageInfo {
  url: string;
  path: string;
  title: string;
  headings: string[];
  elements: {
    tag: string;
    type: string | null;
    id: string | null;
    testId: string | null;
    name: string | null;
    placeholder: string | null;
    classes: string;
    text: string;
    href: string | null;
  }[];
}

const INTERACTIVE_SELECTOR =
  "button, a[href], input:not([type=hidden]), select, textarea, [role=button]";

interface RawHeading {
  innerText: string;
}

interface RawElement {
  tagName: string;
  getAttribute(name: string): string | null;
  innerText: string;
  getBoundingClientRect(): { width: number; height: number };
}

export function filterHeadings(headings: RawHeading[]): string[] {
  return headings
    .map((el) => el.innerText?.trim())
    .filter((t) => t && t.length > 0 && !t.includes("Session") && !t.includes("Logged Out"))
    .slice(0, 15);
}

interface ProcessedElement {
  tag: string;
  type: string | null;
  id: string | null;
  testId: string | null;
  name: string | null;
  placeholder: string | null;
  classes: string;
  text: string;
  href: string | null;
}

export function processElements(elements: RawElement[]): ProcessedElement[] {
  return elements
    .map((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      return {
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute("type"),
        id: el.getAttribute("id"),
        testId: el.getAttribute("data-testid"),
        name: el.getAttribute("name"),
        placeholder: el.getAttribute("placeholder"),
        classes: (el.getAttribute("class") || "")
          .split(" ")
          .filter((c) => c.length > 2)
          .slice(0, 4)
          .join(" "),
        text:
          el.getAttribute("aria-label") ||
          el.innerText?.trim().replace(/\s+/g, " ").slice(0, 80) ||
          "",
        href: el.getAttribute("href"),
      };
    })
    .filter(Boolean) as ProcessedElement[];
}

export async function extractPage(page: Page): Promise<PageInfo> {
  const url = page.url();
  const path = new URL(url).pathname;
  const title = await page.title();

  const headings = await page.evaluate(() =>
    filterHeadings(Array.from(document.querySelectorAll("h1,h2,h3,h4"))),
  );

  const elements = await page.evaluate(
    (sel) => processElements(Array.from(document.querySelectorAll(sel))),
    INTERACTIVE_SELECTOR,
  );

  return { url, path, title, headings, elements };
}

export function formatPage(page: PageInfo): string {
  const lines: string[] = [];
  lines.push(`### ${page.path}`);
  lines.push(`Title: ${page.title}`);
  if (page.headings.length) lines.push(`Headings: ${page.headings.join(" | ")}`);

  const inputs = page.elements.filter((el) => ["input", "select", "textarea"].includes(el.tag));
  const buttons = page.elements.filter(
    (el) => el.tag === "button" || (el.tag === "a" && el.href && !el.href.startsWith("/")),
  );
  const navLinks = page.elements.filter((el) => el.tag === "a" && el.href?.startsWith("/"));

  if (inputs.length > 0) {
    lines.push("Form elements:");
    for (const el of inputs) {
      const sel = el.testId
        ? `testId="${el.testId}"`
        : el.id
          ? `id="${el.id}"`
          : el.name
            ? `name="${el.name}"`
            : el.classes;
      lines.push(
        `  <${el.tag}${el.type ? ` type="${el.type}"` : ""}> ${sel} — "${el.placeholder || el.text}"`,
      );
    }
  }

  if (buttons.length > 0) {
    lines.push("Buttons:");
    for (const el of buttons) {
      const sel = el.testId
        ? `testId="${el.testId}"`
        : el.id
          ? `id="${el.id}"`
          : el.classes || el.tag;
      lines.push(`  <${el.tag}> ${sel} — "${el.text}"`);
    }
  }

  if (navLinks.length > 0) {
    lines.push("Links:");
    for (const el of navLinks) {
      lines.push(`  "${el.text}" → ${el.href}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  let baseUrl = "";
  let username = "";
  let password = "";
  let outputFile = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--user") username = args[++i];
    else if (args[i] === "--pass") password = args[++i];
    else if (args[i] === "--output") outputFile = args[++i];
    else if (!args[i].startsWith("-")) baseUrl = args[i];
  }

  if (!baseUrl) {
    console.error(
      "Usage: node --import tsx/esm src/script/explore.ts <base-url> [--user <u> --pass <p>]",
    );
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  // Login at the root domain, then navigate to the target
  if (username && password) {
    const origin = new URL(baseUrl).origin;
    console.error("Logging in...");
    await page.goto(`${origin}/login`);
    await page.fill("#username", username);
    await page.fill("#password", password);
    await page.click(".btn-primary");
    await page.waitForLoadState("networkidle").catch(() => {});
    console.error(`Logged in → ${page.url()}`);

    // Now navigate to the target URL by clicking through
    // First check if we need to click a tenant link
    if (baseUrl !== origin && baseUrl !== `${origin}/`) {
      const targetPath = new URL(baseUrl).pathname;
      // Try clicking a link to the target
      const tenantLink = page.locator(`a[href="${targetPath}"]`).first();
      const exists = (await tenantLink.count()) > 0;
      if (exists) {
        await tenantLink.click();
        await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(500);
        console.error(`Navigated → ${page.url()}`);
      }
    }
  } else {
    await page.goto(baseUrl);
    await page.waitForLoadState("networkidle").catch(() => {});
  }

  const pages: PageInfo[] = [];
  const output: string[] = [];
  output.push(`# Site Exploration: ${baseUrl}\n`);

  // Crawl the landing page
  console.error(`Exploring: ${page.url()}`);
  const landing = await extractPage(page);
  pages.push(landing);
  output.push(formatPage(landing));

  // Find sidebar/nav links that are internal
  const navLinks = landing.elements
    .filter(
      (el) =>
        el.tag === "a" &&
        el.href?.startsWith("/") &&
        el.text.length > 0 &&
        el.text.length < 40 &&
        !el.href.includes("/api-docs") &&
        !el.href.includes("/login"),
    )
    .filter(
      (el, i, arr) => arr.findIndex((e) => e.href === el.href) === i, // dedupe
    );

  // Click each nav link to explore pages
  const visited = new Set<string>([landing.path]);

  for (const link of navLinks) {
    if (!link.href || visited.has(link.href)) continue;
    visited.add(link.href);

    try {
      // Click the link in the UI (not goto) to maintain SPA state
      const linkEl = page.locator(`a[href="${link.href}"]`).first();
      await linkEl.click();
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(500); // Let SPA render

      // Check we're not on an error page
      const isError = await page.evaluate(() =>
        document.body.innerText.includes("Whitelabel Error"),
      );
      if (isError) {
        console.error(`  Skipped: ${link.href} (error page)`);
        // Go back
        await page.goBack();
        await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
        continue;
      }

      console.error(`Exploring: ${link.href} (${link.text})`);
      const pageInfo = await extractPage(page);
      pages.push(pageInfo);
      output.push(formatPage(pageInfo));
    } catch (err) {
      console.error(`  Failed: ${link.href} — ${err instanceof Error ? err.message : err}`);
    }
  }

  // Also explore "New Template" if there's such a link
  const newTemplateLink = landing.elements.find((el) => el.href?.includes("/templates/new"));
  if (newTemplateLink && !visited.has(newTemplateLink.href!)) {
    try {
      const linkEl = page.locator(`a[href="${newTemplateLink.href}"]`).first();
      await linkEl.click();
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(500);

      console.error(`Exploring: ${newTemplateLink.href} (New Template)`);
      const pageInfo = await extractPage(page);
      pages.push(pageInfo);
      output.push(formatPage(pageInfo));
    } catch (err) {
      console.error(`  Failed: New Template — ${err instanceof Error ? err.message : err}`);
    }
  }

  await browser.close();

  const formatted = output.join("\n");
  if (outputFile) {
    if (outputFile.endsWith(".json")) {
      await writeFile(outputFile, JSON.stringify(pages, null, 2));
    } else {
      await writeFile(outputFile, formatted);
    }
    console.error(`\nWritten to ${outputFile}`);
  }

  console.log(formatted);
}

/* c8 ignore next 5 */
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
