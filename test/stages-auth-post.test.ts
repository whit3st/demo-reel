import { beforeEach, describe, expect, it, vi } from "vitest";

const { handleAuthMock, runStepsMock } = vi.hoisted(() => ({
  handleAuthMock: vi.fn(),
  runStepsMock: vi.fn(),
}));

vi.mock("../src/video-handler.js", () => ({ handleAuth: handleAuthMock }));
vi.mock("../src/runner/index.js", () => ({ runSteps: runStepsMock }));

import { AuthStage } from "../src/stages/auth.js";
import { PostStepsStage } from "../src/stages/post-steps.js";

const session = { page: { id: "page" }, context: { id: "context" }, browser: {} };

function makePool() {
  return {
    acquire: vi.fn().mockResolvedValue(session),
    release: vi.fn().mockResolvedValue(null),
    releaseAll: vi.fn(),
    active: 0,
  };
}

function makeCtx(config: Record<string, unknown>, pool: ReturnType<typeof makePool> | undefined) {
  return {
    config,
    configPath: "/workspace/project",
    verbose: false,
    browserPool: pool,
    warnings: [] as string[],
  } as any;
}

const steps = [{ action: "click", selector: { strategy: "id", value: "logout" } }];

describe("AuthStage", () => {
  // mockReset, not clearAllMocks: the rejection set up by the failure tests
  // would otherwise persist into the following ones.
  beforeEach(() => {
    handleAuthMock.mockReset();
    runStepsMock.mockReset();
  });

  it("does nothing when the config has no auth block", async () => {
    const pool = makePool();

    await new AuthStage().run(makeCtx({}, pool));

    expect(pool.acquire).not.toHaveBeenCalled();
    expect(handleAuthMock).not.toHaveBeenCalled();
  });

  it("throws when the pipeline never initialised a browser pool", async () => {
    await expect(
      new AuthStage().run(makeCtx({ auth: { loginUrl: "/login" } }, undefined)),
    ).rejects.toThrow("BrowserPool not initialized");
  });

  it("acquires a non-recording session and hands it to handleAuth", async () => {
    const pool = makePool();
    const auth = { loginUrl: "/login" };

    await new AuthStage().run(makeCtx({ auth }, pool));

    expect(pool.acquire).toHaveBeenCalledWith({ auth }, { recording: false });
    expect(handleAuthMock).toHaveBeenCalledWith(
      session.context,
      session.page,
      auth,
      "/workspace/project",
      false,
    );
  });

  // The release lives in a finally block. Without it a failed login leaks the
  // browser for the rest of the run — the failure mode that silently regresses,
  // because the happy path keeps working either way.
  it("releases the session even when authentication fails", async () => {
    const pool = makePool();
    handleAuthMock.mockRejectedValue(new Error("invalid credentials"));

    await expect(
      new AuthStage().run(makeCtx({ auth: { loginUrl: "/login" } }, pool)),
    ).rejects.toThrow("invalid credentials");

    expect(pool.release).toHaveBeenCalledWith(session);
  });

  it("releases the session on success", async () => {
    const pool = makePool();

    await new AuthStage().run(makeCtx({ auth: { loginUrl: "/login" } }, pool));

    expect(pool.release).toHaveBeenCalledWith(session);
  });
});

describe("PostStepsStage", () => {
  // mockReset, not clearAllMocks: the rejection set up by the failure tests
  // would otherwise persist into the following ones.
  beforeEach(() => {
    handleAuthMock.mockReset();
    runStepsMock.mockReset();
  });

  it("does nothing when neither postSteps nor cleanup is set", async () => {
    const pool = makePool();

    await new PostStepsStage().run(makeCtx({}, pool));

    expect(pool.acquire).not.toHaveBeenCalled();
  });

  it("does nothing for an empty postSteps array", async () => {
    const pool = makePool();

    await new PostStepsStage().run(makeCtx({ postSteps: [] }, pool));

    expect(pool.acquire).not.toHaveBeenCalled();
  });

  it("falls back to the legacy cleanup key", async () => {
    const pool = makePool();

    await new PostStepsStage().run(makeCtx({ cleanup: steps }, pool));

    expect(runStepsMock).toHaveBeenCalledWith(session.page, steps, expect.anything());
  });

  it("prefers postSteps over cleanup when both are present", async () => {
    const pool = makePool();
    const cleanup = [{ action: "wait", ms: 1 }];

    await new PostStepsStage().run(makeCtx({ postSteps: steps, cleanup }, pool));

    expect(runStepsMock).toHaveBeenCalledWith(session.page, steps, expect.anything());
  });

  // The fallback uses ?? rather than ||, so an explicitly empty postSteps array
  // shadows a populated cleanup and the stage becomes a no-op. Surprising, but
  // it is the current contract — pinned here so a change to it is deliberate.
  it("lets an empty postSteps array shadow a populated cleanup", async () => {
    const pool = makePool();

    await new PostStepsStage().run(makeCtx({ postSteps: [], cleanup: steps }, pool));

    expect(runStepsMock).not.toHaveBeenCalled();
    expect(pool.acquire).not.toHaveBeenCalled();
  });

  it("throws when the pipeline never initialised a browser pool", async () => {
    await expect(
      new PostStepsStage().run(makeCtx({ postSteps: steps }, undefined)),
    ).rejects.toThrow("BrowserPool not initialized");
  });

  // Cleanup runs after the video is already recorded, so a failing step must
  // not fail the whole generate() — the user's video is finished by then.
  it("runs the steps in tolerant mode under the post label", async () => {
    const pool = makePool();

    await new PostStepsStage().run(makeCtx({ postSteps: steps }, pool));

    expect(runStepsMock).toHaveBeenCalledWith(session.page, steps, {
      tolerant: true,
      verbose: false,
      label: "post",
    });
  });

  it("re-authenticates before running cleanup when auth is configured", async () => {
    const pool = makePool();
    const auth = { loginUrl: "/login" };

    await new PostStepsStage().run(makeCtx({ postSteps: steps, auth }, pool));

    expect(handleAuthMock).toHaveBeenCalled();
    expect(handleAuthMock.mock.invocationCallOrder[0]).toBeLessThan(
      runStepsMock.mock.invocationCallOrder[0],
    );
  });

  it("skips authentication when no auth is configured", async () => {
    const pool = makePool();

    await new PostStepsStage().run(makeCtx({ postSteps: steps }, pool));

    expect(handleAuthMock).not.toHaveBeenCalled();
  });

  it("releases the session even when a cleanup step throws", async () => {
    const pool = makePool();
    runStepsMock.mockRejectedValue(new Error("cleanup exploded"));

    await expect(new PostStepsStage().run(makeCtx({ postSteps: steps }, pool))).rejects.toThrow(
      "cleanup exploded",
    );

    expect(pool.release).toHaveBeenCalledWith(session);
  });

  it("releases the session even when re-authentication throws", async () => {
    const pool = makePool();
    handleAuthMock.mockRejectedValue(new Error("session expired"));

    await expect(
      new PostStepsStage().run(makeCtx({ postSteps: steps, auth: { loginUrl: "/l" } }, pool)),
    ).rejects.toThrow("session expired");

    expect(pool.release).toHaveBeenCalledWith(session);
  });
});
