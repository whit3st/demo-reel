import { afterEach, describe, expect, it, vi } from "vitest";
import { getPiperReleaseName } from "../src/piper.js";

/**
 * The asset names below are the actual files published on the rhasspy/piper
 * 2023.11.14-2 release. Getting one wrong means `demo-reel` 404s while trying
 * to auto-download the TTS binary, on that platform only — which is invisible
 * to anyone developing on a different OS.
 *
 * The full published set is:
 *   piper_linux_aarch64.tar.gz   piper_linux_armv7l.tar.gz
 *   piper_linux_x86_64.tar.gz    piper_macos_aarch64.tar.gz
 *   piper_macos_x64.tar.gz       piper_windows_amd64.zip
 */
describe("getPiperReleaseName", () => {
  const original = { platform: process.platform, arch: process.arch };

  const setPlatform = (platform: string, arch: string) => {
    Object.defineProperty(process, "platform", { value: platform, configurable: true });
    Object.defineProperty(process, "arch", { value: arch, configurable: true });
  };

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: original.platform, configurable: true });
    Object.defineProperty(process, "arch", { value: original.arch, configurable: true });
    vi.restoreAllMocks();
  });

  it.each([
    ["linux", "x64", "piper_linux_x86_64.tar.gz"],
    ["linux", "arm64", "piper_linux_aarch64.tar.gz"],
    ["linux", "arm", "piper_linux_armv7l.tar.gz"],
    // The release ships piper_macos_*, not piper_darwin_* — process.platform
    // was interpolated straight into the filename, so every Mac 404'd.
    ["darwin", "arm64", "piper_macos_aarch64.tar.gz"],
    ["darwin", "x64", "piper_macos_x64.tar.gz"],
    ["win32", "x64", "piper_windows_amd64.zip"],
    // No piper_windows_aarch64.zip exists; Windows on ARM runs the x64 build
    // under emulation, so amd64 is the only asset that can succeed.
    ["win32", "arm64", "piper_windows_amd64.zip"],
  ])("%s/%s resolves to %s", (platform, arch, expected) => {
    setPlatform(platform, arch);
    expect(getPiperReleaseName()).toBe(expected);
  });

  it("never emits a darwin-named archive", () => {
    for (const arch of ["x64", "arm64"]) {
      setPlatform("darwin", arch);
      expect(getPiperReleaseName()).not.toContain("darwin");
    }
  });
});
