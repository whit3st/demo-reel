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

### 1. Create a Config File

Create `demo-reel.config.ts` in your project root:

```typescript
import { defineConfig } from 'demo-reel';

export default defineConfig({
  viewport: { width: 1920, height: 1080 },
  video: { enabled: true, size: { width: 1920, height: 1080 } },
  name: 'my-demo',
  steps: [
    { action: 'goto', url: 'https://example.com' },
    { action: 'wait', ms: 2000 },
  ],
});
```

### 2. Run the Demo

```bash
npx demo-reel
```

Output: `videos/my-demo.mp4`

## CLI Usage

```bash
# Run default config
npx demo-reel

# Run specific scenario
npx demo-reel onboarding

# Run all scenarios
npx demo-reel --all

# Validate config without recording
npx demo-reel --dry-run

# Verbose output
npx demo-reel --verbose
```

## Configuration

### Config File Discovery

The CLI looks for configs in this order:
1. `demo-reel.config.ts` (default)
2. `<scenario>.demo.ts` (when specifying scenario name)
3. All `*.demo.ts` files (with `--all` flag)

### Available Steps

- `goto` - Navigate to URL
- `click` - Click an element
- `hover` - Hover over element
- `type` - Type text into input
- `press` - Press a key
- `scroll` - Scroll element
- `wait` - Wait for duration
- `waitFor` - Wait for condition

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
