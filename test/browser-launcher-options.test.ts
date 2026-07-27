import { describe, it, expect, afterEach } from "vitest";

import { chromiumLaunchOptions } from "../src/browser/launcher.js";

const ENV_KEY = "DEMO_REEL_EXECUTABLE_PATH";
const original = process.env[ENV_KEY];

afterEach(() => {
  if (original === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = original;
});

describe("chromiumLaunchOptions", () => {
  it("uses the bundled browser when the env var is unset", () => {
    delete process.env[ENV_KEY];

    const opts = chromiumLaunchOptions(false);

    // Absent, not undefined — Playwright treats an explicit undefined the same,
    // but omitting it keeps the default path unambiguous.
    expect("executablePath" in opts).toBe(false);
    expect(opts.headless).toBe(true);
  });

  it("points at a host browser when the env var is set", () => {
    process.env[ENV_KEY] = "/usr/bin/brave";

    expect(chromiumLaunchOptions(false).executablePath).toBe("/usr/bin/brave");
  });

  it("ignores an empty env var rather than launching a browser at ''", () => {
    process.env[ENV_KEY] = "";

    expect("executablePath" in chromiumLaunchOptions(false)).toBe(false);
  });

  it("honours headed mode independently of the executable path", () => {
    delete process.env[ENV_KEY];
    expect(chromiumLaunchOptions(true).headless).toBe(false);

    process.env[ENV_KEY] = "/usr/bin/brave";
    expect(chromiumLaunchOptions(true).headless).toBe(false);
  });
});
