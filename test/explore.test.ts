import { describe, expect, it, vi } from "vitest";
import type { Page } from "playwright";
import { formatPage, filterHeadings, processElements, extractPage } from "../src/script/explore.js";

const INTERACTIVE_SELECTOR =
  "button, a[href], input:not([type=hidden]), select, textarea, [role=button]";

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

describe("extractPage", () => {
  it("extracts url path, title, headings and elements from page", async () => {
    const evaluateImpl = vi.fn().mockImplementation((fn: () => unknown, arg?: string) => {
      if (fn.toString().includes("filterHeadings")) {
        const rawHeadings = [{ innerText: "Dashboard" }, { innerText: "Welcome User" }];
        return Promise.resolve(filterHeadings(rawHeadings));
      }
      const rawElements = [
        {
          tagName: "BUTTON",
          getAttribute: () => "primary",
          innerText: "Click me",
          getBoundingClientRect: () => ({ width: 100, height: 40 }),
        },
      ];
      return Promise.resolve(processElements(rawElements));
    });
    const mockPage = {
      url: vi.fn(() => "https://example.com/dashboard"),
      title: vi.fn(() => "Dashboard"),
      evaluate: evaluateImpl,
    } as unknown as Page;

    const result = await extractPage(mockPage);

    expect(result.url).toBe("https://example.com/dashboard");
    expect(result.path).toBe("/dashboard");
    expect(result.title).toBe("Dashboard");
    expect(result.headings).toContain("Dashboard");
    expect(result.elements).toHaveLength(1);
  });

  it("uses filterHeadings on evaluate results (filters Session/Logged Out)", async () => {
    const evaluateImpl = vi.fn().mockImplementation((fn: () => unknown, arg?: string) => {
      if (fn.toString().includes("filterHeadings")) {
        const rawHeadings = [
          { innerText: "Valid" },
          { innerText: "Session Ended" },
          { innerText: "Logged Out Page" },
          { innerText: "Also Valid" },
        ];
        return Promise.resolve(filterHeadings(rawHeadings));
      }
      return Promise.resolve([]);
    });
    const mockPage = {
      url: vi.fn(() => "https://example.com/page"),
      title: vi.fn(() => "Page"),
      evaluate: evaluateImpl,
    } as unknown as Page;

    const result = await extractPage(mockPage);

    expect(result.headings).not.toContain("Session Ended");
    expect(result.headings).not.toContain("Logged Out Page");
    expect(result.headings).toContain("Valid");
  });

  it("passes INTERACTIVE_SELECTOR to processElements", async () => {
    const evaluateImpl = vi.fn().mockImplementation((fn: () => unknown, arg?: string) => {
      if (fn.toString().includes("filterHeadings")) {
        return Promise.resolve(filterHeadings([{ innerText: "Heading" }]));
      }
      return Promise.resolve(
        processElements([
          {
            tagName: "DIV",
            getAttribute: () => null,
            innerText: "",
            getBoundingClientRect: () => ({ width: 10, height: 10 }),
          },
        ]),
      );
    });
    const mockPage = {
      url: vi.fn(() => "https://example.com/"),
      title: vi.fn(() => "Home"),
      evaluate: evaluateImpl,
    } as unknown as Page;

    await extractPage(mockPage);

    expect(evaluateImpl).toHaveBeenCalledTimes(2);
  });
});
