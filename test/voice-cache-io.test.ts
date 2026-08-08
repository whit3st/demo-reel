import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile, mkdir, readFile, chmod } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { getCached, setCache, cacheKey } from "../src/voice/cache.js";

/**
 * The cache lives under process.cwd(), so where the CLI is invoked from decides
 * where audio is cached. Real temp dirs here rather than an fs mock, because
 * the thing worth testing is the actual path construction and the miss-vs-error
 * behaviour, not that writeFile was called.
 */
describe("voice cache I/O", () => {
  let dir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    dir = await mkdtemp(join(tmpdir(), "demo-reel-cache-"));
    process.chdir(dir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(dir, { recursive: true, force: true });
  });

  it("returns null for a key that was never cached", async () => {
    await expect(getCached("nothing-here")).resolves.toBeNull();
  });

  it("round-trips audio through the cache", async () => {
    const audio = Buffer.from("fake mp3 payload");

    await setCache("abc123", audio);

    await expect(getCached("abc123")).resolves.toEqual(audio);
  });

  it("creates the cache directory on first write", async () => {
    await setCache("abc123", Buffer.from("x"));

    await expect(readFile(join(dir, ".demo-reel-cache", "voice", "abc123.mp3"))).resolves.toEqual(
      Buffer.from("x"),
    );
  });

  it("overwrites an existing entry for the same key", async () => {
    await setCache("abc123", Buffer.from("first"));
    await setCache("abc123", Buffer.from("second"));

    await expect(getCached("abc123")).resolves.toEqual(Buffer.from("second"));
  });

  // The cache path is cwd-relative, so running the CLI from a different
  // directory silently starts a fresh cache. Pinned because it is easy to
  // "fix" this into an absolute path and invalidate every user's cache.
  it("resolves the cache relative to the working directory", async () => {
    await setCache("abc123", Buffer.from("x"));

    const other = await mkdtemp(join(tmpdir(), "demo-reel-elsewhere-"));
    try {
      process.chdir(other);
      await expect(getCached("abc123")).resolves.toBeNull();
    } finally {
      process.chdir(dir);
      await rm(other, { recursive: true, force: true });
    }
  });

  // getCached swallows every error into null, so an unreadable file is
  // indistinguishable from a miss — the run just regenerates the audio rather
  // than failing, which is the behaviour we want.
  it("treats an unreadable cache entry as a miss", async () => {
    const cacheDir = join(dir, ".demo-reel-cache", "voice");
    await mkdir(cacheDir, { recursive: true });
    const file = join(cacheDir, "locked.mp3");
    await writeFile(file, "x");
    await chmod(file, 0o000);

    const result = await getCached("locked");

    await chmod(file, 0o644);
    // Only assert where the chmod actually bit: root ignores permission bits,
    // and on Windows fs.chmod only toggles the read-only flag, leaving the file
    // readable — so getCached would return the buffer rather than a miss.
    if (process.platform !== "win32" && process.getuid?.() !== 0) {
      expect(result).toBeNull();
    }
  });

  it("stores different keys as separate files", async () => {
    const voiceA = { provider: "piper", voice: "en_US-amy-medium", speed: 1.0 } as any;
    const voiceB = { provider: "piper", voice: "en_US-amy-medium", speed: 1.5 } as any;

    const keyA = cacheKey("hello", voiceA);
    const keyB = cacheKey("hello", voiceB);
    await setCache(keyA, Buffer.from("slow"));
    await setCache(keyB, Buffer.from("fast"));

    expect(keyA).not.toBe(keyB);
    await expect(getCached(keyA)).resolves.toEqual(Buffer.from("slow"));
    await expect(getCached(keyB)).resolves.toEqual(Buffer.from("fast"));
  });
});
