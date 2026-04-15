import { beforeEach, describe, expect, it, vi } from "vitest";

const { crawlUrlMock, formatPageContextMock } = vi.hoisted(() => ({
  crawlUrlMock: vi.fn(),
  formatPageContextMock: vi.fn(),
}));

vi.mock("../src/script/crawler.js", () => ({
  crawlUrl: crawlUrlMock,
  formatPageContext: formatPageContextMock,
}));

import { main } from "../src/script/crawl-cli.js";

describe("crawl-cli", () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.clearAllMocks();
    process.argv = [...originalArgv];
  });

  it("exits with usage when url missing", async () => {
    process.argv = ["node", "crawl-cli"];
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: string | number | null) => {
        throw new Error(`exit:${code}`);
      }) as never);

    await expect(main()).rejects.toThrow("exit:1");
    expect(errorSpy).toHaveBeenCalledWith("Usage: node dist/script/crawl-cli.js <url> [json|text]");

    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("prints json output when format json", async () => {
    process.argv = ["node", "crawl-cli", "https://example.com", "json"];
    crawlUrlMock.mockResolvedValue({ url: "https://example.com", title: "Example" });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await main();

    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify({ url: "https://example.com", title: "Example" }, null, 2),
    );
    logSpy.mockRestore();
  });

  it("prints text output by default", async () => {
    process.argv = ["node", "crawl-cli", "https://example.com"];
    crawlUrlMock.mockResolvedValue({ url: "https://example.com" });
    formatPageContextMock.mockReturnValue("formatted page");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await main();

    expect(formatPageContextMock).toHaveBeenCalledWith({ url: "https://example.com" });
    expect(logSpy).toHaveBeenCalledWith("formatted page");
    logSpy.mockRestore();
  });

  it("exits when crawl throws", async () => {
    process.argv = ["node", "crawl-cli", "https://bad.example"];
    crawlUrlMock.mockRejectedValue(new Error("network down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: string | number | null) => {
        throw new Error(`exit:${code}`);
      }) as never);

    await expect(main()).rejects.toThrow("exit:1");
    expect(errorSpy).toHaveBeenCalledWith("Error crawling https://bad.example: network down");

    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("handles non-Error throw values", async () => {
    process.argv = ["node", "crawl-cli", "https://bad.example"];
    crawlUrlMock.mockRejectedValue("boom");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: string | number | null) => {
        throw new Error(`exit:${code}`);
      }) as never);

    await expect(main()).rejects.toThrow("exit:1");
    expect(errorSpy).toHaveBeenCalledWith("Error crawling https://bad.example: boom");

    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
