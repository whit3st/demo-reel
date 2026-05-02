# Demo Reel

![Coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/whit3st/demo-reel/main/.github/badges/coverage.json)

Dual-mode automation toolkit for browser flows:
- `mode: "video"` for narrated product demos with subtitles and metadata.
- `mode: "e2e"` for assertion-driven test execution with retries, parallelism, and CI reports.

## Install

```bash
pnpm add -D demo-reel
```

## CLI Overview

```bash
demo-reel run <video|e2e> [scenario|path] [options]
demo-reel validate <scenario|path>
demo-reel list [--grep <text>]
```

Common flags:
- `--tag <tag>[,<tag>]`
- `--grep <text>`
- `--verbose`, `--headed`

E2E execution flags:
- `--retries <n>`
- `--repeat <n>`
- `--parallel <n>`
- `--fail-fast`

## Video Authoring

Use `mode: "video"` when you want media output (`.mp4`/`.webm`, `.srt`, `.vtt`, `.meta.json`).

Example config (`demos/signup.demo.ts`):

```ts
import { defineConfig } from "demo-reel";

export default defineConfig({
  mode: "video",
  name: "signup",
  outputDir: "./output",
  outputFormat: "mp4",

  video: { resolution: "FHD" },
  cursor: "dot",
  motion: "smooth",
  typing: "humanlike",
  timing: "normal",

  voice: {
    provider: "openai",
    voice: "alloy",
    speed: 1,
  },

  setup: [{ action: "goto", url: "https://app.example.com/login" }],

  scenes: [
    {
      narration: "Welcome to the signup flow.",
      isIntro: true,
      steps: [
        { action: "goto", url: "https://app.example.com" },
        { action: "click", selector: { strategy: "testId", value: "start-signup" } },
      ],
    },
    {
      narration: "Fill the account details and submit.",
      steps: [
        {
          action: "type",
          selector: { strategy: "id", value: "email" },
          text: "demo@example.com",
        },
        {
          action: "click",
          selector: { strategy: "custom", value: "button[type='submit']" },
        },
      ],
    },
  ],
});
```

Run video mode:

```bash
demo-reel run video demos/signup.demo.ts --verbose
```

Expected artifacts:
- `output/signup.mp4`
- `output/signup.mp4.srt`
- `output/signup.mp4.vtt`
- `output/signup.meta.json`

## E2E Testing

Use `mode: "e2e"` when you want assertions, retries, and CI-friendly reports.

Example config (`tests/checkout.e2e.demo.ts`):

```ts
import { defineConfig } from "demo-reel";

export default defineConfig({
  mode: "e2e",
  name: "checkout",

  report: {
    formats: ["dot", "json", "junit"],
    outputDir: "./artifacts/e2e",
    includeStepLogs: true,
  },

  execution: {
    retries: 2,
    repeat: 1,
    parallel: 2,
    failFast: true,
  },

  steps: [
    { action: "goto", url: "https://app.example.com/cart" },
    { action: "click", selector: { strategy: "testId", value: "checkout" } },
    {
      action: "type",
      selector: { strategy: "id", value: "cardNumber" },
      text: "4242424242424242",
    },
    { action: "click", selector: { strategy: "testId", value: "submit-order" } },
  ],

  checkpoints: [
    {
      atStep: 3,
      expect: [
        { type: "expectUrl", url: /\/checkout\/success$/ },
        { type: "expectVisible", selector: { strategy: "testId", value: "order-success" } },
      ],
    },
  ],
});
```

Run e2e mode:

```bash
demo-reel run e2e tests/checkout.e2e.demo.ts --retries 1 --parallel 4
```

Generated reports (based on `report.formats`):
- `report.json`
- `junit.xml`
- dot terminal output

Exit codes:
- `0`: pass
- `1`: test/assertion failures
- `2`: framework/config/runtime failures

## Mode-Specific Config

`video`-only fields:
- `voice`
- `audio`
- cinematic video concerns (`cursor`, `motion`, narration/subtitles workflow)

`e2e`-only fields:
- `report`
- `execution`
- `checkpoints`
- `qualityGates`

Cross-mode fields are rejected at schema parse time.

## Migration Notes (Legacy -> Explicit Mode)

If you used older configs without `mode`, migrate to explicit discriminated mode.

1. Add `mode: "video"` for demo generation configs.
2. Add `mode: "e2e"` for test suites.
3. Keep mode-specific fields only in matching mode.
4. Prefer scene-owned video steps (`scenes[].steps`) over manual index wiring.

Legacy compatibility note:
- Legacy scene shape (`scenes[].stepIndex`) is still accepted in video mode during transition.
- Do not mix legacy and scene-owned forms in the same config.

## CI Examples

### Video CI

```yaml
name: Demo Video
on: [workflow_dispatch]

jobs:
  video:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: pnpm install --frozen-lockfile
      - run: pnpm demo-reel run video demos/dictionary-search.demo.ts --verbose
      - uses: actions/upload-artifact@v4
        with:
          name: demo-video
          path: output/*
```

### E2E CI

```yaml
name: E2E Checks
on: [pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: pnpm install --frozen-lockfile
      - run: pnpm demo-reel run e2e tests/checkout.e2e.demo.ts --parallel 4 --retries 1
      - uses: actions/upload-artifact@v4
        with:
          name: e2e-reports
          path: artifacts/e2e/*
```

## Validate and Discover

Validate config:

```bash
demo-reel validate demos/dictionary-search.demo.ts
```

List scenarios:

```bash
demo-reel list
demo-reel list --grep checkout
```

## License

MIT
