import { describe, expect, it, vi } from "vitest";
import { createRandom } from "../src/random.js";

describe("random", () => {
  it("produces deterministic sequences for the same string seed", () => {
    const first = createRandom("demo-seed");
    const second = createRandom("demo-seed");

    expect([first(), first(), first()]).toEqual([second(), second(), second()]);
  });

  it("produces different sequences for different seeds", () => {
    const first = createRandom("seed-a");
    const second = createRandom("seed-b");

    expect([first(), first(), first()]).not.toEqual([second(), second(), second()]);
  });

  it("supports numeric seeds", () => {
    const first = createRandom(12345);
    const second = createRandom(12345);

    expect([first(), first(), first()]).toEqual([second(), second(), second()]);
  });

  it("falls back to Math.random when no seed is provided", () => {
    const spy = vi.spyOn(Math, "random").mockReturnValue(0.25);

    const first = createRandom();
    const second = createRandom();

    expect(spy).toHaveBeenCalledTimes(2);
    expect([first(), first(), first()]).toEqual([second(), second(), second()]);

    spy.mockRestore();
  });

  it("always returns values between 0 and 1", () => {
    const random = createRandom("bounded-seed");

    for (let i = 0; i < 20; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
