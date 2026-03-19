# Demo Reel Implementation Plan

## Overview
Transform from a Playwright test-based prototype to a professional CLI tool for generating demo videos.

## Philosophy
- **Convention over configuration**: `npx demo-reel` just works
- **TypeScript-first**: `defineConfig()` gives autocomplete, no JSON schema needed
- **Multiple scenarios**: Run single config or all `*.demo.ts` files
- **CI/CD ready**: Works great in GitHub Actions, GitLab CI, etc.

---

## Phase 1: Project Restructure

### 1.1 Directory Layout
```
src/
├── index.ts              # Public API exports
├── cli.ts                # CLI entry point
├── config-loader.ts      # Load and validate configs
├── runner.ts             # Playwright video runner
├── video-handler.ts      # Manage video output/naming
├── schemas.ts            # Zod schemas (extracted)
└── types.ts              # TypeScript type definitions
templates/
├── demo-reel.config.ts   # Starter template
└── scenario.demo.ts      # Example scenario template
```

### 1.2 Package.json Updates
- Add `bin` entry: `"demo-reel": "./dist/cli.js"`
- Add build script for TypeScript compilation
- Update exports for programmatic API
- Add peer dependency for Playwright

---

## Phase 2: Core Module Extraction

### 2.1 Extract Types and Schemas
Move Zod schemas from `tests/e2e.config.ts` to `src/schemas.ts`:
- All step schemas (goto, click, type, wait, etc.)
- Cursor schemas (dot, svg)
- Motion, typing, timing schemas
- Main config schema with output fields

### 2.2 Refactor Adapter Code
Move logic from `tests/e2e.adapter.ts` to `src/runner.ts`:
- Mouse state management
- Bezier curve movement
- Human-like typing delays
- Cursor overlay injection
- Step execution engine

Remove Playwright test dependencies - run programmatically.

---

## Phase 3: Config System

### 3.1 Define Config Function
```typescript
// src/index.ts
export function defineConfig(config: DemoReelConfig): DemoReelConfig {
  return config;
}
```

### 3.2 Extended Config Schema
```typescript
interface DemoReelConfig {
  viewport: ViewportConfig;
  video: VideoConfig;
  cursor: CursorConfig;
  motion: MotionConfig;
  typing: TypingConfig;
  timing: TimingConfig;
  steps: Step[];
  
  // New fields
  name?: string;
  outputDir?: string;
  outputPath?: string;
  concurrency?: number;
}
```

### 3.3 Config Loader
Support multiple formats:
- `demo-reel.config.ts` - Main config (TypeScript)
- `*.demo.ts` - Scenario files
- Dynamic import with tsx for TypeScript support
- Resolve relative paths from config file location

---

## Phase 4: CLI Implementation

### 4.1 Entry Point
```typescript
// src/cli.ts
#!/usr/bin/env node
// Use process.argv for minimal argument parsing
```

### 4.2 CLI Behavior
```bash
# Default: find and run demo-reel.config.ts
npx demo-reel

# Run specific scenario
npx demo-reel onboarding
# Looks for: onboarding.demo.ts, onboarding.config.ts

# Run all scenarios in directory
npx demo-reel --all
# Finds all *.demo.ts files

# Override output directory
npx demo-reel --output-dir ./public/videos

# Dry run (validate config without recording)
npx demo-reel --dry-run

# Verbose logging
npx demo-reel --verbose
```

### 4.3 Resolution Order
1. If argument provided: look for arg.demo.ts or arg.config.ts
2. If no argument: look for demo-reel.config.ts
3. If --all: find all *.demo.ts in project

---

## Phase 5: Video Output Handling

### 5.1 Output Naming Priority
1. outputPath in config (absolute/relative path with filename)
2. name + outputDir in config
3. Config filename (e.g., onboarding.demo.ts to onboarding.webm)
4. Default: demo-reel.webm in current directory

### 5.2 Video Lifecycle
1. Playwright records to temp directory
2. After successful run, copy/rename to final destination
3. Clean up temp files
4. Log output path on completion

### 5.3 CI/CD Integration
- Exit code 0 on success, 1 on failure
- Stderr for errors, stdout for progress
- Videos can be uploaded as artifacts

---

## Phase 6: Multiple Config Discovery

### 6.1 Scenario Discovery
```typescript
const scenarios = await glob('**/*.demo.ts', {
  ignore: ['node_modules/**', 'dist/**']
});
```

### 6.2 Execution Modes
- **Sequential** (default): Run one at a time
- **Parallel** (future): Run independent scenarios concurrently

### 6.3 Progress Reporting
```
✓ onboarding-flow (3.2s) → ./videos/onboarding-flow.webm
✓ checkout-demo (5.1s) → ./videos/checkout-demo.webm
```

---

## Phase 7: Packaging and Distribution

### 7.1 Build Process
- TypeScript compilation to dist/
- Preserve type definitions
- Include templates in package

### 7.2 Installation Patterns

As dev dependency:
```bash
npm install -D demo-reel
npx demo-reel
```

One-off usage:
```bash
pnpx demo-reel --config ./my-demo.ts
```

CI/CD:
```yaml
- run: npx demo-reel --all
- uses: actions/upload-artifact@v4
  with:
    name: demo-videos
    path: ./public/videos/*.webm
```

---

## Phase 8: Developer Experience

### 8.1 Init Command (Future)
```bash
npx demo-reel init
# Creates demo-reel.config.ts from template
```

### 8.2 Debugging
```bash
# Show browser window (non-headless)
npx demo-reel --headed

# Slow motion
npx demo-reel --slow-mo 100

# Step through
npx demo-reel --debug
```

---

## Implementation Order

1. **Phase 1**: Restructure directories, update package.json
2. **Phase 2**: Extract and refactor core modules
3. **Phase 3**: Build config system with defineConfig
4. **Phase 4**: Create CLI with basic argument parsing
5. **Phase 5**: Implement video output handling
6. **Phase 6**: Add multiple config discovery
7. **Phase 7**: Set up build and packaging
8. **Phase 8**: Polish DX, add templates

---

## Migration Path

For existing prototype:
1. Move tests/e2e.adapter.ts to src/runner.ts
2. Move tests/e2e.config.ts schemas to src/schemas.ts
3. Create src/index.ts with defineConfig export
4. Create src/cli.ts entry point
5. Convert hardcoded config to template
6. Remove Playwright test dependencies
7. Test with new CLI

---

## Success Criteria

- [ ] npx demo-reel runs a config file
- [ ] Config files get autocomplete via TypeScript
- [ ] Video outputs with proper naming
- [ ] Can run multiple scenarios with --all
- [ ] Works in CI/CD pipelines
- [ ] Programmatic API available

---

## Future Enhancements

- Audio recording/narration support
- Post-processing hooks (compress, watermark)
- GitHub Action for marketplace
- VS Code extension
- Cloud recording (Browserless, etc.)
