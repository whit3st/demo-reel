import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/script/crawler.js", () => ({
  crawlUrl: vi.fn(),
  formatPageContext: vi.fn(),
}));

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn(),
  },
}));

vi.mock("../src/runner.js", () => ({
  runStepSimple: vi.fn(),
}));

const anthropicCreate = vi.fn();
const anthropicConstructor = vi.fn(
  function AnthropicMock(this: { messages: { create: typeof anthropicCreate } }) {
    this.messages = {
      create: anthropicCreate,
    };
  },
);

vi.mock("@anthropic-ai/sdk", () => ({
  default: anthropicConstructor,
}));

import { crawlUrl, formatPageContext } from "../src/script/crawler.js";
import { chromium } from "playwright";
import { runStepSimple } from "../src/runner.js";

function createScriptResponse(text: string) {
  return {
    content: [{ type: "text", text }],
  };
}

describe("script generator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(crawlUrl).mockResolvedValue({ elements: [{ id: 1 }] } as never);
    vi.mocked(formatPageContext).mockReturnValue("page context");
  });

  it("generates a script from crawled page context and optional hints", async () => {
    anthropicCreate.mockResolvedValue(
      createScriptResponse(`
        {
          "title": "Create Template",
          "scenes": [
            {
              "narration": "Let's create a template.",
              "steps": [{ "action": "goto", "url": "https://example.com/templates" }]
            }
          ]
        }
      `),
    );

    const { generateScript } = await import("../src/script/generator.js");
    const result = await generateScript({
      description: "Show how to create a template",
      url: "https://example.com/templates",
      hints: ["Start from the templates page", "Keep it short"],
      apiKey: "secret-key",
    });

    expect(crawlUrl).toHaveBeenCalledWith("https://example.com/templates", { headed: undefined });
    expect(anthropicConstructor).toHaveBeenCalledWith({ apiKey: "secret-key" });
    expect(anthropicCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining(
          "ONLY use selectors that appear in the crawled DOM context",
        ),
        messages: [
          expect.objectContaining({
            role: "user",
            content: expect.stringContaining(
              "## Hints\n- Start from the templates page\n- Keep it short",
            ),
          }),
        ],
      }),
    );
    expect(result).toEqual({
      title: "Create Template",
      description: "Show how to create a template",
      url: "https://example.com/templates",
      scenes: [
        {
          narration: "Let's create a template.",
          steps: [{ action: "goto", url: "https://example.com/templates" }],
        },
      ],
    });
  });

  it("parses Claude responses wrapped in markdown fences", async () => {
    anthropicCreate.mockResolvedValue(
      createScriptResponse(
        '```json\n{\n  "title": "Wrapped",\n  "scenes": [{ "narration": "Hi", "steps": [{ "action": "wait", "ms": 500 }] }]\n}\n```',
      ),
    );

    const { generateScript } = await import("../src/script/generator.js");
    const result = await generateScript({
      description: "Wrapped response",
      url: "https://example.com",
    });

    expect(result.title).toBe("Wrapped");
    expect(result.scenes[0].steps).toEqual([{ action: "wait", ms: 500 }]);
  });

  it("throws when Claude returns no text blocks", async () => {
    anthropicCreate.mockResolvedValue({ content: [{ type: "tool_use", input: {} }] });

    const { generateScript } = await import("../src/script/generator.js");

    await expect(
      generateScript({
        description: "No text",
        url: "https://example.com",
      }),
    ).rejects.toThrow("Empty response from Claude API");
  });

  it("throws when Claude returns an invalid script shape", async () => {
    anthropicCreate.mockResolvedValue(createScriptResponse('{"title":"Broken","scenes":[]}'));

    const { generateScript } = await import("../src/script/generator.js");

    await expect(
      generateScript({
        description: "Broken",
        url: "https://example.com",
      }),
    ).rejects.toThrow("Invalid script response: missing title or scenes");
  });

  it("validates a script and reports failing steps while closing browser resources", async () => {
    const page = {};
    const closeContext = vi.fn();
    const closeBrowser = vi.fn();
    vi.mocked(chromium.launch).mockResolvedValue({
      newContext: vi.fn().mockResolvedValue({
        newPage: vi.fn().mockResolvedValue(page),
        close: closeContext,
      }),
      close: closeBrowser,
    } as never);
    vi.mocked(runStepSimple)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("missing selector"));

    const { validateScript } = await import("../src/script/generator.js");
    const failures = await validateScript({
      title: "Validate",
      description: "Validate demo",
      url: "https://example.com",
      scenes: [
        {
          narration: "Test scene",
          steps: [
            { action: "wait", ms: 100 },
            { action: "click", selector: { strategy: "id", value: "missing" } },
          ],
        },
      ],
    });

    expect(failures).toEqual([{ scene: 0, step: 1, error: "missing selector" }]);
    expect(closeContext).toHaveBeenCalled();
    expect(closeBrowser).toHaveBeenCalled();
  });

  it("fixes only broken steps by re-crawling and reusing the rest of the script", async () => {
    vi.mocked(crawlUrl).mockResolvedValue({ elements: [{ id: 1 }] } as never);
    anthropicCreate.mockResolvedValue(
      createScriptResponse(`
      {
        "title": "Create Template",
        "scenes": [
          {
            "narration": "Fixed scene",
            "steps": [{ "action": "click", "selector": { "strategy": "id", "value": "create" } }]
          }
        ]
      }
    `),
    );

    const { fixBrokenSteps } = await import("../src/script/generator.js");
    const originalScript = {
      title: "Create Template",
      description: "Create a template",
      url: "https://example.com",
      scenes: [
        {
          narration: "Broken scene narration",
          steps: [{ action: "click", selector: { strategy: "id", value: "broken" } }],
        },
      ],
    };

    const fixed = await fixBrokenSteps(
      originalScript,
      [{ scene: 0, step: 0, error: "selector not found" }],
      { apiKey: "fix-key" },
    );

    expect(crawlUrl).toHaveBeenCalledWith("https://example.com");
    expect(anthropicConstructor).toHaveBeenCalledWith({ apiKey: "fix-key" });
    expect(anthropicCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            content: expect.stringContaining(
              'Scene 1 ("Broken scene narration..."), Step 1 (click): selector not found',
            ),
          }),
        ],
      }),
    );
    expect(fixed).toEqual({
      ...originalScript,
      title: "Create Template",
      scenes: [
        {
          narration: "Fixed scene",
          steps: [{ action: "click", selector: { strategy: "id", value: "create" } }],
        },
      ],
    });
  });

  it("returns the original script when there are no broken steps", async () => {
    const { fixBrokenSteps } = await import("../src/script/generator.js");
    const script = {
      title: "Keep",
      description: "Keep script",
      url: "https://example.com",
      scenes: [{ narration: "Scene", steps: [{ action: "wait", ms: 100 }] }],
    };

    const result = await fixBrokenSteps(script, []);

    expect(result).toBe(script);
    expect(crawlUrl).not.toHaveBeenCalled();
    expect(anthropicCreate).not.toHaveBeenCalled();
  });
});
