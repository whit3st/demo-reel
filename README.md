# Demo Reel

Create beautiful demo videos from web apps using Playwright. Perfect for showcasing features, creating onboarding tutorials, or documenting workflows.

## What is Demo Reel?

Demo Reel is a developer-first tool for creating professional demo videos from web applications. Unlike manual screen recording, Demo Reel uses Playwright automation to create pixel-perfect, reproducible demos.

**Key Benefits:**

- **Code as Config**: Demo configurations are TypeScript files
- **Version Controlled**: Track demo changes in git
- **CI/CD Ready**: Generate videos in automated pipelines
- **Human-Like**: Natural cursor movements and typing
- **Audio Support**: Mix narration and background music

## Installation

```bash
npm install -D demo-reel playwright
```

## Quick Start

### 1. Initialize a Demo Scenario

```bash
npx demo-reel init
```

This creates `example.demo.ts` in your project.

### 2. Run the Demo

```bash
npx demo-reel
```

Output: `videos/example.mp4`

## CLI Usage

```bash
demo-reel init                        # Create example.demo.ts
demo-reel                             # Run all *.demo.ts files
demo-reel onboarding                  # Run onboarding.demo.ts
demo-reel --all                       # Run all *.demo.ts files
demo-reel --dry-run                   # Validate config without recording
demo-reel --headed                    # Show browser window
demo-reel -o ./public/videos          # Override output directory
demo-reel --verbose                   # Show detailed output
```

## Configuration

### Scenario Files

Demo scenarios are `.demo.ts` files containing your configuration:

```typescript
import { defineConfig } from "demo-reel";

export default defineConfig({
  video: {
    resolution: "FHD", // HD | FHD | 2K | 4K or custom size
  },
  name: "my-demo",
  outputFormat: "webm", // 'webm' | 'mp4'
  steps: [
    { action: "goto", url: "https://example.com" },
    { action: "wait", ms: 2000 },
  ],
});
```

### Built-in Presets

Demo Reel includes presets for cursor, motion, typing, and timing. Use string shortcuts for quick setup:

```typescript
export default defineConfig({
  cursor: "dot", // 'dot' | 'arrow' | 'none'
  motion: "smooth", // 'smooth' | 'snappy' | 'instant'
  typing: "humanlike", // 'humanlike' | 'fast' | 'instant'
  timing: "normal", // 'normal' | 'fast' | 'instant'
  // ...
});
```

Or customize individual settings:

```typescript
export default defineConfig({
  cursor: { type: "dot", size: 16, borderWidth: 2 },
  motion: { moveDurationMs: 400, clickDelayMs: 50 },
  // ...
});
```

#### Cursor Presets

| Preset  | Description                             |
| ------- | --------------------------------------- |
| `dot`   | Colored dot cursor (12px, white border) |
| `arrow` | Classic SVG arrow cursor                |
| `none`  | No cursor overlay                       |

#### Motion Presets

| Preset    | Description                                |
| --------- | ------------------------------------------ |
| `smooth`  | Natural curved movement (600ms, 25+ steps) |
| `snappy`  | Faster direct movement (300ms, 15 steps)   |
| `instant` | Teleporting (no animation)                 |

#### Typing Presets

| Preset      | Description                           |
| ----------- | ------------------------------------- |
| `humanlike` | Realistic variable delays (80ms base) |
| `fast`      | Quick natural typing (40ms base)      |
| `instant`   | No delay                              |

#### Timing Presets

| Preset    | Description                        |
| --------- | ---------------------------------- |
| `normal`  | Balanced delays (2000ms goto/ end) |
| `fast`    | Reduced waits (1000ms)             |
| `instant` | Minimal delays (0ms)               |

### Video Resolution

Choose a preset or provide a custom size:

```typescript
video: { resolution: "FHD" }
// or
video: { resolution: { width: 2560, height: 1440 } }
```

| Preset | Resolution |
| ------ | ---------- |
| `HD`   | 1280x720   |
| `FHD`  | 1920x1080  |
| `2K`   | 2560x1440  |
| `4K`   | 3840x2160  |

### Available Steps

- `goto` - Navigate to URL
- `click` - Click an element
- `hover` - Hover over element
- `type` - Type text into input
- `press` - Press a key
- `scroll` - Scroll element
- `select` - Select option(s) in dropdown
- `check` - Check or uncheck checkbox
- `upload` - Upload files
- `drag` - Drag and drop element
- `wait` - Wait for duration
- `waitFor` - Wait for condition (selector, URL, function, etc.)

### Selector Strategies

```typescript
// By test ID (data-testid attribute)
{ strategy: 'testId', value: 'submit-button' }

// By ID (without #)
{ strategy: 'id', value: 'username' }

// By class (without .)
{ strategy: 'class', value: 'btn-primary' }

// By href
{ strategy: 'href', value: '/dashboard' }

// By data-node-id
{ strategy: 'data-node-id', value: 'node-123' }

// By custom selector
{ strategy: 'custom', value: '.card[data-state="open"]' }

// Select a specific match (0-based index)
{ strategy: 'class', value: 'nav-link', index: 1 }
```

### Type Clear Option

Clear an input before typing:

```typescript
{ action: 'type', selector: { strategy: 'id', value: 'email' }, text: 'user@example.com', clear: true }
```

## Features

### Human-Like Cursor Movement

Smooth Bezier curve paths with configurable speed and easing.

### Natural Typing

Variable delays based on character type (spaces, punctuation, etc.)

### Audio Support

Mix narration and background music:

```typescript
audio: {
  narration: './voiceover.mp3',
  narrationDelay: 2000,  // Delay before narration starts
  background: './music.mp3',
  backgroundVolume: 0.3,
}
```

Audio output requires `outputFormat: 'mp4'`.

## CI/CD Integration

Example GitHub Actions workflow:

```yaml
name: Generate Demo Videos
on: push

jobs:
  demos:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx playwright install chromium
      - run: npx demo-reel --all
      - uses: actions/upload-artifact@v4
        with:
          name: demo-videos
          path: ./videos/*.mp4
```

## License

MIT
