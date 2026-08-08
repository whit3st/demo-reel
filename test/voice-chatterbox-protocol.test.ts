import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeChildProcess } from "./helpers/fake-child-process.js";

const { spawnMock, runFFmpegMock, getFfmpegPathMock, measureAudioDurationMock } = vi.hoisted(
  () => ({
    spawnMock: vi.fn(),
    runFFmpegMock: vi.fn(),
    getFfmpegPathMock: vi.fn(),
    measureAudioDurationMock: vi.fn(),
  }),
);

vi.mock("child_process", () => ({ spawn: spawnMock }));

vi.mock("../src/ffmpeg/utils.js", () => ({
  runFFmpeg: runFFmpegMock,
  getFfmpegPath: getFfmpegPathMock,
  measureAudioDuration: measureAudioDurationMock,
}));

vi.mock("fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(Buffer.from("mp3-bytes")),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("fs", () => ({ existsSync: vi.fn().mockReturnValue(true) }));

let child: FakeChildProcess;

/** Import the module fresh so its module-level worker map starts empty. */
async function loadChatterbox() {
  vi.resetModules();
  child = new FakeChildProcess();
  spawnMock.mockReturnValue(child);
  return import("../src/voice/chatterbox.js");
}

/** Let the worker finish its handshake so generate() can proceed. */
function handshake() {
  child.emitMessage({ ready: true });
}

const options = { provider: "chatterbox", voice: "default", speed: 1.0 } as any;

describe("chatterbox worker protocol", () => {
  // Each loadChatterbox() gets a fresh module instance, and ensureWorker
  // registers a process.once("exit") hook per worker — harmless in production
  // (two models max) but it trips Node's 10-listener warning across this file.
  const originalMaxListeners = process.getMaxListeners();
  beforeAll(() => process.setMaxListeners(50));
  afterAll(() => process.setMaxListeners(originalMaxListeners));

  beforeEach(() => {
    vi.clearAllMocks();
    getFfmpegPathMock.mockResolvedValue("/usr/bin/ffmpeg");
    runFFmpegMock.mockResolvedValue(undefined);
    measureAudioDurationMock.mockResolvedValue(1234);
  });

  afterEach(async () => {
    const { shutdownChatterbox } = await import("../src/voice/chatterbox.js");
    shutdownChatterbox();
  });

  describe("JSON-lines framing", () => {
    it("resolves a response delivered in a single chunk", async () => {
      const { chatterboxProvider } = await loadChatterbox();

      const promise = chatterboxProvider.generate("hello", options);
      handshake();
      await vi.waitFor(() => expect(child.requests.length).toBeGreaterThan(0));
      child.emitMessage({ id: child.requests[0].id, ok: true, path: "/tmp/out.wav" });

      await expect(promise).resolves.toMatchObject({ durationMs: 1234 });
    });

    // stdout is a stream: a message can arrive as "{\"id\":\"1\",\"o" + "k\":true}\n".
    // Buffering across chunks is the whole point of the `buffer` variable.
    it("resolves a response split across two stdout chunks", async () => {
      const { chatterboxProvider } = await loadChatterbox();

      const promise = chatterboxProvider.generate("hello", options);
      handshake();
      await vi.waitFor(() => expect(child.requests.length).toBeGreaterThan(0));
      child.emitMessageSplit({ id: child.requests[0].id, ok: true, path: "/tmp/out.wav" }, 12);

      await expect(promise).resolves.toMatchObject({ durationMs: 1234 });
    });

    it("handles several messages arriving in one chunk", async () => {
      const { chatterboxProvider } = await loadChatterbox();

      const promise = chatterboxProvider.generate("hello", options);
      await vi.waitFor(() => expect(child.stdout.listenerCount("data")).toBeGreaterThan(0));
      // ready and the response, back to back, in a single read.
      child.writeRaw(`${JSON.stringify({ ready: true })}\n`);
      await vi.waitFor(() => expect(child.requests.length).toBeGreaterThan(0));
      const id = child.requests[0].id;
      child.writeRaw(
        `${JSON.stringify({ noise: true })}\n\n${JSON.stringify({ id, ok: true, path: "/tmp/o.wav" })}\n`,
      );

      await expect(promise).resolves.toMatchObject({ durationMs: 1234 });
    });

    it("skips malformed JSON without losing the following message", async () => {
      const { chatterboxProvider } = await loadChatterbox();

      const promise = chatterboxProvider.generate("hello", options);
      handshake();
      await vi.waitFor(() => expect(child.requests.length).toBeGreaterThan(0));
      child.writeRaw("this is not json\n");
      child.emitMessage({ id: child.requests[0].id, ok: true, path: "/tmp/out.wav" });

      await expect(promise).resolves.toMatchObject({ durationMs: 1234 });
    });

    it("rejects with the worker's error message", async () => {
      const { chatterboxProvider } = await loadChatterbox();

      const promise = chatterboxProvider.generate("hello", options);
      handshake();
      await vi.waitFor(() => expect(child.requests.length).toBeGreaterThan(0));
      child.emitMessage({ id: child.requests[0].id, ok: false, error: "CUDA out of memory" });

      await expect(promise).rejects.toThrow(/CUDA out of memory/);
    });
  });

  describe("worker lifecycle failures", () => {
    // The worker emits {"ok": false, "error": ...} with NO id when it cannot
    // parse a request (chatterbox_worker.py:131). Dropping id-less frames meant
    // the caller waited forever for a reply that was never coming.
    it("rejects the pending request on an id-less error frame", async () => {
      const { chatterboxProvider } = await loadChatterbox();

      const promise = chatterboxProvider.generate("hello", options);
      handshake();
      await vi.waitFor(() => expect(child.requests.length).toBeGreaterThan(0));
      child.emitMessage({ ok: false, error: "bad request json: unexpected token" });

      await expect(promise).rejects.toThrow(/bad request json/);
    });

    // failAll only ran for a non-zero exit code, so a worker that shut itself
    // down cleanly mid-request left the promise pending and hung the CLI.
    it("rejects pending requests when the worker exits cleanly", async () => {
      const { chatterboxProvider } = await loadChatterbox();

      const promise = chatterboxProvider.generate("hello", options);
      handshake();
      await vi.waitFor(() => expect(child.requests.length).toBeGreaterThan(0));
      child.emitClose(0);

      await expect(promise).rejects.toThrow();
    });

    it("rejects pending requests when the worker exits with a failure code", async () => {
      const { chatterboxProvider } = await loadChatterbox();

      const promise = chatterboxProvider.generate("hello", options);
      handshake();
      await vi.waitFor(() => expect(child.requests.length).toBeGreaterThan(0));
      child.emitStderr("Traceback: model checkpoint missing");
      child.emitClose(1);

      await expect(promise).rejects.toThrow(/exited with code 1/);
    });

    it("reports the interpreter path when the process cannot start", async () => {
      const { chatterboxProvider } = await loadChatterbox();

      const promise = chatterboxProvider.generate("hello", options);
      child.emitError(new Error("spawn python3 ENOENT"));

      await expect(promise).rejects.toThrow(/Failed to start Chatterbox turbo worker/);
    });
  });

  describe("request payload", () => {
    it("sends null for the optional fields the turbo model does not use", async () => {
      const { chatterboxProvider } = await loadChatterbox();

      const promise = chatterboxProvider.generate("hello there", options);
      handshake();
      await vi.waitFor(() => expect(child.requests.length).toBeGreaterThan(0));
      const request = child.requests[0];
      child.emitMessage({ id: request.id, ok: true, path: "/tmp/out.wav" });
      await promise;

      expect(request).toMatchObject({
        text: "hello there",
        audio_prompt_path: null,
        language_id: null,
      });
      expect(request.out).toMatch(/\.wav$/);
    });

    // The multilingual checkpoint takes language_id as a required positional
    // argument, so it must reach the worker rather than defaulting to null.
    it("forwards language_id for the multilingual provider", async () => {
      const { chatterboxMultilingualProvider } = await loadChatterbox();

      const promise = chatterboxMultilingualProvider.generate("bonjour", {
        provider: "chatterbox-multilingual",
        voice: "default",
        speed: 1.0,
        language: "fr",
      } as any);
      handshake();
      await vi.waitFor(() => expect(child.requests.length).toBeGreaterThan(0));
      const request = child.requests[0];
      child.emitMessage({ id: request.id, ok: true, path: "/tmp/out.wav" });
      await promise;

      expect(request.language_id).toBe("fr");
      expect(spawnMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({ CHATTERBOX_MODEL: "multilingual" }),
        }),
      );
    });

    it("forwards audio_prompt_path when a voice clone path is configured", async () => {
      const { chatterboxProvider } = await loadChatterbox();

      const promise = chatterboxProvider.generate("hello", {
        provider: "chatterbox",
        voicePath: "/voices/me.wav",
        speed: 1.0,
      } as any);
      handshake();
      await vi.waitFor(() => expect(child.requests.length).toBeGreaterThan(0));
      const request = child.requests[0];
      child.emitMessage({ id: request.id, ok: true, path: "/tmp/out.wav" });
      await promise;

      expect(request.audio_prompt_path).toBe("/voices/me.wav");
    });
  });

  describe("mp3 encoding", () => {
    const generateAt = async (speed: number) => {
      const { chatterboxProvider } = await loadChatterbox();
      const promise = chatterboxProvider.generate("hello", { ...options, speed });
      handshake();
      await vi.waitFor(() => expect(child.requests.length).toBeGreaterThan(0));
      child.emitMessage({ id: child.requests[0].id, ok: true, path: "/tmp/out.wav" });
      await promise;
      return runFFmpegMock.mock.calls[0][1] as string[];
    };

    // Chatterbox has no pace control, so atempo is the only speed knob. Adding
    // it at 1.0 would re-encode for nothing and can shift timing slightly.
    it("omits the atempo filter at speed 1.0", async () => {
      const args = await generateAt(1.0);

      expect(args).not.toContain("-filter:a");
    });

    it("applies atempo for a non-default speed", async () => {
      const args = await generateAt(1.25);

      expect(args).toContain("-filter:a");
      expect(args[args.indexOf("-filter:a") + 1]).toBe("atempo=1.25");
    });

    it("encodes to mp3 with libmp3lame", async () => {
      const args = await generateAt(1.0);

      expect(args).toEqual(expect.arrayContaining(["-codec:a", "libmp3lame"]));
      expect(args[args.length - 1]).toMatch(/\.mp3$/);
    });
  });

  describe("shutdownChatterbox", () => {
    it("asks the worker to exit and kills the process", async () => {
      const { chatterboxProvider, shutdownChatterbox } = await loadChatterbox();

      const promise = chatterboxProvider.generate("hello", options);
      handshake();
      await vi.waitFor(() => expect(child.requests.length).toBeGreaterThan(0));
      child.emitMessage({ id: child.requests[0].id, ok: true, path: "/tmp/out.wav" });
      await promise;

      shutdownChatterbox();

      expect(child.written.some((line) => line.includes('"shutdown"'))).toBe(true);
      expect(child.kill).toHaveBeenCalled();
    });

    it("is safe to call when no worker was ever started", async () => {
      const { shutdownChatterbox } = await loadChatterbox();

      expect(() => shutdownChatterbox()).not.toThrow();
    });
  });
});
