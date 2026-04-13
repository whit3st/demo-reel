import { describe, expect, it } from "vitest";
import { synchronizeTiming } from "../src/script/timing.js";
import type { DemoScript, TimedScene } from "../src/script/types.js";

function createScript(overrides: Partial<DemoScript> = {}): DemoScript {
  return {
    title: "Create Template",
    description: "Create a template in the app",
    url: "https://example.com",
    scenes: [
      {
        narration: "Open the template page and create a new item.",
        steps: [
          { action: "goto", url: "https://example.com/templates" },
          {
            action: "click",
            selector: { strategy: "testId", value: "create-template" },
          },
          {
            action: "type",
            selector: { strategy: "id", value: "name" },
            text: "Invoice",
          },
        ],
      },
    ],
    ...overrides,
  };
}

function createTimedScene(overrides: Partial<TimedScene> = {}): TimedScene {
  return {
    narration: "Open the template page and create a new item.",
    steps: [{ action: "wait", ms: 1 }],
    audioDurationMs: 5000,
    audioOffsetMs: 1000,
    gapAfterMs: 700,
    ...overrides,
  };
}

describe("script timing", () => {
  it("adds delays to goto, click, and type steps to fit the narration duration", () => {
    const script = createScript();
    const timedScenes = [
      createTimedScene({ audioDurationMs: 5000, audioOffsetMs: 0, gapAfterMs: 400 }),
    ];

    const result = synchronizeTiming(script, timedScenes, "./narration.mp3");
    const [gotoStep, clickStep, typeStep] = result.scenes[0].steps;

    expect(gotoStep).toMatchObject({ action: "goto", delayAfterMs: 633 });
    expect(clickStep).toMatchObject({ action: "click", delayAfterMs: 633 });
    expect(typeStep).toMatchObject({ action: "type", delayBeforeMs: 633 });
    expect(result.totalDurationMs).toBe(5400);
    expect(result.audioPath).toBe("./narration.mp3");
  });

  it("distributes delay across all steps when no preferred insertion points exist", () => {
    const script = createScript({
      scenes: [
        {
          narration: "Wait for the banner and keep the checkbox enabled.",
          steps: [
            {
              action: "waitFor",
              kind: "selector",
              selector: { strategy: "class", value: "banner" },
              state: "visible",
            },
            {
              action: "check",
              selector: { strategy: "id", value: "enabled" },
              checked: true,
            },
          ],
        },
      ],
    });
    const timedScenes = [
      createTimedScene({ audioDurationMs: 3000, audioOffsetMs: 0, gapAfterMs: 0 }),
    ];

    const result = synchronizeTiming(script, timedScenes, "./narration.mp3");

    expect(result.scenes[0].steps).toEqual([
      {
        action: "waitFor",
        kind: "selector",
        selector: { strategy: "class", value: "banner" },
        state: "visible",
        delayAfterMs: 1250,
      },
      {
        action: "check",
        selector: { strategy: "id", value: "enabled" },
        checked: true,
        delayAfterMs: 1250,
      },
    ]);
  });

  it("leaves steps unchanged when they already take longer than the audio window", () => {
    const script = createScript({
      scenes: [
        {
          narration: "Type a long identifier.",
          steps: [
            {
              action: "type",
              selector: { strategy: "id", value: "slug" },
              text: "x".repeat(40),
              delayBeforeMs: 100,
            },
          ],
        },
      ],
    });
    const timedScenes = [
      createTimedScene({ audioDurationMs: 1000, audioOffsetMs: 250, gapAfterMs: 50 }),
    ];

    const result = synchronizeTiming(script, timedScenes, "./narration.mp3");

    expect(result.scenes[0].steps).toEqual(script.scenes[0].steps);
    expect(result.totalDurationMs).toBe(1300);
  });

  it("preserves emphasis and timed scene metadata", () => {
    const script = createScript({
      scenes: [
        {
          narration: "Focus on the success state.",
          emphasis: "Highlight the success banner",
          steps: [{ action: "wait", ms: 1000 }],
        },
      ],
    });
    const timedScenes = [
      createTimedScene({
        narration: "Focus on the success state.",
        audioDurationMs: 1200,
        audioOffsetMs: 600,
        gapAfterMs: 200,
      }),
    ];

    const result = synchronizeTiming(script, timedScenes, "./narration.mp3");

    expect(result.scenes[0]).toMatchObject({
      narration: "Focus on the success state.",
      emphasis: "Highlight the success banner",
      audioDurationMs: 1200,
      audioOffsetMs: 600,
      gapAfterMs: 200,
    });
  });

  it("throws when timed scene data is missing", () => {
    const script = createScript({
      scenes: [
        createScript().scenes[0],
        {
          narration: "Second scene",
          steps: [{ action: "wait", ms: 500 }],
        },
      ],
    });

    expect(() => synchronizeTiming(script, [createTimedScene()], "./narration.mp3")).toThrow(
      "Missing timed scene data for scene 2",
    );
  });

  it("estimates duration for all step types including press, scroll, drag, select, upload, hover", () => {
    const script = createScript({
      scenes: [
        {
          narration: "Perform various actions.",
          steps: [
            { action: "goto", url: "https://example.com" },
            { action: "hover", selector: { strategy: "id", value: "menu" } },
            { action: "press", selector: { strategy: "id", value: "input" }, key: "Enter" },
            { action: "scroll", selector: { strategy: "window", value: "" }, x: 0, y: 100 },
            { action: "select", selector: { strategy: "id", value: "dropdown" }, value: "option1" },
            { action: "upload", selector: { strategy: "id", value: "file" }, filePath: "/tmp/file.txt" },
            { action: "drag", source: { strategy: "id", value: "item1" }, target: { strategy: "id", value: "zone" } },
            { action: "wait", ms: 500 },
          ],
        },
      ],
    });
    const timedScenes = [
      createTimedScene({ audioDurationMs: 10000, audioOffsetMs: 0, gapAfterMs: 500 }),
    ];

    const result = synchronizeTiming(script, timedScenes, "./narration.mp3");

    expect(result.scenes[0].steps.length).toBe(8);
    expect(result.totalDurationMs).toBe(10500);
  });

  it("estimates duration for unknown step actions using default", () => {
    const script = createScript({
      scenes: [
        {
          narration: "Unknown action.",
          steps: [
            { action: "unknown" } as unknown as { action: "goto"; url: string },
          ],
        },
      ],
    });
    const timedScenes = [
      createTimedScene({ audioDurationMs: 3000, audioOffsetMs: 0, gapAfterMs: 0 }),
    ];

    const result = synchronizeTiming(script, timedScenes, "./narration.mp3");

    expect(result.scenes[0].steps.length).toBe(1);
  });

  it("handles empty steps array without errors", () => {
    const script = createScript({
      scenes: [
        {
          narration: "No steps.",
          steps: [],
        },
      ],
    });
    const timedScenes = [
      createTimedScene({ audioDurationMs: 2000, audioOffsetMs: 0, gapAfterMs: 300 }),
    ];

    const result = synchronizeTiming(script, timedScenes, "./narration.mp3");

    expect(result.scenes[0].steps).toEqual([]);
    expect(result.totalDurationMs).toBe(2300);
  });

  it("handles steps with explicit zero delays", () => {
    const script = createScript({
      scenes: [
        {
          narration: "Zero delay.",
          steps: [
            { action: "wait", ms: 100, delayBeforeMs: 0, delayAfterMs: 0 },
          ],
        },
      ],
    });
    const timedScenes = [
      createTimedScene({ audioDurationMs: 1000, audioOffsetMs: 0, gapAfterMs: 0 }),
    ];

    const result = synchronizeTiming(script, timedScenes, "./narration.mp3");

    expect(result.scenes[0].steps[0]).toMatchObject({
      action: "wait",
      delayBeforeMs: 0,
      delayAfterMs: 1200,
    });
  });
});
