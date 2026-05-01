import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../src/runner.js", () => ({
  resolveLocator: vi.fn(),
}));

import { resolveLocator } from "../src/runner.js";
import {
  AssertionFailure,
  evaluateAssertion,
  selectCheckpointsForLabel,
  selectCheckpointsForStep,
} from "../src/runtime/assertions.js";

describe("runtime assertions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes expectVisible when locator is visible", async () => {
    vi.mocked(resolveLocator).mockReturnValue({ isVisible: vi.fn().mockResolvedValue(true) } as never);

    await expect(
      evaluateAssertion({} as never, {
        type: "expectVisible",
        selector: { strategy: "testId", value: "title" },
      }),
    ).resolves.toBeUndefined();
  });

  it("fails expectHidden when locator is visible", async () => {
    vi.mocked(resolveLocator).mockReturnValue({ isHidden: vi.fn().mockResolvedValue(false) } as never);

    await expect(
      evaluateAssertion({} as never, {
        type: "expectHidden",
        selector: { strategy: "testId", value: "title" },
      }),
    ).rejects.toBeInstanceOf(AssertionFailure);
  });

  it("supports contains and exact text assertions", async () => {
    vi.mocked(resolveLocator).mockReturnValue({ textContent: vi.fn().mockResolvedValue("Order Complete") } as never);

    await expect(
      evaluateAssertion({} as never, {
        type: "expectText",
        selector: { strategy: "testId", value: "status" },
        text: "Complete",
      }),
    ).resolves.toBeUndefined();

    await expect(
      evaluateAssertion({} as never, {
        type: "expectText",
        selector: { strategy: "testId", value: "status" },
        text: "Order Complete",
        contains: false,
      }),
    ).resolves.toBeUndefined();
  });

  it("supports exact and regex URL assertions", async () => {
    const page = { url: () => "https://example.com/orders/42" } as never;

    await expect(
      evaluateAssertion(page, {
        type: "expectUrl",
        url: "https://example.com/orders/42",
      }),
    ).resolves.toBeUndefined();

    await expect(
      evaluateAssertion(page, {
        type: "expectUrl",
        url: /orders\/\d+$/,
      }),
    ).resolves.toBeUndefined();
  });

  it("selects checkpoints by step and label", () => {
    const checkpoints = [
      { atStep: 0, expect: [{ type: "expectUrl", url: "https://example.com" }] },
      { label: "cleanup", expect: [{ type: "expectUrl", url: "https://example.com/done" }] },
    ];

    expect(selectCheckpointsForStep(checkpoints as never[], 0)).toHaveLength(1);
    expect(selectCheckpointsForLabel(checkpoints as never[], "cleanup")).toHaveLength(1);
  });
});
