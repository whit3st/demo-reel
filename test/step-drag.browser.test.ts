import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { runStepSimple } from "../src/runner/step-simple.js";
import type { Step } from "../src/schemas.js";

/**
 * The drag implementation dispatches synthetic DragEvents from inside
 * page.evaluate. A mocked page never invokes that callback, so the event
 * sequence — the thing that decides whether a real drag-and-drop UI responds —
 * is only observable against a real browser.
 */
describe("drag against a real page", () => {
  let browser: Browser;
  let page: Page;

  const FIXTURE = `
    <html><body>
      <div id="card" draggable="true" style="width:80px;height:80px;background:#ccc">Card</div>
      <div id="bin" style="width:120px;height:120px;background:#eee">Bin</div>
      <ul id="log"></ul>
      <script>
        window.__events = [];
        window.__transfers = [];
        for (const [id, types] of [
          ["card", ["dragstart", "dragend"]],
          ["bin", ["dragover", "drop"]],
        ]) {
          for (const type of types) {
            document.getElementById(id).addEventListener(type, (event) => {
              window.__events.push(type);
              window.__transfers.push(event.dataTransfer);
              event.preventDefault();
            });
          }
        }
      </script>
    </body></html>`;

  const dragStep = {
    action: "drag",
    source: { strategy: "id", value: "card" },
    target: { strategy: "id", value: "bin" },
  } as unknown as Step;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
  }, 30000);

  afterAll(async () => {
    await browser?.close();
  });

  beforeEach(async () => {
    await page.setContent(FIXTURE);
  });

  // HTML drag-and-drop requires this exact order. Libraries that implement drop
  // zones (dnd-kit, react-dnd, Sortable) key off the sequence, so a reordering
  // here silently stops working for every consumer while the step still
  // "succeeds".
  it("dispatches dragstart → dragover → drop → dragend in order", async () => {
    await runStepSimple(page, dragStep);

    await expect(page.evaluate(() => (window as any).__events)).resolves.toEqual([
      "dragstart",
      "dragover",
      "drop",
      "dragend",
    ]);
  });

  it("fires the source events on the source and the target events on the target", async () => {
    await page.evaluate(() => {
      (window as any).__targets = [];
      for (const type of ["dragstart", "dragover", "drop", "dragend"]) {
        document.addEventListener(
          type,
          (event) => (window as any).__targets.push([type, (event.target as HTMLElement).id]),
          true,
        );
      }
    });

    await runStepSimple(page, dragStep);

    await expect(page.evaluate(() => (window as any).__targets)).resolves.toEqual([
      ["dragstart", "card"],
      ["dragover", "bin"],
      ["drop", "bin"],
      ["dragend", "card"],
    ]);
  });

  // A single DataTransfer is what lets a real drop handler read what dragstart
  // wrote into it. Constructing a fresh one per event silently drops the
  // payload, so any UI that transfers data receives nothing.
  it("shares one DataTransfer across the whole sequence", async () => {
    await runStepSimple(page, dragStep);

    const shared = await page.evaluate(() => {
      const transfers = (window as any).__transfers as unknown[];
      return transfers.every((t) => t !== null && t === transfers[0]);
    });

    expect(shared).toBe(true);
  });

  it("carries data written at dragstart through to drop", async () => {
    await page.evaluate(() => {
      document
        .getElementById("card")!
        .addEventListener("dragstart", (event) =>
          (event as DragEvent).dataTransfer!.setData("text/plain", "card-42"),
        );
      document.getElementById("bin")!.addEventListener("drop", (event) => {
        (window as any).__dropped = (event as DragEvent).dataTransfer!.getData("text/plain");
      });
    });

    await runStepSimple(page, dragStep);

    await expect(page.evaluate(() => (window as any).__dropped)).resolves.toBe("card-42");
  });

  it("bubbles the events so delegated listeners on ancestors fire", async () => {
    await page.evaluate(() => {
      (window as any).__bubbled = [];
      document.body.addEventListener("drop", () => (window as any).__bubbled.push("drop"));
    });

    await runStepSimple(page, dragStep);

    await expect(page.evaluate(() => (window as any).__bubbled)).resolves.toEqual(["drop"]);
  });

  describe("missing elements", () => {
    // In a real browser locator.elementHandle() auto-waits rather than
    // returning null immediately, so a missing target surfaces as a Playwright
    // timeout — the explicit null guard is the backstop for a detached element,
    // and is covered directly in runner-defects.test.ts. Either way the step
    // must fail loudly instead of dragging nothing and reporting success.
    it("fails rather than silently dragging nothing", async () => {
      page.setDefaultTimeout(500);
      const step = {
        action: "drag",
        source: { strategy: "id", value: "card" },
        target: { strategy: "id", value: "does-not-exist" },
      } as unknown as Step;

      try {
        await expect(runStepSimple(page, step)).rejects.toThrow();
      } finally {
        // 30000 is Playwright's default. Passing 0 would DISABLE the timeout
        // rather than restore it, so a later test waiting on a missing element
        // would hang until vitest killed the whole file.
        page.setDefaultTimeout(30000);
      }
    });
  });
});

describe("scroll against a real page", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
  }, 30000);

  afterAll(async () => {
    await browser?.close();
  });

  // The scroll step runs el.scrollBy inside page.evaluate — another callback a
  // mock can never invoke.
  it("scrolls the targeted element by the requested amount", async () => {
    await page.setContent(`
      <div id="box" style="height:100px;width:200px;overflow:auto">
        <div style="height:2000px"></div>
      </div>`);

    await runStepSimple(page, {
      action: "scroll",
      selector: { strategy: "id", value: "box" },
      x: 0,
      y: 300,
    } as unknown as Step);

    const scrollTop = await page.evaluate(
      () =>
        new Promise<number>((resolve) =>
          setTimeout(() => resolve(document.getElementById("box")!.scrollTop), 400),
        ),
    );
    expect(Math.abs(scrollTop - 300)).toBeLessThanOrEqual(3);
  });
});
