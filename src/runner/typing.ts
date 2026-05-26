import type { Page } from "playwright";
import type { TypingConfig } from "../schemas.js";
import type { RandomSource } from "../random.js";
import { applyJitter } from "./utils.js";

const punctuationCharacters = new Set([".", ",", "!", "?", ":", ";", "-"]);
const TYPING_DELAY_JITTER = 0.15;

export const getTypingDelay = (character: string, typing: TypingConfig, baseDelay: number) => {
  if (character === "\n") {
    return baseDelay + typing.enterDelayMs;
  }

  if (character === " ") {
    return baseDelay + typing.spaceDelayMs;
  }

  if (punctuationCharacters.has(character)) {
    return baseDelay + typing.punctuationDelayMs;
  }

  return baseDelay;
};

export const humanType = async (
  page: Page,
  text: string,
  typing: TypingConfig,
  baseDelayOverride?: number,
  rng?: RandomSource,
) => {
  const baseDelay = typeof baseDelayOverride === "number" ? baseDelayOverride : typing.baseDelayMs;

  for (const character of Array.from(text)) {
    if (character === "\n") {
      await page.keyboard.press("Enter");
    } else {
      await page.keyboard.type(character);
    }

    const delay = getTypingDelay(character, typing, baseDelay);
    const randomizedDelay = applyJitter(delay, TYPING_DELAY_JITTER, rng);
    if (randomizedDelay > 0) {
      await page.waitForTimeout(randomizedDelay);
    }
  }
};
