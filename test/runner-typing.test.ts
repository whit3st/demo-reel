import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("playwright", () => ({ chromium: { launch: vi.fn() } }));

import { humanType, getTypingDelay } from "../src/runner/typing.js";
import { createFakePage, asPage, type FakePage } from "./helpers/fake-page.js";
import type { TypingConfig } from "../src/schemas.js";

const typing: TypingConfig = {
  baseDelayMs: 50,
  spaceDelayMs: 30,
  punctuationDelayMs: 100,
  enterDelayMs: 200,
} as TypingConfig;

const typedChars = (page: FakePage) => page.keyboard.type.mock.calls.map(([c]) => c as string);
const delays = (page: FakePage) => page.waitForTimeout.mock.calls.map(([ms]) => ms as number);

describe("humanType", () => {
  let page: FakePage;

  beforeEach(() => {
    vi.clearAllMocks();
    page = createFakePage();
  });

  describe("character iteration", () => {
    it("types each character individually", async () => {
      await humanType(asPage(page), "abc", typing);

      expect(typedChars(page)).toEqual(["a", "b", "c"]);
    });

    // Array.from iterates code points, not UTF-16 units. Iterating the string
    // directly by index would split an emoji into two lone surrogates and type
    // two replacement characters instead of the emoji.
    it("types an astral-plane emoji as a single keystroke", async () => {
      await humanType(asPage(page), "hi 👋", typing);

      expect(typedChars(page)).toEqual(["h", "i", " ", "👋"]);
    });

    it("keeps a multi-code-point flag emoji intact per code point", async () => {
      await humanType(asPage(page), "🇩🇪", typing);

      // A regional-indicator pair is two code points; both must survive.
      expect(typedChars(page).join("")).toBe("🇩🇪");
    });

    it("types nothing for an empty string", async () => {
      await humanType(asPage(page), "", typing);

      expect(page.keyboard.type).not.toHaveBeenCalled();
      expect(page.waitForTimeout).not.toHaveBeenCalled();
    });
  });

  describe("newline handling", () => {
    it("presses Enter instead of typing a newline character", async () => {
      await humanType(asPage(page), "a\nb", typing);

      expect(page.keyboard.press).toHaveBeenCalledExactlyOnceWith("Enter");
      expect(typedChars(page)).toEqual(["a", "b"]);
    });

    it("applies the enter delay after a newline", async () => {
      await humanType(asPage(page), "\n", typing);

      expect(delays(page)).toEqual([250]);
    });
  });

  describe("per-character delays", () => {
    it("uses the base delay for ordinary characters", async () => {
      await humanType(asPage(page), "ab", typing);

      expect(delays(page)).toEqual([50, 50]);
    });

    it("adds the space and punctuation delays", async () => {
      await humanType(asPage(page), "a, b", typing);

      // a=base, ","=base+punctuation, " "=base+space, b=base
      expect(delays(page)).toEqual([50, 150, 80, 50]);
    });

    it.each([".", ",", "!", "?", ":", ";", "-"])("treats %s as punctuation", async (char) => {
      await humanType(asPage(page), char, typing);

      expect(delays(page)).toEqual([150]);
    });

    it("treats an apostrophe as an ordinary character", async () => {
      await humanType(asPage(page), "'", typing);

      expect(delays(page)).toEqual([50]);
    });
  });

  describe("baseDelayOverride", () => {
    it("replaces the configured base delay", async () => {
      await humanType(asPage(page), "ab", typing, 5);

      expect(delays(page)).toEqual([5, 5]);
    });

    // The check is `typeof x === "number"`, so an explicit 0 wins. A truthiness
    // check here would silently fall back to the config value and make
    // "instant" typing impossible to request per step.
    it("honours an override of 0 rather than falling back to the config", async () => {
      await humanType(asPage(page), "ab", typing, 0);

      expect(page.waitForTimeout).not.toHaveBeenCalled();
      expect(typedChars(page)).toEqual(["a", "b"]);
    });

    it("falls back to the config delay when the override is undefined", async () => {
      await humanType(asPage(page), "a", typing, undefined);

      expect(delays(page)).toEqual([50]);
    });

    it("still applies the punctuation surcharge on top of a 0 override", async () => {
      await humanType(asPage(page), ",", typing, 0);

      expect(delays(page)).toEqual([100]);
    });
  });

  describe("jitter", () => {
    it("varies the delay when a random source is supplied", async () => {
      // rng() === 1 → factor 1 + 0.15 → 50 * 1.15
      await humanType(asPage(page), "a", typing, undefined, () => 1);

      expect(delays(page)).toEqual([57.499999999999993]);
    });

    it("is deterministic without a random source", async () => {
      await humanType(asPage(page), "aaa", typing);

      expect(delays(page)).toEqual([50, 50, 50]);
    });
  });
});

describe("getTypingDelay", () => {
  it.each([
    ["\n", 250],
    [" ", 80],
    [".", 150],
    ["x", 50],
    ["5", 50],
  ])("returns %s → %s", (char, expected) => {
    expect(getTypingDelay(char, typing, 50)).toBe(expected);
  });
});
