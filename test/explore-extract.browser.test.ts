import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { extractPage } from "../src/script/explore.js";

/**
 * extractPage runs against a real page on purpose.
 *
 * The unit tests in explore.test.ts stub page.evaluate by stringifying the
 * callback (`fn.toString().includes("filterHeadings")`) and then invoking the
 * *Node* implementation. That made a broken call look correct: the callbacks
 * referenced filterHeadings/processElements, which are module-scope Node
 * functions that do not exist inside the browser realm, so every real run threw
 * "ReferenceError: filterHeadings is not defined". Only a real page catches it.
 */
describe("extractPage against a real page", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
  }, 30000);

  afterAll(async () => {
    await browser?.close();
  });

  const TEST_HTML = `
    <html>
      <head><title>Dashboard</title></head>
      <body>
        <h1>Welcome back</h1>
        <h2>Your Session</h2>
        <h2>Recent Activity</h2>
        <h3></h3>
        <button id="save" class="btn btn-primary sm">Save changes</button>
        <a href="/reports" data-testid="reports-link">Reports</a>
        <input type="email" name="email" placeholder="you@example.com" />
        <select name="range"><option>7d</option></select>
        <button style="display:none">Hidden action</button>
        <input type="hidden" name="csrf" value="x" />
        <button aria-label="Close dialog">×</button>
      </body>
    </html>`;

  beforeAll(async () => {
    await page.goto("about:blank");
    await page.setContent(TEST_HTML);
  }, 30000);

  it("extracts the page without throwing in the browser realm", async () => {
    await expect(extractPage(page)).resolves.toBeDefined();
  });

  it("returns the document title and path", async () => {
    const info = await extractPage(page);

    expect(info.title).toBe("Dashboard");
    // setContent keeps the about:blank URL, whose pathname is "blank".
    expect(info.path).toBe("blank");
  });

  it("applies the heading filter rules inside the real DOM", async () => {
    const info = await extractPage(page);

    expect(info.headings).toContain("Welcome back");
    expect(info.headings).toContain("Recent Activity");
    // Filtered: contains "Session", and the empty h3.
    expect(info.headings).not.toContain("Your Session");
    expect(info.headings).not.toContain("");
  });

  it("collects interactive elements with their attributes", async () => {
    const info = await extractPage(page);

    const save = info.elements.find((el) => el.id === "save");
    expect(save).toMatchObject({ tag: "button", text: "Save changes" });

    const link = info.elements.find((el) => el.testId === "reports-link");
    expect(link).toMatchObject({ tag: "a", href: "/reports" });

    const email = info.elements.find((el) => el.name === "email");
    expect(email).toMatchObject({ type: "email", placeholder: "you@example.com" });
  });

  it("drops zero-size elements and keeps hidden inputs out of the selector", async () => {
    const info = await extractPage(page);

    expect(info.elements.some((el) => el.text === "Hidden action")).toBe(false);
    expect(info.elements.some((el) => el.name === "csrf")).toBe(false);
  });

  it("prefers aria-label over inner text", async () => {
    const info = await extractPage(page);

    expect(info.elements.some((el) => el.text === "Close dialog")).toBe(true);
  });

  it("keeps only class names longer than two characters, capped at four", async () => {
    const info = await extractPage(page);

    const save = info.elements.find((el) => el.id === "save");
    // "btn btn-primary sm" → "sm" is too short.
    expect(save?.classes).toBe("btn btn-primary");
  });
});
