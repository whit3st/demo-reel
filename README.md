# Demo Reel

Create professional demo videos from web apps. Code your demos in TypeScript, record via Docker, with automatic voiceover and subtitles.

## Quick Start

```bash
pnpm add -D demo-reel@github:whit3st/demo-reel tsx
```

```typescript
// demos/signup.demo.ts
import { generate } from "demo-reel";

await generate({
  name: "signup",
  outputDir: "./output",
  video: { resolution: "FHD" },
  cursor: "dot",
  motion: "smooth",
  typing: "humanlike",
  timing: "normal",
  outputFormat: "mp4",

  voice: {
    provider: "elevenlabs",  // or "piper" (local/free) or "openai"
    voice: "your-voice-id",
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
    { narration: "Welcome to our app. Let's create a new project.", stepIndex: 0, isIntro: true },
    { narration: "Fill in the details and click Create.", stepIndex: 2 },
  ],

  steps: [
    // Scene 1
    { action: "hover", selector: { strategy: "testId", value: "new-project" }, delayAfterMs: 800 },
    { action: "click", selector: { strategy: "testId", value: "new-project" }, delayAfterMs: 1500 },

    // Scene 2
    { action: "type", selector: { strategy: "id", value: "name" }, text: "My Project", delayAfterMs: 500 },
    { action: "hover", selector: { strategy: "custom", value: "button[type='submit']" }, delayAfterMs: 600 },
    { action: "click", selector: { strategy: "custom", value: "button[type='submit']" }, delayAfterMs: 2000 },
  ],
}, { verbose: true });
```

```bash
npx tsx demos/signup.demo.ts
```

Output: `output/signup.mp4` + `.srt` + `.vtt` + `.meta.json`

## How It Works

1. **You write a `.demo.ts`** — TypeScript config with steps, scenes, and narration
2. **`generate()` handles everything** — compiles config, generates voiceover (via Docker), records the video (via Docker), outputs subtitles and metadata
3. **Docker runs the heavy stuff** — Chromium, FFmpeg, Piper TTS are in the Docker image, not on your machine

### Requirements

- **Docker** — for recording and voice generation
- **Node.js 18+** — for running your demo scripts
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

## Configuration

### Voice / TTS

```typescript
voice: {
  provider: "elevenlabs",           // "piper" (local/free) | "openai" | "elevenlabs"
  voice: "voice-id-or-model-name",  // e.g. "nl_NL-mls-medium" for Piper
  speed: 1.0,
  pronunciation: {                  // word replacements before TTS
    "template": "template",         // prevent Dutch pronunciation of English words
  },
},
```

Voiceover is auto-generated when `scenes` have `narration` text and `voice` is configured. Cached by content hash — only regenerates when narration changes.

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
  { narration: "Welcome to our app.", stepIndex: 0, isIntro: true },
  { narration: "Let's create something.", stepIndex: 3 },
],
```

- `narration` — voiceover text (also used for subtitles)
- `stepIndex` — which step starts this scene
- `isIntro` — marks the intro scene (used by presentation systems to skip context)

Generates `.srt`, `.vtt` (subtitles) and `.meta.json` (scene timestamps for interactive players).

### Steps

| Action | Description |
|--------|-------------|
| `goto` | Navigate to URL |
| `click` | Click an element |
| `hover` | Hover over element |
| `type` | Type text into input |
| `press` | Press a key |
| `scroll` | Scroll element |
| `select` | Select dropdown option(s) |
| `check` | Check/uncheck checkbox |
| `upload` | Upload files |
| `drag` | Drag and drop |
| `wait` | Wait for duration |
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
cursor: "dot" | "arrow" | "none"
motion: "smooth" | "snappy" | "instant"
typing: "humanlike" | "fast" | "instant"
timing: "normal" | "fast" | "instant"
video: { resolution: "HD" | "FHD" | "2K" | "4K" }
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
