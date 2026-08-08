import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 10000,
    hookTimeout: 10000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.d.ts",
        // Thin glue over the OpenAI SDK: a dynamic import, an unchecked cast
        // and one API call. Any test here would assert that a mock was called.
        "src/voice/openai.ts",
        // A single-app exploration script (hardcoded #username/#password/
        // /login selectors) whose exported helpers are tested in
        // explore.test.ts and explore-extract.browser.test.ts; the rest is
        // main(), an interactive crawl driver.
        "src/script/explore.ts",
      ],
    },
  },
});
