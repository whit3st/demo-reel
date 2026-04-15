import { beforeEach, describe, expect, it, vi } from "vitest";

const { launchMock, pageMock, contextMock, browserMock } = vi.hoisted(() => {
  const pageMock = {
    waitForLoadState: vi.fn(),
    title: vi.fn(() => "Test Page"),
    url: vi.fn(() => "http://example.com/page"),
    evaluate: vi.fn(),
    $$: vi.fn(),
    goto: vi.fn(),
    close: vi.fn(),
  };
  const contextMock = {
    newPage: vi.fn(() => pageMock),
    addCookies: vi.fn(),
    close: vi.fn(),
    setDefaultTimeout: vi.fn(),
  };
  const browserMock = {
    newContext: vi.fn(() => contextMock),
    close: vi.fn(),
  };
  const launchMock = vi.fn(() => browserMock);
  return { launchMock, pageMock, contextMock, browserMock };
});

vi.mock("playwright", () => ({
  chromium: { launch: launchMock },
}));

import { formatPageContext, crawlPage, crawlUrl, inferRole, buildSelector } from "../src/script/crawler.js";
import type { CrawledPage } from "../src/script/types.js";

describe("inferRole", () => {
  it('returns "link" for <a>', () => {
    expect(inferRole("a", null)).toBe("link");
  });

  it('returns "button" for <button>', () => {
    expect(inferRole("button", null)).toBe("button");
  });

  it('returns "button" for <input type="submit">', () => {
    expect(inferRole("input", "submit")).toBe("button");
  });

  it('returns "button" for <input type="button">', () => {
    expect(inferRole("input", "button")).toBe("button");
  });

  it('returns "select" for <select>', () => {
    expect(inferRole("select", null)).toBe("select");
  });

  it('returns "textarea" for <textarea>', () => {
    expect(inferRole("textarea", null)).toBe("textarea");
  });

  it('returns "checkbox" for type="checkbox"', () => {
    expect(inferRole("input", "checkbox")).toBe("checkbox");
  });

  it('returns "radio" for type="radio"', () => {
    expect(inferRole("input", "radio")).toBe("radio");
  });

  it('returns "input" for <input> with unknown type', () => {
    expect(inferRole("input", "text")).toBe("input");
  });

  it('returns "input" for <input> with null type', () => {
    expect(inferRole("input", null)).toBe("input");
  });

  it('returns "other" for unknown tags', () => {
    expect(inferRole("div", null)).toBe("other");
    expect(inferRole("span", null)).toBe("other");
    expect(inferRole("img", null)).toBe("other");
  });
});

describe("buildSelector", () => {
  it("prefers data-testid over other strategies", () => {
    const result = buildSelector("button", { "data-testid": "my-btn" }, "", 0);
    expect(result).toEqual({ strategy: "testId", value: "my-btn" });
  });

  it("falls back to id when no data-testid", () => {
    const result = buildSelector("div", { id: "my-div" }, "", 0);
    expect(result).toEqual({ strategy: "id", value: "my-div" });
  });

  it("uses href for <a> tags with non-hash href", () => {
    const result = buildSelector("a", { href: "/about" }, "", 0);
    expect(result).toEqual({ strategy: "href", value: "/about" });
  });

  it("does not use href for <a> with href='#'", () => {
    const result = buildSelector("a", { href: "#" }, "", 0);
    expect(result).not.toEqual({ strategy: "href", value: "#" });
  });

  it("uses data-node-id strategy", () => {
    const result = buildSelector("div", { "data-node-id": "node-42" }, "", 0);
    expect(result).toEqual({ strategy: "data-node-id", value: "node-42" });
  });

  it("uses class strategy for single long class", () => {
    const result = buildSelector("button", { class: "my-button" }, "", 0);
    expect(result).toEqual({ strategy: "class", value: "my-button" });
  });

  it("ignores short utility classes", () => {
    const result = buildSelector("div", { class: "abc" }, "", 0);
    expect(result.strategy).not.toBe("class");
  });

  it("ignores multi-class values", () => {
    const result = buildSelector("div", { class: "col span-12 d-flex" }, "", 0);
    expect(result.strategy).not.toBe("class");
  });

  it("uses custom strategy with type attribute", () => {
    const result = buildSelector("input", { type: "email" }, "", 0);
    expect(result).toEqual({ strategy: "custom", value: 'input[type="email"]' });
  });

  it("uses custom strategy with name attribute", () => {
    const result = buildSelector("input", { name: "username" }, "", 0);
    expect(result).toEqual({ strategy: "custom", value: 'input[name="username"]' });
  });

  it("uses custom strategy with placeholder attribute", () => {
    const result = buildSelector("input", { placeholder: "Enter name" }, "", 0);
    expect(result).toEqual({ strategy: "custom", value: 'input[placeholder="Enter name"]' });
  });

  it("uses tag only as last resort", () => {
    const result = buildSelector("span", {}, "", 0);
    expect(result).toEqual({ strategy: "custom", value: "span" });
  });
});

describe("formatPageContext", () => {
  it("formats a page with no headings or elements", () => {
    const page: CrawledPage = {
      url: "http://example.com",
      title: "Example",
      headings: [],
      elements: [],
    };

    const output = formatPageContext(page);
    expect(output).toContain("URL: http://example.com");
    expect(output).toContain("Title: Example");
    expect(output).toContain("Interactive elements (0)");
  });

  it("includes headings when present", () => {
    const page: CrawledPage = {
      url: "http://example.com",
      title: "Example",
      headings: ["Welcome", "About Us"],
      elements: [],
    };

    const output = formatPageContext(page);
    expect(output).toContain("Headings: Welcome | About Us");
  });

  it("formats link elements correctly", () => {
    const page: CrawledPage = {
      url: "http://example.com",
      title: "Example",
      headings: [],
      elements: [
        {
          tag: "a",
          text: "Home",
          selector: { strategy: "href", value: "/" },
          role: "link",
          attributes: { href: "/" },
          boundingBox: { x: 0, y: 0, width: 100, height: 40 },
        },
      ],
    };

    const output = formatPageContext(page);
    expect(output).toContain("[link] <a>");
    expect(output).toContain('href: "/"');
    expect(output).toContain(' — "Home"');
  });

  it("formats button elements with testId", () => {
    const page: CrawledPage = {
      url: "http://example.com",
      title: "Example",
      headings: [],
      elements: [
        {
          tag: "button",
          text: "Submit",
          selector: { strategy: "testId", value: "submit-btn" },
          role: "button",
          attributes: {},
        },
      ],
    };

    const output = formatPageContext(page);
    expect(output).toContain("[button] <button>");
    expect(output).toContain('testId: "submit-btn"');
  });

  it("formats custom selectors", () => {
    const page: CrawledPage = {
      url: "http://example.com",
      title: "Example",
      headings: [],
      elements: [
        {
          tag: "input",
          text: "",
          selector: { strategy: "custom", value: 'input[type="email"]' },
          role: "input",
          attributes: { type: "email" },
        },
      ],
    };

    const output = formatPageContext(page);
    expect(output).toContain("custom:");
    expect(output).toContain('input[type="email"]');
  });

  it("omits text part when element has no text", () => {
    const page: CrawledPage = {
      url: "http://example.com",
      title: "Example",
      headings: [],
      elements: [
        {
          tag: "input",
          text: "",
          selector: { strategy: "id", value: "search" },
          role: "input",
          attributes: {},
        },
      ],
    };

    const output = formatPageContext(page);
    expect(output).not.toContain(" — ");
  });

  it("handles multiple elements", () => {
    const page: CrawledPage = {
      url: "http://example.com",
      title: "Example",
      headings: ["Hello"],
      elements: [
        {
          tag: "a",
          text: "Link1",
          selector: { strategy: "id", value: "link1" },
          role: "link",
          attributes: {},
        },
        {
          tag: "button",
          text: "",
          selector: { strategy: "class", value: "btn" },
          role: "button",
          attributes: {},
        },
      ],
    };

    const output = formatPageContext(page);
    expect(output).toContain("Interactive elements (2)");
    expect(output).toContain("[link]");
    expect(output).toContain("[button]");
  });
});

describe("crawlPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns crawled page data with title and url", async () => {
    pageMock.waitForLoadState.mockResolvedValue(undefined);
    pageMock.title.mockReturnValue("My Page");
    pageMock.url.mockReturnValue("http://example.com/my-page");
    pageMock.evaluate.mockResolvedValue(["Heading One", "Heading Two"]);
    pageMock.$$.mockResolvedValue([]);

    const result = await crawlPage(pageMock as any);

    expect(result.url).toBe("http://example.com/my-page");
    expect(result.title).toBe("My Page");
    expect(result.headings).toEqual(["Heading One", "Heading Two"]);
    expect(result.elements).toEqual([]);
  });

  it("handles empty headings", async () => {
    pageMock.waitForLoadState.mockResolvedValue(undefined);
    pageMock.title.mockReturnValue("Empty");
    pageMock.url.mockReturnValue("http://example.com");
    pageMock.evaluate.mockResolvedValue([]);
    pageMock.$$.mockResolvedValue([]);

    const result = await crawlPage(pageMock as any);
    expect(result.headings).toEqual([]);
  });

  it("handles waitForLoadState throwing", async () => {
    pageMock.waitForLoadState.mockRejectedValue(new Error("timeout"));
    pageMock.title.mockReturnValue("Page");
    pageMock.url.mockReturnValue("http://example.com");
    pageMock.evaluate.mockResolvedValue([]);
    pageMock.$$.mockResolvedValue([]);

    const result = await crawlPage(pageMock as any);
    expect(result.title).toBe("Page");
  });
});

describe("crawlUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("launches browser and crawls page", async () => {
    pageMock.waitForLoadState.mockResolvedValue(undefined);
    pageMock.title.mockReturnValue("Landed");
    pageMock.url.mockReturnValue("http://example.com");
    pageMock.evaluate.mockResolvedValue([]);
    pageMock.$$.mockResolvedValue([]);
    pageMock.goto.mockResolvedValue({} as any);

    const result = await crawlUrl("http://example.com");

    expect(launchMock).toHaveBeenCalledWith({ headless: true });
    expect(browserMock.newContext).toHaveBeenCalled();
    expect(contextMock.newPage).toHaveBeenCalled();
    expect(result.title).toBe("Landed");
    expect(contextMock.close).toHaveBeenCalled();
    expect(browserMock.close).toHaveBeenCalled();
  });

  it("passes headed option to chromium", async () => {
    pageMock.waitForLoadState.mockResolvedValue(undefined);
    pageMock.title.mockReturnValue("Headed");
    pageMock.url.mockReturnValue("http://example.com");
    pageMock.evaluate.mockResolvedValue([]);
    pageMock.$$.mockResolvedValue([]);
    pageMock.goto.mockResolvedValue({} as any);

    await crawlUrl("http://example.com", { headed: true });

    expect(launchMock).toHaveBeenCalledWith({ headless: false });
  });

  it("adds cookies before navigation", async () => {
    pageMock.waitForLoadState.mockResolvedValue(undefined);
    pageMock.title.mockReturnValue("With Cookies");
    pageMock.url.mockReturnValue("http://example.com");
    pageMock.evaluate.mockResolvedValue([]);
    pageMock.$$.mockResolvedValue([]);
    pageMock.goto.mockResolvedValue({} as any);

    const cookies = [{ name: "sid", value: "abc123", domain: "example.com", path: "/" }];
    await crawlUrl("http://example.com", { cookies });

    expect(contextMock.addCookies).toHaveBeenCalledWith(cookies);
  });

  it("retries with load after networkidle timeout", async () => {
    pageMock.waitForLoadState.mockResolvedValue(undefined);
    pageMock.title.mockReturnValue("Loaded");
    pageMock.url.mockReturnValue("http://example.com");
    pageMock.evaluate.mockResolvedValue([]);
    pageMock.$$.mockResolvedValue([]);
    pageMock.goto
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({} as any);

    const result = await crawlUrl("http://example.com");

    expect(pageMock.goto).toHaveBeenCalledTimes(2);
    expect(result.title).toBe("Loaded");
  });

  it("closes browser and context even on error", async () => {
    pageMock.goto.mockRejectedValue(new Error("fail"));
    contextMock.close.mockResolvedValue(undefined);
    browserMock.close.mockResolvedValue(undefined);

    await expect(crawlUrl("http://example.com")).rejects.toThrow();
    expect(contextMock.close).toHaveBeenCalled();
    expect(browserMock.close).toHaveBeenCalled();
  });
});
