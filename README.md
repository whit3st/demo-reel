# Demo Reel

Create beautiful demo videos from web apps using Playwright. Perfect for showcasing features, creating onboarding tutorials, or documenting workflows.

## Installation

```bash
npm install -D demo-reel playwright
```

Or use without installing:

```bash
npx demo-reel --config ./my-demo.ts
```

## Quick Start

1. Create a config file `demo-reel.config.ts`:

```typescript
import { defineConfig } from 'demo-reel';

export default defineConfig({
  viewport: { width: 1920, height: 1080 },
  video: {
    enabled: true,
    size: { width: 1920, height: 1080 },
  },
  name: 'my-demo',
  steps: [
    { action: 'goto', url: 'https://example.com' },
    { action: 'wait', ms: 2000 },
  ],
});
```

2. Run it:

```bash
npx demo-reel
```

## CLI Usage

```bash
# Run default config (demo-reel.config.ts)
npx demo-reel

# Run a specific scenario
npx demo-reel onboarding

# Run all scenarios
npx demo-reel --all

# Dry run (validate config)
npx demo-reel --dry-run

# Show browser window (non-headless)
npx demo-reel --headed

# Override output directory
npx demo-reel --output-dir ./public/videos
```

## Configuration

### Config File Discovery

The CLI looks for configs in this order:
1. `demo-reel.config.ts` (default)
2. `<scenario>.demo.ts` (when specifying a scenario name)
3. All `*.demo.ts` files (with `--all` flag)

### Output Naming

Videos are named based on this priority:
1. `outputPath` in config (full path)
2. `name` + `outputDir` in config
3. Config filename (e.g., `onboarding.demo.ts` → `onboarding.webm`)
4. Default: `demo-reel.webm`

### Available Steps

- `goto` - Navigate to URL
- `click` - Click an element
- `hover` - Hover over element
- `type` - Type text into input
- `press` - Press a key
- `scroll` - Scroll element
- `select` - Select option(s)
- `check` - Check/uncheck checkbox
- `upload` - Upload file(s)
- `drag` - Drag element to target
- `wait` - Wait for duration
- `waitFor` - Wait for condition (selector, URL, loadState, request, response, function)

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
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx playwright install chromium
      - run: npx demo-reel --all
      - uses: actions/upload-artifact@v4
        with:
          name: demo-videos
          path: ./videos/*.webm
```

## Features

### Human-Like Cursor Movement
- Smooth Bezier curve paths with ease-in/out timing
- Configurable speed, curve offset, and step count
- Visual cursor overlay (SVG or dot style)

### Natural Typing
- Variable delays based on character type
- Longer pauses for spaces, punctuation, and newlines

### Smart Delays
- Built-in delays after page navigation
- Per-step delays before/after actions
- Final delay to keep video open

## License

MIT
