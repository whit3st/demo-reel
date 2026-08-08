import { describe, expect, it, vi } from "vitest";
import type { Page } from "playwright";
import { formatPage, filterHeadings, processElements, extractPage } from "../src/script/explore.js";

describe("filterHeadings", () => {
  const makeHeading = (text: string) => ({ innerText: text });

  it("returns trimmed heading text", () => {
    const input = [makeHeading("  Welcome  ")];
    expect(filterHeadings(input)).toEqual(["Welcome"]);
  });

  it("filters out empty headings", () => {
    const input = [makeHeading(""), makeHeading("Valid")];
    expect(filterHeadings(input)).toEqual(["Valid"]);
  });

  it("filters out headings containing Session", () => {
    const input = [makeHeading("Welcome"), makeHeading("Session Ended")];
    expect(filterHeadings(input)).not.toContain("Session Ended");
  });

  it("filters out headings containing Logged Out", () => {
    const input = [makeHeading("Page"), makeHeading("Logged Out Page")];
    expect(filterHeadings(input)).not.toContain("Logged Out Page");
  });

  it("limits to 15 headings", () => {
    const input = Array.from({ length: 20 }, (_, i) => makeHeading(`Heading ${i}`));
    const result = filterHeadings(input);
    expect(result).toHaveLength(15);
    expect(result[14]).toBe("Heading 14");
  });

  it("handles empty array", () => {
    expect(filterHeadings([])).toEqual([]);
  });
});

describe("processElements", () => {
  const makeEl = (
    attrs: Record<string, string | null>,
    rect = { width: 100, height: 40 },
    innerText = "",
  ) => ({
    tagName: attrs.tag || "div",
    getAttribute: (name: string) => attrs[name] ?? null,
    innerText,
    getBoundingClientRect: () => rect,
  });

  it("extracts basic attributes", () => {
    const input = [
      makeEl(
        {
          tag: "button",
          type: "submit",
          id: "btn",
          "data-testid": "test",
          name: "nm",
          placeholder: "ph",
          class: "cls1 cls2",
        },
        { width: 50, height: 20 },
        "Click me",
      ),
    ];
    const result = processElements(input);
    expect(result[0]).toMatchObject({
      tag: "button",
      type: "submit",
      id: "btn",
      testId: "test",
      name: "nm",
      placeholder: "ph",
    });
  });

  it("filters out zero-dimension elements", () => {
    const input = [
      makeEl({ tag: "button" }, { width: 100, height: 40 }),
      makeEl({ tag: "div" }, { width: 0, height: 0 }),
      makeEl({ tag: "span" }, { width: 0, height: 10 }),
    ];
    expect(processElements(input)).toHaveLength(1);
  });

  it("filters classes to length > 2", () => {
    const input = [makeEl({ tag: "div", class: "a bc defg hi" })];
    expect(processElements(input)[0].classes).toBe("defg");
  });

  it("limits classes to 4 entries", () => {
    const input = [makeEl({ tag: "div", class: "a b c d e f g" })];
    const classes = processElements(input)[0].classes.split(" ");
    expect(classes.length).toBeLessThanOrEqual(4);
  });

  it("uses aria-label as text", () => {
    const input = [
      makeEl(
        { tag: "button", "aria-label": "Close dialog" },
        { width: 50, height: 20 },
        "inner text",
      ),
    ];
    expect(processElements(input)[0].text).toBe("Close dialog");
  });

  it("falls back to innerText when no aria-label", () => {
    const input = [makeEl({ tag: "button" }, { width: 50, height: 20 }, "Submit Form")];
    expect(processElements(input)[0].text).toBe("Submit Form");
  });

  it("limits text to 80 characters", () => {
    const longText = "A".repeat(150);
    const input = [makeEl({ tag: "button" }, { width: 50, height: 20 }, longText)];
    expect(processElements(input)[0].text.length).toBeLessThanOrEqual(80);
  });

  it("normalizes whitespace in text", () => {
    const input = [makeEl({ tag: "button" }, { width: 50, height: 20 }, "Hello    World\n  Foo ")];
    expect(processElements(input)[0].text).toBe("Hello World Foo");
  });

  it("returns empty string for href when null", () => {
    const input = [makeEl({ tag: "div" }, { width: 50, height: 20 })];
    expect(processElements(input)[0].href).toBeNull();
  });

  it("handles multiple elements", () => {
    const input = [
      makeEl({ tag: "input", type: "email", id: "email" }, { width: 200, height: 40 }),
      makeEl({ tag: "a", href: "/about" }, { width: 100, height: 20 }),
    ];
    const result = processElements(input);
    expect(result).toHaveLength(2);
    expect(result[0].tag).toBe("input");
    expect(result[1].tag).toBe("a");
  });
});

describe("formatPage", () => {
  it("formats page with path and title", () => {
    const page = {
      url: "http://example.com/",
      path: "/",
      title: "Home",
      headings: [],
      elements: [],
    };
    const output = formatPage(page);
    expect(output).toContain("### /");
    expect(output).toContain("Title: Home");
  });

  it("includes headings when present", () => {
    const page = {
      url: "http://example.com/",
      path: "/",
      title: "Home",
      headings: ["Welcome", "Features"],
      elements: [],
    };
    const output = formatPage(page);
    expect(output).toContain("Headings: Welcome | Features");
  });

  it("omits headings section when empty", () => {
    const page = {
      url: "http://example.com/",
      path: "/",
      title: "Home",
      headings: [],
      elements: [],
    };
    const output = formatPage(page);
    expect(output).not.toContain("Headings:");
  });

  it("formats input with testId", () => {
    const page = {
      url: "http://example.com/login",
      path: "/login",
      title: "Login",
      headings: [],
      elements: [
        {
          tag: "input",
          type: "text",
          id: null,
          testId: "username-field",
          name: null,
          placeholder: null,
          classes: "",
          text: "",
          href: null,
        },
      ],
    };
    const output = formatPage(page);
    expect(output).toContain("Form elements:");
    expect(output).toContain('testId="username-field"');
    expect(output).toContain('<input type="text">');
  });

  it("formats input with id when no testId", () => {
    const page = {
      url: "http://example.com/login",
      path: "/login",
      title: "Login",
      headings: [],
      elements: [
        {
          tag: "input",
          type: "password",
          id: "password-input",
          testId: null,
          name: null,
          placeholder: null,
          classes: "",
          text: "",
          href: null,
        },
      ],
    };
    const output = formatPage(page);
    expect(output).toContain('id="password-input"');
  });

  it("formats input with name when no testId or id", () => {
    const page = {
      url: "http://example.com/search",
      path: "/search",
      title: "Search",
      headings: [],
      elements: [
        {
          tag: "input",
          type: "search",
          id: null,
          testId: null,
          name: "query",
          placeholder: null,
          classes: "",
          text: "",
          href: null,
        },
      ],
    };
    const output = formatPage(page);
    expect(output).toContain('name="query"');
  });

  it("shows placeholder text as fallback", () => {
    const page = {
      url: "http://example.com/form",
      path: "/form",
      title: "Form",
      headings: [],
      elements: [
        {
          tag: "input",
          type: "text",
          id: null,
          testId: null,
          name: null,
          placeholder: "Enter your name",
          classes: "",
          text: "",
          href: null,
        },
      ],
    };
    const output = formatPage(page);
    expect(output).toContain('"Enter your name"');
  });

  it("omits form section when no inputs", () => {
    const page = {
      url: "http://example.com/about",
      path: "/about",
      title: "About",
      headings: ["About Us"],
      elements: [],
    };
    const output = formatPage(page);
    expect(output).not.toContain("Form elements:");
  });

  it("formats external links as buttons", () => {
    const page = {
      url: "http://example.com/cta",
      path: "/cta",
      title: "CTA",
      headings: [],
      elements: [
        {
          tag: "a",
          type: null,
          id: null,
          testId: null,
          name: null,
          placeholder: null,
          classes: "btn-primary",
          text: "Sign Up Now",
          href: "https://external.com/signup",
        },
      ],
    };
    const output = formatPage(page);
    expect(output).toContain("Buttons:");
    expect(output).toContain("Sign Up Now");
  });

  it("omits buttons section when no external links", () => {
    const page = {
      url: "http://example.com/page",
      path: "/page",
      title: "Page",
      headings: [],
      elements: [
        {
          tag: "a",
          type: null,
          id: null,
          testId: null,
          name: null,
          placeholder: null,
          classes: "",
          text: "Internal Link",
          href: "/other-page",
        },
      ],
    };
    const output = formatPage(page);
    expect(output).not.toContain("Buttons:");
  });

  it("formats nav links with href and text", () => {
    const page = {
      url: "http://example.com/app",
      path: "/app",
      title: "App",
      headings: [],
      elements: [
        {
          tag: "a",
          type: null,
          id: null,
          testId: null,
          name: null,
          placeholder: null,
          classes: "",
          text: "Dashboard",
          href: "/dashboard",
        },
        {
          tag: "a",
          type: null,
          id: null,
          testId: null,
          name: null,
          placeholder: null,
          classes: "",
          text: "Settings",
          href: "/settings",
        },
      ],
    };
    const output = formatPage(page);
    expect(output).toContain("Links:");
    expect(output).toContain('"Dashboard" → /dashboard');
    expect(output).toContain('"Settings" → /settings');
  });

  it("shows both links when duplicate text but different hrefs", () => {
    const page = {
      url: "http://example.com/app",
      path: "/app",
      title: "App",
      headings: [],
      elements: [
        {
          tag: "a",
          type: null,
          id: null,
          testId: null,
          name: null,
          placeholder: null,
          classes: "",
          text: "Dashboard",
          href: "/dashboard",
        },
        {
          tag: "a",
          type: null,
          id: null,
          testId: null,
          name: null,
          placeholder: null,
          classes: "",
          text: "Dashboard",
          href: "/dashboard2",
        },
      ],
    };
    const output = formatPage(page);
    expect(output).toContain('"Dashboard" → /dashboard');
    expect(output).toContain('"Dashboard" → /dashboard2');
  });

  it("omits links section when no nav links", () => {
    const page = {
      url: "http://example.com/page",
      path: "/page",
      title: "Page",
      headings: [],
      elements: [
        {
          tag: "a",
          type: null,
          id: null,
          testId: null,
          name: null,
          placeholder: null,
          classes: "",
          text: "Click here",
          href: "https://external.com",
        },
      ],
    };
    const output = formatPage(page);
    expect(output).not.toContain("Links:");
  });

  it("ends with newline", () => {
    const page = {
      url: "http://example.com/",
      path: "/",
      title: "Home",
      headings: [],
      elements: [],
    };
    const output = formatPage(page);
    expect(output.endsWith("\n")).toBe(true);
  });
});

/**
 * These used to stub page.evaluate by stringifying the callback and calling the
 * Node implementations, which hid a real bug: the callbacks referenced
 * filterHeadings/processElements, module-scope functions that do not exist in
 * the browser realm, so every real run threw a ReferenceError.
 *
 * page.evaluate now returns plain serialisable DOM data and the filtering
 * happens in Node, so these stubs return raw data and assert the wiring.
 * The end-to-end behaviour is covered against real Chromium in
 * test/explore-extract.browser.test.ts.
 */
describe("extractPage", () => {
  const rawHeading = (innerText: string) => ({ innerText });

  // `attributes` is merged after the spread, so an override can set individual
  // attributes without dropping the defaults.
  const rawElement = (overrides: Record<string, unknown> = {}) => ({
    tagName: "BUTTON",
    innerText: "Click me",
    rect: { width: 100, height: 40 },
    ...overrides,
    attributes: { class: "primary", ...(overrides.attributes as object) },
  });

  const mockPageReturning = (headings: unknown[], elements: unknown[]) => {
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce(headings)
      .mockResolvedValueOnce(elements) as unknown;
    return {
      page: {
        url: vi.fn(() => "https://example.com/dashboard"),
        title: vi.fn(() => "Dashboard"),
        evaluate,
      } as unknown as Page,
      evaluate: evaluate as ReturnType<typeof vi.fn>,
    };
  };

  it("extracts url path, title, headings and elements from page", async () => {
    const { page } = mockPageReturning(
      [rawHeading("Dashboard"), rawHeading("Welcome User")],
      [rawElement()],
    );

    const result = await extractPage(page);

    expect(result.url).toBe("https://example.com/dashboard");
    expect(result.path).toBe("/dashboard");
    expect(result.title).toBe("Dashboard");
    expect(result.headings).toContain("Dashboard");
    expect(result.elements).toHaveLength(1);
    expect(result.elements[0]).toMatchObject({ tag: "button", text: "Click me" });
  });

  it("applies filterHeadings in Node to the raw headings from the page", async () => {
    const { page } = mockPageReturning(
      [
        rawHeading("Valid"),
        rawHeading("Session Ended"),
        rawHeading("Logged Out Page"),
        rawHeading("Also Valid"),
      ],
      [],
    );

    const result = await extractPage(page);

    expect(result.headings).toEqual(["Valid", "Also Valid"]);
  });

  it("applies processElements in Node, dropping zero-size elements", async () => {
    const { page } = mockPageReturning(
      [],
      [rawElement(), rawElement({ rect: { width: 0, height: 0 }, innerText: "Invisible" })],
    );

    const result = await extractPage(page);

    expect(result.elements).toHaveLength(1);
    expect(result.elements[0].text).toBe("Click me");
  });

  it("evaluates once for headings and once for interactive elements", async () => {
    const { page, evaluate } = mockPageReturning([], []);

    await extractPage(page);

    expect(evaluate).toHaveBeenCalledTimes(2);
    // The element query is parameterised by the interactive selector.
    expect(evaluate.mock.calls[1][1]).toContain("button");
  });

  // The callbacks are serialised and run in the browser, so they must not close
  // over anything from this module — that is precisely what broke before.
  it("passes browser callbacks that reference no Node-scope helpers", async () => {
    const { page, evaluate } = mockPageReturning([], []);

    await extractPage(page);

    for (const call of evaluate.mock.calls) {
      const source = String(call[0]);
      expect(source).not.toContain("filterHeadings");
      expect(source).not.toContain("processElements");
    }
  });
});
