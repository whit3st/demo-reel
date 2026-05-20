import { beforeEach, describe, expect, it, vi } from "vitest";

const { locatorMock, pageMock } = vi.hoisted(() => {
  const locatorMock = {
    first: vi.fn(() => locatorMock),
    nth: vi.fn(() => locatorMock),
    waitFor: vi.fn().mockResolvedValue(undefined),
    scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
    boundingBox: vi.fn().mockResolvedValue({ x: 100, y: 200, width: 50, height: 30 }),
    click: vi.fn().mockResolvedValue(undefined),
    hover: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    type: vi.fn().mockResolvedValue(undefined),
    press: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(undefined),
    selectOption: vi.fn().mockResolvedValue(undefined),
    setChecked: vi.fn().mockResolvedValue(undefined),
    setInputFiles: vi.fn().mockResolvedValue(undefined),
    dragTo: vi.fn().mockResolvedValue(undefined),
    focus: vi.fn().mockResolvedValue(undefined),
    textContent: vi.fn().mockResolvedValue(""),
    count: vi.fn().mockResolvedValue(0),
  };
  const pageMock = {
    getByTestId: vi.fn(() => locatorMock),
    locator: vi.fn(() => locatorMock),
    goto: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    waitForEvent: vi.fn(() =>
      Promise.resolve({
        accept: vi.fn().mockResolvedValue(undefined),
        dismiss: vi.fn().mockResolvedValue(undefined),
      }),
    ),
    waitForURL: vi.fn().mockResolvedValue(undefined),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    waitForRequest: vi.fn().mockResolvedValue({ url: () => "http://example.com" }),
    waitForResponse: vi.fn().mockResolvedValue({ url: () => "http://example.com" }),
    waitForFunction: vi.fn().mockResolvedValue(undefined),
    keyboard: {
      type: vi.fn().mockResolvedValue(undefined),
      press: vi.fn().mockResolvedValue(undefined),
    },
    mouse: {
      move: vi.fn().mockResolvedValue(undefined),
      wheel: vi.fn().mockResolvedValue(undefined),
      down: vi.fn().mockResolvedValue(undefined),
      up: vi.fn().mockResolvedValue(undefined),
    },
    viewportSize: vi.fn().mockReturnValue({ width: 1920, height: 1080 }),
    url: vi.fn(() => "http://example.com/"),
    title: vi.fn(() => "Test"),
    addInitScript: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(undefined),
  };
  return { locatorMock, pageMock };
});

vi.mock("playwright", () => ({
  chromium: { launch: vi.fn() },
}));

import { runScenarioForTest, runStepSimple, runSteps } from "../src/runner.js";
import type { DemoConfig } from "../src/index.js";
import type { Page } from "playwright";

const baseTestConfig = (overrides: Partial<DemoConfig> = {}): DemoConfig => ({
  video: { resolution: "HD" },
  cursor: "dot",
  motion: "instant",
  typing: "instant",
  timing: "instant",
  steps: [{ action: "wait", ms: 0 }],
  ...overrides,
});

const makePage = (overrides: Partial<Page> = {}): Page =>
  ({ ...pageMock, ...overrides }) as unknown as Page;

describe("runStepSimple", () => {
  let page: Page;

  beforeEach(() => {
    vi.clearAllMocks();
    page = makePage();
  });

  it("handles goto step", async () => {
    await runStepSimple(page, { action: "goto", url: "http://example.com/login" });
    expect(page.goto).toHaveBeenCalledWith("http://example.com/login", undefined);
  });

  it("handles goto step with waitUntil", async () => {
    await runStepSimple(page, {
      action: "goto",
      url: "http://example.com/",
      waitUntil: "networkidle",
    });
    expect(page.goto).toHaveBeenCalledWith("http://example.com/", { waitUntil: "networkidle" });
  });

  it("handles wait step", async () => {
    await runStepSimple(page, { action: "wait", ms: 500 });
    expect(page.waitForTimeout).toHaveBeenCalledWith(500);
  });

  it("handles click step", async () => {
    await runStepSimple(page, { action: "click", selector: { strategy: "id", value: "btn" } });
    expect(page.locator).toHaveBeenCalledWith("#btn");
    expect(locatorMock.first).toHaveBeenCalled();
    expect(locatorMock.click).toHaveBeenCalled();
  });

  it("handles hover step", async () => {
    await runStepSimple(page, { action: "hover", selector: { strategy: "testId", value: "menu" } });
    expect(page.getByTestId).toHaveBeenCalledWith("menu");
    expect(locatorMock.hover).toHaveBeenCalled();
  });

  it("handles type step with clear", async () => {
    await runStepSimple(page, {
      action: "type",
      selector: { strategy: "id", value: "input" },
      text: "hello",
      clear: true,
    });
    expect(page.locator).toHaveBeenCalledWith("#input");
    expect(locatorMock.fill).toHaveBeenCalledWith("hello");
  });

  it("handles type step without clear", async () => {
    await runStepSimple(page, {
      action: "type",
      selector: { strategy: "id", value: "input" },
      text: "hello",
      clear: false,
    });
    expect(locatorMock.type).toHaveBeenCalledWith("hello");
  });

  it("handles press step", async () => {
    await runStepSimple(page, {
      action: "press",
      selector: { strategy: "class", value: "field" },
      key: "Enter",
    });
    expect(page.locator).toHaveBeenCalledWith(".field");
    expect(locatorMock.press).toHaveBeenCalledWith("Enter");
  });

  it("handles scroll step", async () => {
    await runStepSimple(page, {
      action: "scroll",
      selector: { strategy: "id", value: "el" },
      x: 0,
      y: 200,
    });
    expect(page.locator).toHaveBeenCalledWith("#el");
    expect(locatorMock.evaluate).toHaveBeenCalled();
  });

  it("handles select step", async () => {
    await runStepSimple(page, {
      action: "select",
      selector: { strategy: "id", value: "dropdown" },
      value: "opt1",
    });
    expect(page.locator).toHaveBeenCalledWith("#dropdown");
    expect(locatorMock.selectOption).toHaveBeenCalledWith("opt1");
  });

  it("handles check step (checked)", async () => {
    await runStepSimple(page, {
      action: "check",
      selector: { strategy: "testId", value: "agree" },
      checked: true,
    });
    expect(page.getByTestId).toHaveBeenCalledWith("agree");
    expect(locatorMock.setChecked).toHaveBeenCalledWith(true);
  });

  it("handles check step (unchecked)", async () => {
    await runStepSimple(page, {
      action: "check",
      selector: { strategy: "testId", value: "agree" },
      checked: false,
    });
    expect(locatorMock.setChecked).toHaveBeenCalledWith(false);
  });

  it("handles upload step", async () => {
    await runStepSimple(page, {
      action: "upload",
      selector: { strategy: "id", value: "file-input" },
      filePath: "/tmp/test.png",
    });
    expect(page.locator).toHaveBeenCalledWith("#file-input");
    expect(locatorMock.setInputFiles).toHaveBeenCalledWith("/tmp/test.png");
  });

  it("handles drag step", async () => {
    const targetLocator = {
      first: vi.fn(() => targetLocator),
      nth: vi.fn(() => targetLocator),
      waitFor: vi.fn().mockResolvedValue(undefined),
      scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
      boundingBox: vi.fn().mockResolvedValue({ x: 200, y: 300, width: 50, height: 30 }),
      click: vi.fn().mockResolvedValue(undefined),
      hover: vi.fn().mockResolvedValue(undefined),
      fill: vi.fn().mockResolvedValue(undefined),
      type: vi.fn().mockResolvedValue(undefined),
      press: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue(undefined),
      selectOption: vi.fn().mockResolvedValue(undefined),
      setChecked: vi.fn().mockResolvedValue(undefined),
      setInputFiles: vi.fn().mockResolvedValue(undefined),
      dragTo: vi.fn().mockResolvedValue(undefined),
      focus: vi.fn().mockResolvedValue(undefined),
    };
    page.locator = vi.fn((sel: string) => (sel === "#src" ? locatorMock : targetLocator));
    await runStepSimple(page, {
      action: "drag",
      source: { strategy: "id", value: "src" },
      target: { strategy: "id", value: "tgt" },
    });
    expect(locatorMock.dragTo).toHaveBeenCalledWith(targetLocator);
  });

  it("handles waitFor selector", async () => {
    await runStepSimple(page, {
      action: "waitFor",
      kind: "selector",
      selector: { strategy: "id", value: "el" },
      state: "visible",
    });
    expect(page.locator).toHaveBeenCalledWith("#el");
    expect(locatorMock.waitFor).toHaveBeenCalledWith({ state: "visible" });
  });

  it("handles waitFor selector with timeout", async () => {
    await runStepSimple(page, {
      action: "waitFor",
      kind: "selector",
      selector: { strategy: "id", value: "el" },
      state: "hidden",
      timeoutMs: 5000,
    });
    expect(locatorMock.waitFor).toHaveBeenCalledWith({ state: "hidden", timeout: 5000 });
  });

  it("handles waitFor url", async () => {
    await runStepSimple(page, {
      action: "waitFor",
      kind: "url",
      url: "**/done",
      waitUntil: "networkidle",
    });
    expect(page.waitForURL).toHaveBeenCalledWith("**/done", { waitUntil: "networkidle" });
  });

  it("handles waitFor loadState", async () => {
    await runStepSimple(page, { action: "waitFor", kind: "loadState", state: "networkidle" });
    expect(page.waitForLoadState).toHaveBeenCalledWith("networkidle", {});
  });

  it("handles waitFor request", async () => {
    await runStepSimple(page, { action: "waitFor", kind: "request", url: "**/api/data" });
    expect(page.waitForRequest).toHaveBeenCalledWith("**/api/data", {});
  });

  it("handles waitFor response", async () => {
    await runStepSimple(page, { action: "waitFor", kind: "response", url: "**/api/data" });
    expect(page.waitForResponse).toHaveBeenCalledWith("**/api/data", {});
  });

  it("handles waitFor function", async () => {
    await runStepSimple(page, { action: "waitFor", kind: "function", expression: "() => true" });
    expect(page.waitForFunction).toHaveBeenCalledWith(
      "() => true",
      undefined,
      expect.objectContaining({ polling: undefined }),
    );
  });

  it("handles waitFor function with polling and timeout", async () => {
    await runStepSimple(page, {
      action: "waitFor",
      kind: "function",
      expression: "() => true",
      polling: 500,
      timeoutMs: 3000,
    });
    expect(page.waitForFunction).toHaveBeenCalledWith(
      "() => true",
      undefined,
      expect.objectContaining({ polling: 500, timeout: 3000 }),
    );
  });

  it("resolves nth index selector", async () => {
    await runStepSimple(page, {
      action: "click",
      selector: { strategy: "class", value: "item", index: 2 },
    });
    expect(page.locator).toHaveBeenCalledWith(".item");
    expect(locatorMock.nth).toHaveBeenCalledWith(2);
  });

  it("throws for unknown selector strategy", async () => {
    await expect(
      runStepSimple(page, {
        action: "click",
        selector: { strategy: "unknown" as any, value: "x" },
      }),
    ).rejects.toThrow("Unsupported selector strategy: unknown");
  });

  it("throws for id selector with # prefix", async () => {
    await expect(
      runStepSimple(page, { action: "click", selector: { strategy: "id", value: "#my-id" } }),
    ).rejects.toThrow('Selector values must be raw names without "#" or "."');
  });

  it("throws for class selector with . prefix", async () => {
    await expect(
      runStepSimple(page, { action: "click", selector: { strategy: "class", value: ".my-class" } }),
    ).rejects.toThrow('Selector values must be raw names without "#" or "."');
  });
});

describe("assertion steps", () => {
  let page: Page;

  beforeEach(() => {
    vi.clearAllMocks();
    page = makePage();
  });

  describe("assertText", () => {
    it("passes on substring match (default)", async () => {
      locatorMock.textContent.mockResolvedValueOnce("Welcome, Anna van der Berg");
      await runStepSimple(page, {
        action: "assertText",
        selector: { strategy: "testId", value: "salutation" },
        text: "Anna",
      });
      expect(locatorMock.waitFor).toHaveBeenCalledWith(
        expect.objectContaining({ state: "visible" }),
      );
      expect(locatorMock.textContent).toHaveBeenCalled();
    });

    it("passes on exact match when exact: true", async () => {
      locatorMock.textContent.mockResolvedValueOnce("Welcome");
      await runStepSimple(page, {
        action: "assertText",
        selector: { strategy: "id", value: "h" },
        text: "Welcome",
        exact: true,
      });
    });

    it("fails when exact match required but only substring matches", async () => {
      locatorMock.textContent.mockResolvedValueOnce("Welcome, Anna");
      await expect(
        runStepSimple(page, {
          action: "assertText",
          selector: { strategy: "id", value: "h" },
          text: "Welcome",
          exact: true,
        }),
      ).rejects.toThrow(/assertText failed/);
    });

    it("supports a regex pattern", async () => {
      locatorMock.textContent.mockResolvedValueOnce("Case VS-2025-0042 opened");
      await runStepSimple(page, {
        action: "assertText",
        selector: { strategy: "id", value: "case" },
        text: /VS-\d{4}-\d{4}/,
      });
    });

    it("fails when text doesn't include expected substring", async () => {
      locatorMock.textContent.mockResolvedValueOnce("Goodbye");
      await expect(
        runStepSimple(page, {
          action: "assertText",
          selector: { strategy: "id", value: "h" },
          text: "Welcome",
        }),
      ).rejects.toThrow(/assertText failed.*contain "Welcome".*got "Goodbye"/);
    });

    it("trims whitespace from actual text", async () => {
      locatorMock.textContent.mockResolvedValueOnce("  Welcome  ");
      await runStepSimple(page, {
        action: "assertText",
        selector: { strategy: "id", value: "h" },
        text: "Welcome",
        exact: true,
      });
    });
  });

  describe("assertVisible", () => {
    it("waits for visible state by default", async () => {
      await runStepSimple(page, {
        action: "assertVisible",
        selector: { strategy: "testId", value: "toast" },
      });
      expect(locatorMock.waitFor).toHaveBeenCalledWith(
        expect.objectContaining({ state: "visible" }),
      );
    });

    it("waits for hidden state when visible: false", async () => {
      await runStepSimple(page, {
        action: "assertVisible",
        selector: { strategy: "testId", value: "spinner" },
        visible: false,
      });
      expect(locatorMock.waitFor).toHaveBeenCalledWith(
        expect.objectContaining({ state: "hidden" }),
      );
    });

    it("wraps the Playwright waitFor error with a descriptive message", async () => {
      locatorMock.waitFor.mockRejectedValueOnce(new Error("Timeout 5000ms exceeded"));
      await expect(
        runStepSimple(page, {
          action: "assertVisible",
          selector: { strategy: "id", value: "missing" },
        }),
      ).rejects.toThrow(/assertVisible failed.*expected visible.*Timeout/);
    });
  });

  describe("assertUrl", () => {
    it("passes when URL contains the expected substring (exact: false)", async () => {
      (page.url as ReturnType<typeof vi.fn>).mockReturnValue("https://app/tenants/abc/templates");
      await runStepSimple(page, {
        action: "assertUrl",
        url: "/templates",
        exact: false,
      });
    });

    it("passes on regex match", async () => {
      (page.url as ReturnType<typeof vi.fn>).mockReturnValue("https://app/tenants/abc-123/home");
      await runStepSimple(page, {
        action: "assertUrl",
        url: /tenants\/abc-\d+\/home/,
      });
    });

    it("fails when URL doesn't match within timeout", async () => {
      (page.url as ReturnType<typeof vi.fn>).mockReturnValue("https://app/wrong-page");
      await expect(
        runStepSimple(page, {
          action: "assertUrl",
          url: "https://app/expected",
          timeoutMs: 200,
        }),
      ).rejects.toThrow(/assertUrl failed.*got "https:\/\/app\/wrong-page"/);
    });
  });

  describe("assertCount", () => {
    it("passes when count matches", async () => {
      locatorMock.count.mockResolvedValueOnce(3);
      await runStepSimple(page, {
        action: "assertCount",
        selector: { strategy: "testId", value: "row" },
        count: 3,
      });
    });

    it("retries until count matches within timeout", async () => {
      locatorMock.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1).mockResolvedValueOnce(2);
      await runStepSimple(page, {
        action: "assertCount",
        selector: { strategy: "testId", value: "row" },
        count: 2,
        timeoutMs: 1000,
      });
    });

    it("fails when count never matches within timeout", async () => {
      locatorMock.count.mockResolvedValue(1);
      await expect(
        runStepSimple(page, {
          action: "assertCount",
          selector: { strategy: "testId", value: "row" },
          count: 5,
          timeoutMs: 200,
        }),
      ).rejects.toThrow(/assertCount failed.*expected 5.*got 1/);
    });
  });
});

describe("runSteps", () => {
  let page: Page;

  beforeEach(() => {
    vi.clearAllMocks();
    page = makePage();
  });

  it("runs all steps via runStepSimple", async () => {
    await runSteps(page, [
      { action: "goto", url: "http://example.com/1" },
      { action: "goto", url: "http://example.com/2" },
    ]);
    expect(page.goto).toHaveBeenCalledTimes(2);
  });

  it("skips confirm when paired with next step", async () => {
    await runSteps(page, [
      { action: "click", selector: { strategy: "id", value: "btn" } },
      { action: "confirm", accept: true },
    ]);
    expect(page.goto).not.toHaveBeenCalled();
    expect(pageMock.locator().click).toHaveBeenCalledTimes(1);
  });

  it("does not skip confirm when not followed by confirm step", async () => {
    await runSteps(page, [
      { action: "confirm", accept: true },
      { action: "goto", url: "http://example.com/" },
    ]);
    expect(page.waitForEvent).toHaveBeenCalledWith("dialog", expect.any(Object));
  });

  it("tolerant mode catches errors and continues", async () => {
    page.goto = vi.fn().mockRejectedValueOnce(new Error("fail")).mockResolvedValue(undefined);
    await runSteps(
      page,
      [
        { action: "goto", url: "http://example.com/fail" },
        { action: "goto", url: "http://example.com/ok" },
      ],
      { tolerant: true },
    );
    expect(page.goto).toHaveBeenCalledTimes(2);
  });

  it("tolerant mode skips confirm when paired", async () => {
    await runSteps(
      page,
      [
        { action: "click", selector: { strategy: "id", value: "btn" } },
        { action: "confirm", accept: true },
      ],
      { tolerant: true },
    );
    expect(pageMock.locator().click).toHaveBeenCalledTimes(1);
  });

  it("verbose mode logs each step", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runSteps(page, [{ action: "goto", url: "http://example.com/" }], { verbose: true });
    expect(spy).toHaveBeenCalledWith("  ↳ step 1/1: goto http://example.com/");
    spy.mockRestore();
  });

  it("verbose mode logs skipped steps on error", async () => {
    page.goto = vi.fn().mockRejectedValue(new Error("fail"));
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runSteps(page, [{ action: "goto", url: "http://example.com/" }], {
      tolerant: true,
      verbose: true,
    });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("skipped"));
    spy.mockRestore();
  });

  it("uses label in verbose mode", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runSteps(page, [{ action: "goto", url: "http://example.com/" }], {
      verbose: true,
      label: "pre",
    });
    expect(spy).toHaveBeenCalledWith("  ↳ pre step 1/1: goto http://example.com/");
    spy.mockRestore();
  });
});

describe("runScenarioForTest", () => {
  let page: Page;

  beforeEach(() => {
    vi.clearAllMocks();
    page = makePage();
  });

  it("executes top-level steps", async () => {
    await runScenarioForTest(
      page,
      baseTestConfig({
        steps: [
          { action: "goto", url: "http://example.com/a" },
          { action: "goto", url: "http://example.com/b" },
        ],
      }),
    );
    expect(page.goto).toHaveBeenCalledTimes(2);
    expect(page.goto).toHaveBeenNthCalledWith(1, "http://example.com/a", undefined);
    expect(page.goto).toHaveBeenNthCalledWith(2, "http://example.com/b", undefined);
  });

  it("runs setup steps before main steps", async () => {
    const calls: string[] = [];
    page.goto = vi.fn().mockImplementation(async (url: string) => {
      calls.push(url);
    });
    await runScenarioForTest(
      page,
      baseTestConfig({
        setup: [{ action: "goto", url: "http://example.com/setup" }],
        steps: [{ action: "goto", url: "http://example.com/main" }],
      }),
    );
    expect(calls).toEqual(["http://example.com/setup", "http://example.com/main"]);
  });

  it("runs cleanup steps after main steps in tolerant mode", async () => {
    const calls: string[] = [];
    page.goto = vi.fn().mockImplementation(async (url: string) => {
      calls.push(url);
      if (url.includes("cleanup")) throw new Error("cleanup boom");
    });
    await runScenarioForTest(
      page,
      baseTestConfig({
        steps: [{ action: "goto", url: "http://example.com/main" }],
        cleanup: [{ action: "goto", url: "http://example.com/cleanup" }],
      }),
    );
    expect(calls).toEqual(["http://example.com/main", "http://example.com/cleanup"]);
  });

  it("throws if a main step fails", async () => {
    page.goto = vi.fn().mockRejectedValueOnce(new Error("nav failed"));
    await expect(
      runScenarioForTest(
        page,
        baseTestConfig({
          steps: [{ action: "goto", url: "http://example.com/" }],
        }),
      ),
    ).rejects.toThrow("nav failed");
  });

  it("skips cleanup when skipCleanup is true", async () => {
    const cleanupSpy = vi.fn().mockResolvedValue(undefined);
    page.waitForTimeout = vi.fn().mockImplementation(async () => {
      cleanupSpy();
    });
    await runScenarioForTest(
      page,
      baseTestConfig({
        steps: [{ action: "goto", url: "http://example.com/" }],
        cleanup: [{ action: "wait", ms: 1 }],
      }),
      { skipCleanup: true },
    );
    expect(cleanupSpy).not.toHaveBeenCalled();
  });

  it("runs auth login steps when runAuth is true", async () => {
    await runScenarioForTest(
      page,
      baseTestConfig({
        auth: {
          loginSteps: [{ action: "goto", url: "http://example.com/login" }],
          validate: {
            protectedUrl: "http://example.com/home",
            successIndicator: { strategy: "id", value: "ok" },
          },
          storage: { name: "test", types: ["cookies"] },
        },
        steps: [{ action: "goto", url: "http://example.com/home" }],
      }),
      { runAuth: true },
    );
    expect(page.goto).toHaveBeenCalledTimes(2);
    expect(page.goto).toHaveBeenNthCalledWith(1, "http://example.com/login", undefined);
  });

  it("skips auth login steps when runAuth is omitted", async () => {
    await runScenarioForTest(
      page,
      baseTestConfig({
        auth: {
          loginSteps: [{ action: "goto", url: "http://example.com/login" }],
          validate: {
            protectedUrl: "http://example.com/home",
            successIndicator: { strategy: "id", value: "ok" },
          },
          storage: { name: "test", types: ["cookies"] },
        },
        steps: [{ action: "goto", url: "http://example.com/home" }],
      }),
    );
    expect(page.goto).toHaveBeenCalledTimes(1);
    expect(page.goto).toHaveBeenCalledWith("http://example.com/home", undefined);
  });
});
