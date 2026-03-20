# Demo Reel Roadmap

This document outlines planned features for demo-reel, organized by priority and implementation phase.

---

## Phase 1: GitHub Action (High Priority)

**Status:** Planned  
**Goal:** Enable CI/CD integration for automated demo generation

### Features
- [ ] Create `action.yml` for GitHub Marketplace
- [ ] Support configurable inputs:
  - `config-path`: Path to demo config file or directory
  - `output-dir`: Where to save generated videos
  - `upload-artifacts`: Auto-upload to GitHub artifacts
  - `comment-pr`: Post video links in PR comments
- [ ] Example workflow templates for common use cases
- [ ] Support for demo-reel@beta and stable versions

### Use Cases
- Auto-generate product demos on every PR
- Create visual regression tests
- Build landing page videos in CI/CD
- Documentation videos that stay in sync with code

### Example Workflow
```yaml
name: Generate Demo Videos
on: [push, pull_request]

jobs:
  demos:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: demo-reel/action@v1
        with:
          config-path: './demos'
          upload-artifacts: true
          comment-pr: true
```

---

## Phase 2: GIF Export

**Status:** Planned  
**Goal:** Generate optimized GIFs for documentation and social media

### Features
- [ ] Add `export.format: 'gif'` config option
- [ ] Support multiple export formats: MP4, WebM, GIF
- [ ] Auto-optimize GIFs for file size:
  - Color palette reduction
  - Frame rate adjustment
  - Resolution scaling
- [ ] Configurable GIF settings:
  - `gif.fps`: Frame rate (default: 10)
  - `gif.width`: Max width (default: 480)
  - `gif.colors`: Color palette size (default: 128)
  - `gif.quality`: Quality vs size tradeoff

### Use Cases
- README documentation
- Social media posts (Twitter, LinkedIn)
- GitHub issue/PR illustrations
- Blog posts and tutorials
- Lightweight embeds

### Example Config
```typescript
export default defineConfig({
  name: 'feature-demo',
  export: {
    format: 'gif',
    gif: {
      fps: 15,
      width: 640,
      colors: 256,
    }
  },
  steps: [...]
});
```

---

## Phase 3: Human-Like Randomization

**Status:** Planned  
**Goal:** Make automated demos feel more natural and less robotic

### Features
- [ ] Add `randomization` config section
- [ ] Motion randomization:
  - Vary cursor speed (±variance%)
  - Randomize curve offset slightly
  - Add micro-pauses between movements
- [ ] Typing randomization:
  - Vary typing speed per character
  - Occasional "correction" pauses
  - Realistic rhythm variation
- [ ] Timing randomization:
  - Add small delays between steps
  - Vary wait durations slightly

### Configuration
```typescript
export default defineConfig({
  randomization: {
    enabled: true,      // Master switch
    variance: 0.2,      // 20% variation (0.0 - 1.0)
    
    motion: {
      enabled: true,
      speedVariance: 0.15,
      curveVariance: 0.1,
    },
    
    typing: {
      enabled: true,
      speedVariance: 0.25,
      addTypos: false,  // Future: simulate and correct typos
    },
    
    timing: {
      enabled: true,
      delayVariance: 0.1,
    }
  },
  steps: [...]
});
```

### Benefits
- Demos feel more authentic
- Harder to detect as automated
- More engaging for viewers
- Natural human variation

---

## Phase 4: Parallel Execution

**Status:** Planned  
**Goal:** Run multiple demo scenarios concurrently

### Features
- [ ] Run multiple `.demo.ts` files in parallel
- [ ] Configurable concurrency limit
- [ ] Progress reporting for each scenario
- [ ] Resource management (browser instances)
- [ ] Aggregate results and reports
- [ ] Fail-fast vs continue-on-error options

### CLI Usage
```bash
# Run all demos in parallel
npx demo-reel --all --parallel

# Run specific demos in parallel
npx demo-reel onboarding checkout pricing --parallel

# Control concurrency
npx demo-reel --all --parallel --max-concurrent 4
```

### Config Options
```typescript
export default defineConfig({
  // Each demo file can have its own config
  name: 'onboarding-demo',
  
  // Global parallel settings (in main config)
  parallel: {
    enabled: true,
    maxConcurrent: 3,  // Limit concurrent browsers
    failFast: false,   // Continue if one fails
  }
});
```

### Benefits
- Faster CI/CD pipelines
- Run entire test suite quickly
- Better resource utilization
- Multiple product demos in one go

### Technical Considerations
- CPU/RAM usage with multiple browsers
- Video encoding overhead
- Progress reporting complexity
- Error handling and cleanup

---

## Future Ideas (Phase 5+)

### Multi-Viewport Recording
- Record desktop + mobile + tablet simultaneously
- Export as split-screen or picture-in-picture
- Perfect for responsive design demos

### Interactive Recording Mode
- Browse the app manually while recording
- Auto-generate config from your actions
- Pause to narrate, resume automation

### Subtitle Generation
- Auto-generate SRT/VTT from narration
- Support multiple languages
- Perfect for accessibility

### Click Effects & Annotations
- Visual ripple on clicks
- Auto-zoom to important elements
- Text callouts and arrows
- Scripted in config

### Video Comparison
- Compare demos between versions
- Visual diff highlighting
- Track UI changes over time

### Step-by-Step Export
- Export as HTML player with navigation
- Generate screenshot for each step
- Interactive documentation

---

## Priority Summary

1. **GitHub Action** - Immediate CI/CD value
2. **GIF Export** - Documentation and social sharing
3. **Randomization** - Polish and realism
4. **Parallel Execution** - Scale and performance

---

## Contributing

Have an idea? Open an issue with:
- Feature description
- Use case
- Example config (if applicable)

We welcome contributions for any phase!
