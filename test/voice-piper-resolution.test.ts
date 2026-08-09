import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeChildProcess } from "./helpers/fake-child-process.js";

const {
  spawnMock,
  ensurePiperBinaryMock,
  ensurePiperModelMock,
  wavToMp3Mock,
  measureAudioDurationMock,
} = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  ensurePiperBinaryMock: vi.fn(),
  ensurePiperModelMock: vi.fn(),
  wavToMp3Mock: vi.fn(),
  measureAudioDurationMock: vi.fn(),
}));

vi.mock("child_process", () => ({ spawn: spawnMock }));

vi.mock("../src/piper.js", () => ({
  ensurePiperBinary: ensurePiperBinaryMock,
  ensurePiperModel: ensurePiperModelMock,
}));

vi.mock("../src/ffmpeg/utils.js", () => ({
  wavToMp3: wavToMp3Mock,
  measureAudioDuration: measureAudioDurationMock,
}));

vi.mock("fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(Buffer.from("wav")),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

import { piperProvider } from "../src/voice/piper.js";

/** A piper child process that exits successfully as soon as stdin closes. */
function spawnSuccessfulPiper() {
  const child = new FakeChildProcess();
  (child as any).stdin = {
    write: vi.fn(),
    end: vi.fn(() => queueMicrotask(() => child.emitClose(0))),
  };
  return child;
}

const piperArgs = () => spawnMock.mock.calls.at(-1)![1] as string[];
const piperBinary = () => spawnMock.mock.calls.at(-1)![0] as string;

const savedEnv = { ...process.env };

describe("piperProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensurePiperBinaryMock.mockResolvedValue("/opt/piper/piper");
    ensurePiperModelMock.mockImplementation(
      async (name: string, dir: string) => `${dir}/${name}.onnx`,
    );
    wavToMp3Mock.mockResolvedValue(Buffer.from("mp3"));
    measureAudioDurationMock.mockResolvedValue(1500);
    spawnMock.mockImplementation(() => spawnSuccessfulPiper());
    delete process.env.PIPER_VOICE_DIR;
    process.env.HOME = "/home/tester";
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  const named = (overrides: Record<string, unknown> = {}) =>
    ({ provider: "piper", voice: "en_US-amy-medium", speed: 1.0, ...overrides }) as any;

  const byPath = (voicePath: string, overrides: Record<string, unknown> = {}) =>
    ({ provider: "piper", voicePath, speed: 1.0, ...overrides }) as any;

  describe("speed → length_scale", () => {
    // piper's length_scale stretches each phoneme, so it is the INVERSE of
    // speed: 2x faster speech means half the length. Getting this backwards
    // produces audio that is wrong in a way nobody notices until they listen.
    it.each([
      [2.0, "0.5"],
      [1.25, "0.8"],
      [0.5, "2"],
      [0.8, "1.25"],
    ])("speed %s becomes length_scale %s", async (speed, expected) => {
      await piperProvider.generate("hi", named({ speed }));

      const args = piperArgs();
      expect(args).toContain("--length_scale");
      expect(args[args.indexOf("--length_scale") + 1]).toBe(expected);
    });

    it("omits length_scale entirely at speed 1.0", async () => {
      await piperProvider.generate("hi", named({ speed: 1.0 }));

      expect(piperArgs()).not.toContain("--length_scale");
    });

    it("always passes the model and output file", async () => {
      await piperProvider.generate("hi", named());

      const args = piperArgs();
      expect(args[0]).toBe("--model");
      expect(args[1]).toMatch(/en_US-amy-medium\.onnx$/);
      expect(args[2]).toBe("--output_file");
      expect(args[3]).toMatch(/\.wav$/);
    });
  });

  describe("model directory resolution", () => {
    it("defaults to the XDG-style piper-voices directory under HOME", async () => {
      await piperProvider.generate("hi", named());

      expect(ensurePiperModelMock).toHaveBeenCalledWith(
        "en_US-amy-medium",
        "/home/tester/.local/share/piper-voices",
      );
    });

    it("prefers PIPER_VOICE_DIR when set", async () => {
      process.env.PIPER_VOICE_DIR = "/srv/voices";

      await piperProvider.generate("hi", named());

      expect(ensurePiperModelMock).toHaveBeenCalledWith("en_US-amy-medium", "/srv/voices");
    });

    it("falls back to the working directory when HOME is unset", async () => {
      delete process.env.HOME;
      delete process.env.USERPROFILE;

      await piperProvider.generate("hi", named());

      // join() normalises the "." away, leaving a cwd-relative path.
      expect(ensurePiperModelMock).toHaveBeenCalledWith(
        "en_US-amy-medium",
        ".local/share/piper-voices",
      );
    });
  });

  describe("voicePath", () => {
    it("uses an absolute path verbatim without downloading a model", async () => {
      await piperProvider.generate("hi", byPath("/models/custom.onnx"));

      expect(ensurePiperModelMock).not.toHaveBeenCalled();
      expect(piperArgs()[1]).toBe("/models/custom.onnx");
    });

    it("uses a relative .onnx path verbatim", async () => {
      await piperProvider.generate("hi", byPath("voices/custom.onnx"));

      expect(piperArgs()[1]).toBe("voices/custom.onnx");
    });

    it("appends .onnx and resolves against the voice dir for a bare name", async () => {
      process.env.PIPER_VOICE_DIR = "/srv/voices";

      await piperProvider.generate("hi", byPath("my-custom-voice"));

      expect(ensurePiperModelMock).not.toHaveBeenCalled();
      expect(piperArgs()[1]).toBe("/srv/voices/my-custom-voice.onnx");
    });
  });

  describe("binary resolution", () => {
    it("uses the bundled binary when it is available", async () => {
      await piperProvider.generate("hi", named());

      expect(piperBinary()).toBe("/opt/piper/piper");
    });

    // The download can fail offline or on an unsupported platform; a
    // system-installed piper is the documented fallback.
    it("falls back to `which piper` when the bundled binary is unavailable", async () => {
      ensurePiperBinaryMock.mockRejectedValue(new Error("download failed"));
      spawnMock.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === "which" && args[0] === "piper") {
          const child = new FakeChildProcess();
          queueMicrotask(() => {
            child.stdout.emit("data", Buffer.from("/usr/local/bin/piper\n"));
            child.emitClose(0);
          });
          return child;
        }
        return spawnSuccessfulPiper();
      });

      await piperProvider.generate("hi", named());

      expect(piperBinary()).toBe("/usr/local/bin/piper");
    });

    it("falls back to piper-tts when plain piper is not on PATH", async () => {
      ensurePiperBinaryMock.mockRejectedValue(new Error("download failed"));
      spawnMock.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === "which") {
          const child = new FakeChildProcess();
          queueMicrotask(() => {
            if (args[0] === "piper-tts") {
              child.stdout.emit("data", Buffer.from("/usr/bin/piper-tts\n"));
              child.emitClose(0);
            } else {
              child.emitClose(1);
            }
          });
          return child;
        }
        return spawnSuccessfulPiper();
      });

      await piperProvider.generate("hi", named());

      expect(piperBinary()).toBe("/usr/bin/piper-tts");
    });

    it("gives install instructions when piper cannot be found at all", async () => {
      ensurePiperBinaryMock.mockRejectedValue(new Error("download failed"));
      spawnMock.mockImplementation(() => {
        const child = new FakeChildProcess();
        queueMicrotask(() => child.emitClose(1));
        return child;
      });

      await expect(piperProvider.generate("hi", named())).rejects.toThrow(/pip install piper-tts/);
    });
  });

  describe("synthesis failures", () => {
    it("reports piper's exit code and stderr", async () => {
      spawnMock.mockImplementation(() => {
        const child = new FakeChildProcess();
        (child as any).stdin = {
          write: vi.fn(),
          end: vi.fn(() =>
            queueMicrotask(() => {
              child.emitStderr("model file is corrupt");
              child.emitClose(3);
            }),
          ),
        };
        return child;
      });

      await expect(piperProvider.generate("hi", named())).rejects.toThrow(
        /Piper exited with code 3: model file is corrupt/,
      );
    });

    it("wraps a missing model with the voice name", async () => {
      ensurePiperModelMock.mockRejectedValue(new Error("404 Not Found"));

      await expect(
        piperProvider.generate("hi", named({ voice: "xx_XX-nope-medium" })),
      ).rejects.toThrow(/Piper voice model not found: xx_XX-nope-medium/);
    });
  });

  describe("output", () => {
    it("converts the wav to mp3 and reports the measured duration", async () => {
      const result = await piperProvider.generate("hi", named());

      expect(wavToMp3Mock).toHaveBeenCalled();
      expect(result.durationMs).toBe(1500);
      expect(result.audio.toString()).toBe("mp3");
    });

    it("writes the narration text to piper's stdin", async () => {
      const children: FakeChildProcess[] = [];
      spawnMock.mockImplementation(() => {
        const child = spawnSuccessfulPiper();
        children.push(child);
        return child;
      });

      await piperProvider.generate("hello narration", named());

      expect((children[0] as any).stdin.write).toHaveBeenCalledWith("hello narration");
      expect((children[0] as any).stdin.end).toHaveBeenCalled();
    });
  });
});
