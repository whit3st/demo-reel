# Demo Reel

![Coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/whit3st/demo-reel/main/.github/badges/coverage.json)
![Vulnerabilities](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/whit3st/demo-reel/main/.github/badges/security.json)

Create professional demo videos from web apps. Code your demos in TypeScript, with automatic voiceover and subtitles.

## Quick Start

```bash
pnpm add -D demo-reel
```

```typescript
// demos/signup.demo.ts
import { generate } from "demo-reel";

await generate(
  {
    name: "signup",
    outputDir: "./output",
    video: { resolution: "FHD" },
    cursor: "dot",
    motion: "smooth",
    typing: "humanlike",
    timing: "normal",
    outputFormat: "mp4",

    voice: {
      provider: "elevenlabs", // or "piper" (local/free) or "openai"
      voice: "5zhopMftSdRGaPYVcwKK",
    },

    auth: {
      loginSteps: [
        { action: "goto", url: "https://myapp.com/login" },
        { action: "type", selector: { strategy: "id", value: "email" }, text: "demo@example.com" },
        { action: "type", selector: { strategy: "id", value: "password" }, text: "password" },
        { action: "click", selector: { strategy: "class", value: "btn-primary" } },
      ],
      validate: {
        protectedUrl: "https://myapp.com/dashboard",
        successIndicator: { strategy: "custom", value: "h1:has-text('Dashboard')" },
      },
      storage: { name: "demo-session", types: ["cookies"] },
    },

    setup: [
      // Runs before recording (off-screen) — create test data, navigate
      { action: "goto", url: "https://myapp.com/dashboard" },
    ],

    cleanup: [
      // Runs after recording — delete test data
    ],

    scenes: [
      {
        narration: "Welcome to our app. Let's create a new project.",
        isIntro: true,
        steps: [
          {
            action: "hover",
            selector: { strategy: "testId", value: "new-project" },
            delayAfterMs: 800,
          },
          {
            action: "click",
            selector: { strategy: "testId", value: "new-project" },
            delayAfterMs: 1500,
          },
        ],
      },
      {
        narration: "Fill in the details and click Create.",
        steps: [
          {
            action: "type",
            selector: { strategy: "id", value: "name" },
            text: "My Project",
            delayAfterMs: 500,
          },
          {
            action: "hover",
            selector: { strategy: "custom", value: "button[type='submit']" },
            delayAfterMs: 600,
          },
          {
            action: "click",
            selector: { strategy: "custom", value: "button[type='submit']" },
            delayAfterMs: 2000,
          },
        ],
      },
    ],
  },
  { verbose: true },
);
```

```bash
npx tsx demos/signup.demo.ts
```

Output: `output/signup.mp4` + `.srt` + `.vtt` + `.meta.json`

## How It Works

1. **You write a `.demo.ts`** — TypeScript config with steps, scenes, and narration
2. **`generate()` handles everything** — compiles config, generates voiceover, records the video, outputs subtitles and metadata

### Requirements

- **Node.js 18+** — for running your demo scripts
- **Playwright** — `pnpm exec playwright install chromium` (peer dependency)
- **FFmpeg** — for video/audio processing (installed via `ffmpeg-static` or system package)
- **Piper** (optional) — for local TTS voiceover (`pip install piper-tts` or download from https://github.com/rhasspy/piper)
- **API keys** (optional) — `ELEVENLABS_KEY` or `OPENAI_API_KEY` for cloud TTS

## Claude Code Integration

Build demo scripts interactively with Claude Code:

```bash
pnpm demo-reel setup   # shows how to install the /demo-script plugin
```

Then use `/demo-script` in Claude Code:

```
/demo-script https://myapp.com show the signup flow
```

Claude crawls your app, builds the script with you scene by scene, and generates the `.demo.ts`.

## Track CLI

Use `track` when you already know the flow you want to capture and want AI to start from your real interactions instead of re-exploring the app.

```bash
demo-reel track --name=create-template
demo-reel track --name=create-template --url=app.example.com/templates
demo-reel track --name=create-template --session=my-app --url=app.example.com/templates
```

That opens a headed Playwright browser, optionally navigates to the provided URL first, and writes `create-template.track.json` in the current directory when you close the browser or press `q` in the terminal.

If `--url` does not include a scheme, `track` prepends `https://` automatically.

`track` also supports pause/resume controls in the terminal:

- `r` resumes recording
- `p` pauses recording
- `q` stops and writes the track file

For login-heavy flows, use `--session <name>`. That starts `track` paused, restores any previously saved auth state, and enables:

- `s` to save the current browser session into `.demo-reel-sessions/<name>.json`

Recommended auth-safe flow:

1. Run `demo-reel track --name=create-template --session=my-app --url=app.example.com/templates`
2. Log in while recording is paused
3. Press `s` to save the session
4. Press `r` to start recording the real demo flow

The written `.track.json` is normalized for AI consumption before it is saved.

It still reflects your real flow, but it now collapses noisy low-level browser activity:

- scroll bursts become a small number of meaningful scroll events
- typing bursts become final field values instead of one event per keystroke
- duplicate navigation bursts are reduced
- obvious weak selectors like generic buttons are upgraded when possible

See `TRACKING.md` for the raw file format and guidance for AI tools that consume `.track.json` files.

## Configuration

### Voice / TTS

```typescript
voice: {
  provider: "piper",             // "piper" | "openai" | "elevenlabs"
  voice: "en_US-amy-medium",      // any voice name or ID supported by the provider
  speed: 1.0,
  pronunciation: {                // word replacements before TTS
    "template": "template",       // prevent Dutch pronunciation of English words
  },
},
```

Voiceover is auto-generated when `scenes` have `narration` text and `voice` is configured. Cached by content hash — only regenerates when narration changes.

#### Provider Details

**Piper** (local, free) — voice is a model name like `en_US-amy-medium`. Models are loaded from `$PIPER_VOICE_DIR` (defaults to `~/.local/share/piper-voices`). Must match an `.onnx` file in that directory. For custom models, use `voicePath` instead of `voice`:

```typescript
voice: {
  provider: "piper",
  voicePath: "/path/to/custom-voice.onnx",
  speed: 1.0,
}
```

**OpenAI** — voice is an OpenAI TTS voice name (e.g. `alloy`, `nova`, `shimmer`). Requires `OPENAI_API_KEY` env var.

**ElevenLabs** — voice is an ElevenLabs voice ID string. Requires `ELEVENLABS_KEY` or `ELEVENLABS_API_KEY` env var.

### Setup & Cleanup

```typescript
setup: [
  // Runs in a separate browser BEFORE recording (not visible in video)
  { action: "goto", url: "https://myapp.com/" },
  { action: "click", selector: { strategy: "id", value: "create-workspace" } },
],

cleanup: [
  // Runs AFTER recording (even on failure) — delete test data
  { action: "goto", url: "https://myapp.com/admin" },
  { action: "click", selector: { strategy: "custom", value: "button.delete" } },
],
```

Setup and cleanup run in tolerant mode — failed steps are skipped.

### Scenes & Subtitles

```typescript
scenes: [
  {
    narration: "Welcome to our app.",
    isIntro: true,
    steps: [
      { action: "goto", url: "https://myapp.com" },
      { action: "wait", ms: 1500 },
    ],
  },
  {
    narration: "Let's create something.",
    steps: [
      { action: "click", selector: { strategy: "id", value: "create" } },
    ],
  },
],
```

- `narration` — voiceover text (also used for subtitles)
- `steps` — steps that belong to this scene
- `isIntro` — marks the intro scene (used by presentation systems to skip context)

Generates `.srt`, `.vtt` (subtitles) and `.meta.json` (scene timestamps for interactive players).

> **Legacy compatibility:** You can also use the older format with a single top-level `steps` array and `scenes` referencing `stepIndex`. The two formats cannot be mixed.

### Steps

| Action    | Description                                                          |
| --------- | -------------------------------------------------------------------- |
| `goto`    | Navigate to URL                                                      |
| `click`   | Click an element                                                     |
| `hover`   | Hover over element                                                   |
| `type`    | Type text into input                                                 |
| `press`   | Press a key                                                          |
| `scroll`  | Scroll element                                                       |
| `select`  | Select dropdown option(s)                                            |
| `check`   | Check/uncheck checkbox                                               |
| `upload`  | Upload files                                                         |
| `drag`    | Drag and drop                                                        |
| `wait`    | Wait for duration                                                    |
| `waitFor` | Wait for condition (selector, URL, load state, network, JS function) |

### Selectors

```typescript
{ strategy: "testId", value: "submit-button" }     // data-testid
{ strategy: "id", value: "username" }               // id (no #)
{ strategy: "class", value: "btn-primary" }         // class (no .)
{ strategy: "href", value: "/dashboard" }           // link href
{ strategy: "custom", value: "button:has-text('Save')" }  // any CSS selector
{ strategy: "class", value: "card", index: 2 }      // nth match
```

### Presets

```typescript
cursor: "dot" | "arrow" | "none";
motion: "smooth" | "snappy" | "instant";
typing: "humanlike" | "fast" | "instant";
timing: "normal" | "fast" | "instant";
video: {
  resolution: "HD" | "FHD" | "2K" | "4K";
}
```

## Modular Video Series

Demo videos are designed as standalone segments that also work as a series:

```
demos/
└── my-app/
    ├── 01-signup/signup.demo.ts          # setup: create workspace
    ├── 02-create-project/project.demo.ts # setup: create workspace + template
    └── 03-editor/editor.demo.ts          # setup: create workspace + template + project
```

Each video has its own `setup` that recreates the required state. Later videos have heavier setup. Every video is independently recordable.

## CI/CD

```yaml
name: Generate Demo Videos
on: push

jobs:
  demos:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install
      - run: npx tsx demos/01-signup/signup.demo.ts
        env:
          ELEVENLABS_KEY: ${{ secrets.ELEVENLABS_KEY }}
      - uses: actions/upload-artifact@v4
        with:
          name: demo-videos
          path: ./output/*.mp4
```

## License

MIT
