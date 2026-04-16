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

import { runStepSimple, runSteps } from "../src/runner.js";
import type { Page } from "playwright";

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
