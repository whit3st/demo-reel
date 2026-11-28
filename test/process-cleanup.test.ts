import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("process cleanup registry", () => {
  it("runs registered targets once and clears them", async () => {
    const { registerCleanupTarget, runCleanupTargets, cleanupTargetCount } =
      await import("../src/process-cleanup.js");
    const first = vi.fn();
    const second = vi.fn().mockRejectedValue(new Error("teardown failed"));

    registerCleanupTarget(first);
    registerCleanupTarget(second);
    expect(cleanupTargetCount()).toBe(2);

    await expect(runCleanupTargets()).resolves.toBeUndefined();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(cleanupTargetCount()).toBe(0);
  });

  it("removes a target through the returned unregister function", async () => {
    const { registerCleanupTarget, runCleanupTargets, cleanupTargetCount } =
      await import("../src/process-cleanup.js");
    const target = vi.fn();

    const unregister = registerCleanupTarget(target);
    unregister();

    expect(cleanupTargetCount()).toBe(0);
    await runCleanupTargets();
    expect(target).not.toHaveBeenCalled();
  });

  it("drains targets registered by a target that is already running", async () => {
    const { registerCleanupTarget, runCleanupTargets } = await import("../src/process-cleanup.js");
    const late = vi.fn();
    registerCleanupTarget(() => {
      registerCleanupTarget(late);
    });

    await runCleanupTargets();

    expect(late).toHaveBeenCalledTimes(1);
  });

  it("reports shutdown only after draining starts", async () => {
    const { isShuttingDown, runCleanupTargets } = await import("../src/process-cleanup.js");

    expect(isShuttingDown()).toBe(false);
    await runCleanupTargets();
    expect(isShuttingDown()).toBe(true);
  });

  it("drains the registry on SIGINT and exits with 130", async () => {
    let sigintHandler: (() => void) | undefined;
    vi.spyOn(process, "once").mockImplementation(((event: string, handler: () => void) => {
      if (event === "SIGINT") sigintHandler = handler;
      return process;
    }) as never);

    const { registerCleanupTarget, installSignalCleanup } =
      await import("../src/process-cleanup.js");
    const target = vi.fn();
    registerCleanupTarget(target);

    const exit = vi.fn();
    installSignalCleanup({ exit, timeoutMs: 1000 });
    // Idempotent: a second installation must not stack handlers.
    installSignalCleanup({ exit, timeoutMs: 1000 });

    expect(sigintHandler).toBeTypeOf("function");
    expect(process.once).toHaveBeenCalledTimes(2);

    sigintHandler?.();
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(130));
    expect(target).toHaveBeenCalledTimes(1);
  });
});
