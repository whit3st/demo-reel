import { describe, it, expect, vi, beforeEach } from "vitest";

const { handleAuth, runDemo, captureSession, saveSession } = vi.hoisted(() => ({
  handleAuth: vi.fn(),
  runDemo: vi.fn(),
  captureSession: vi.fn(),
  saveSession: vi.fn(),
}));

vi.mock("../src/video-handler.js", () => ({ handleAuth }));
vi.mock("../src/runner/index.js", () => ({ runDemo }));
vi.mock("../src/auth.js", () => ({ captureSession, saveSession }));

import { RecordingStage } from "../src/stages/recording.js";

function makeCtx(dryRun: boolean) {
  const session = { context: { id: "ctx" }, page: { id: "page" } };
  const acquire = vi.fn().mockResolvedValue(session);
  const release = vi.fn().mockResolvedValue(dryRun ? null : "/tmp/video.webm");
  const ctx = {
    config: { auth: { storage: { name: "demo", types: ["cookies"] } } },
    configPath: "/proj/.demo.tmp.json",
    verbose: false,
    headed: false,
    dryRun,
    browserPool: { acquire, release },
  } as any;
  return { ctx, session, acquire, release };
}

describe("RecordingStage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runDemo.mockResolvedValue([{ sceneIndex: 0, narration: "hi", startMs: 0, endMs: 1000 }]);
  });

  it("dry run: drives a non-recording browser, runs scenes, saves no session, produces no video", async () => {
    const { ctx, session, acquire, release } = makeCtx(true);

    await new RecordingStage().run(ctx);

    expect(acquire).toHaveBeenCalledWith(ctx.config, { recording: false, headed: false });
    expect(handleAuth).toHaveBeenCalledTimes(1);
    expect(runDemo).toHaveBeenCalledTimes(1);
    expect(ctx.sceneTimestamps).toHaveLength(1);
    // Released with the session only — no session-save callback, no video.
    expect(release).toHaveBeenCalledWith(session);
    expect(release.mock.calls[0]).toHaveLength(1);
    expect(saveSession).not.toHaveBeenCalled();
    expect(ctx.tempVideoPath).toBeUndefined();
  });

  it("real run: records, and the release is given a session-save callback", async () => {
    const { ctx, acquire, release } = makeCtx(false);

    await new RecordingStage().run(ctx);

    expect(acquire).toHaveBeenCalledWith(ctx.config, { recording: true, headed: false });
    // release(session, saveSessionFn) — the second arg is the save callback.
    expect(typeof release.mock.calls[0][1]).toBe("function");
    expect(ctx.tempVideoPath).toBe("/tmp/video.webm");
  });
});
