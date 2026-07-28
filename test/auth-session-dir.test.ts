import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { resolveSessionBaseDir } from "../src/auth.js";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "demo-reel-sessdir-"));
  await mkdir(join(dir, "project"), { recursive: true });
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("resolveSessionBaseDir", () => {
  // generate() passes the working directory, so dirname() would put session
  // state — including live auth cookies — one level ABOVE the project.
  it("uses the path itself when it is a directory", () => {
    const project = join(dir, "project");
    expect(resolveSessionBaseDir(project)).toBe(project);
  });

  // The CLI passes an actual config file, where the parent is correct.
  it("uses the parent when the path is a file", () => {
    const project = join(dir, "project");
    expect(resolveSessionBaseDir(join(project, "demo.config.ts"))).toBe(project);
  });

  it("treats a non-existent path as a file", () => {
    expect(resolveSessionBaseDir(join(dir, "nope", "cfg.ts"))).toBe(join(dir, "nope"));
  });
});
