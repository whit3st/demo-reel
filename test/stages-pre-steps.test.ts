import { describe, it, expect, vi, beforeEach } from "vitest";

const { handleAuth, runSteps } = vi.hoisted(() => ({
  handleAuth: vi.fn(),
  runSteps: vi.fn(),
}));

vi.mock("../src/video-handler.js", () => ({ handleAuth }));
vi.mock("../src/runner/index.js", () => ({ runSteps }));

import { PreStepsStage } from "../src/stages/pre-steps.js";

function makeCtx(overrides: Record<string, unknown> = {}) {
  const session = { context: { id: "ctx" }, page: { id: "page" } };
  const release = vi.fn().mockResolvedValue(null);
  const acquire = vi.fn().mockResolvedValue(session);
  const ctx = {
    config: {
      auth: { storage: { name: "demo", types: ["cookies"] }, loginSteps: [], validate: {} },
      preSteps: [{ action: "goto", url: "https://example.com/protected" }],
    },
    configPath: "/proj/.demo.tmp.json",
    verbose: false,
    browserPool: { acquire, release },
    ...overrides,
  } as any;
  return { ctx, session, acquire, release };
}

describe("PreStepsStage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("authenticates before running pre-steps so they don't run logged out", async () => {
    const { ctx, session } = makeCtx();

    await new PreStepsStage().run(ctx);

    // Pre-steps must authenticate, like recording and post-steps do.
    expect(handleAuth).toHaveBeenCalledTimes(1);
    expect(handleAuth).toHaveBeenCalledWith(
      session.context,
      session.page,
      ctx.config.auth,
      ctx.configPath,
      ctx.verbose,
    );
    expect(runSteps).toHaveBeenCalledTimes(1);
    // Auth happens before the steps run.
    expect(handleAuth.mock.invocationCallOrder[0]).toBeLessThan(
      runSteps.mock.invocationCallOrder[0],
    );
  });

  it("skips auth when no auth is configured", async () => {
    const { ctx } = makeCtx({
      config: { preSteps: [{ action: "goto", url: "https://example.com" }] },
    });

    await new PreStepsStage().run(ctx);

    expect(handleAuth).not.toHaveBeenCalled();
    expect(runSteps).toHaveBeenCalledTimes(1);
  });

  it("does nothing when there are no pre-steps", async () => {
    const { ctx, acquire } = makeCtx({
      config: { auth: { storage: { name: "demo", types: ["cookies"] } } },
    });

    await new PreStepsStage().run(ctx);

    expect(acquire).not.toHaveBeenCalled();
    expect(handleAuth).not.toHaveBeenCalled();
    expect(runSteps).not.toHaveBeenCalled();
  });
});
