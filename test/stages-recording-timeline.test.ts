import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { handleAuth, runDemo, captureSession, saveSession } = vi.hoisted(() => ({
  handleAuth: vi.fn(),
  runDemo: vi.fn(),
  captureSession: vi.fn(),
  saveSession: vi.fn(),
}));

vi.mock("../src/video-handler.js", () => ({ handleAuth }));
vi.mock("../src/runner/index.js", () => ({ runDemo }));
vi.mock("../src/auth.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/auth.js")>()),
  captureSession,
  saveSession,
}));

import { RecordingStage } from "../src/stages/recording.js";

/**
 * The scene clock starts at zero when `runDemo` does; the recording started
 * earlier, when the context was created, and stops later, when the session is
 * closed. Narration can only be placed on the picture if the pipeline reports
 * both gaps — everything downstream is arithmetic on these two numbers.
 */
describe("RecordingStage recording timeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    runDemo.mockResolvedValue([{ sceneIndex: 0, narration: "hi", startMs: 0, endMs: 1000 }]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const makeCtx = () => {
    const session: Record<string, unknown> = {
      context: { id: "ctx" },
      page: { id: "page" },
      // Stamped by the launcher when the recording context is created.
      recordingStartedAt: 1_000_000,
    };
    const acquire = vi.fn(async () => {
      vi.setSystemTime(1_004_000); // 4s of auth + app boot before the first scene
      return session;
    });
    const release = vi.fn(async () => {
      session.recordingEndedAt = 1_006_500; // 1.5s of teardown after the last scene
      return "/tmp/video.webm";
    });
    const ctx = {
      config: { auth: { storage: { name: "demo", types: ["cookies"] } } },
      configPath: "/proj/.demo.tmp.json",
      verbose: false,
      headed: false,
      dryRun: false,
      browserPool: { acquire, release },
    } as any;
    return { ctx, session };
  };

  it("reports the pre-roll and tail around the scenes", async () => {
    const { ctx } = makeCtx();
    runDemo.mockImplementation(async () => {
      vi.setSystemTime(1_005_000); // scenes ran for 1s
      return [{ sceneIndex: 0, narration: "hi", startMs: 0, endMs: 1000 }];
    });

    await new RecordingStage().run(ctx);

    expect(ctx.recordingTimeline).toEqual({ preRollMs: 4000, tailMs: 1500 });
  });

  it("does not report a timeline when the recording start was never stamped", async () => {
    const { ctx, session } = makeCtx();
    delete session.recordingStartedAt;

    await new RecordingStage().run(ctx);

    expect(ctx.recordingTimeline).toBeUndefined();
  });

  it("never reports a negative pre-roll or tail", async () => {
    const { ctx, session } = makeCtx();
    session.recordingStartedAt = 1_009_999; // nonsense: after the demo started

    await new RecordingStage().run(ctx);

    expect(ctx.recordingTimeline.preRollMs).toBeGreaterThanOrEqual(0);
    expect(ctx.recordingTimeline.tailMs).toBeGreaterThanOrEqual(0);
  });

  it("skips the timeline on a dry run, which records nothing", async () => {
    const { ctx } = makeCtx();
    ctx.dryRun = true;
    ctx.browserPool.release = vi.fn().mockResolvedValue(null);

    await new RecordingStage().run(ctx);

    expect(ctx.recordingTimeline).toBeUndefined();
  });
});
