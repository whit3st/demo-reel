import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";

import { runStepSimple } from "../src/runner/step-simple.js";

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();
});

afterAll(async () => {
  await browser?.close();
});

describe("fill step", () => {
  // A native date input is segmented (mm/dd/yyyy). A click lands on whichever
  // segment is under the pointer and typed digits fill only that one, so
  // keystroke entry cannot set it — which is what `fill` exists for.
  it("sets a native date input, which typing cannot", async () => {
    await page.setContent('<input type="date" id="d">');

    await runStepSimple(page, {
      action: "fill",
      selector: { strategy: "id", value: "d" },
      value: "2026-12-31",
    } as never);

    expect(await page.locator("#d").inputValue()).toBe("2026-12-31");
  });

  it("replaces an existing value rather than appending", async () => {
    await page.setContent('<input type="text" id="t" value="old">');

    await runStepSimple(page, {
      action: "fill",
      selector: { strategy: "id", value: "t" },
      value: "new",
    } as never);

    expect(await page.locator("#t").inputValue()).toBe("new");
  });

  it("clears when given an empty value", async () => {
    await page.setContent('<input type="text" id="t" value="something">');

    await runStepSimple(page, {
      action: "fill",
      selector: { strategy: "id", value: "t" },
      value: "",
    } as never);

    expect(await page.locator("#t").inputValue()).toBe("");
  });
});
