import { EventEmitter } from "events";
import { vi } from "vitest";

/**
 * A ChildProcess double for the JSON-lines worker protocol.
 *
 * `emit*` helpers write to the child's stdout the way a real worker would;
 * `writeRaw` deliberately exposes chunk boundaries so tests can split a single
 * JSON message across two "data" events — the case that breaks naive parsers.
 */
export class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = { write: vi.fn(() => true) };
  kill = vi.fn();

  /** Everything the code under test has written to the worker's stdin. */
  get written(): string[] {
    return this.stdin.write.mock.calls.map((call) => call[0] as string);
  }

  /** Parsed JSON requests sent to the worker. */
  get requests(): any[] {
    return this.written
      .flatMap((chunk) => chunk.split("\n"))
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line));
  }

  /** Push bytes to stdout exactly as given — no framing added. */
  writeRaw(text: string): void {
    this.stdout.emit("data", Buffer.from(text));
  }

  /** Push one newline-terminated JSON message. */
  emitMessage(message: unknown): void {
    this.writeRaw(`${JSON.stringify(message)}\n`);
  }

  /** Push a message split across two stdout chunks at `at` characters in. */
  emitMessageSplit(message: unknown, at: number): void {
    const line = `${JSON.stringify(message)}\n`;
    this.writeRaw(line.slice(0, at));
    this.writeRaw(line.slice(at));
  }

  emitStderr(text: string): void {
    this.stderr.emit("data", Buffer.from(text));
  }

  emitClose(code: number | null): void {
    this.emit("close", code);
  }

  emitError(error: Error): void {
    this.emit("error", error);
  }
}

export const createFakeChildProcess = () => new FakeChildProcess();
